from __future__ import annotations
import os, json, importlib
from pathlib import Path
from typing import Dict, Any, List

import numpy as np
import torch
import torch.nn as nn
import librosa

# --------------------- Config ---------------------
PANN_SR = 32000         # CNN14 expects 32k mono
HIDDEN  = 256           # your head is 2048->256->C

# --------------------- Heads ----------------------
class HeadMLP_TypeA(nn.Module):
    """Sequential: net.0 Linear(2048->256), net.1 ReLU, net.2 Linear(256->C)"""
    def __init__(self, num_classes: int, in_dim: int = 2048, hidden: int = HIDDEN):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(in_dim, hidden),   # net.0
            nn.ReLU(),                   # net.1
            nn.Linear(hidden, num_classes),  # net.2
        )
    def forward(self, emb: torch.Tensor) -> torch.Tensor:
        return self.net(emb)

class HeadMLP_TypeB(nn.Module):
    """Sequential with gap at net.2: net.3 is final Linear(256->C)"""
    def __init__(self, num_classes: int, in_dim: int = 2048, hidden: int = HIDDEN):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(in_dim, hidden),   # net.0
            nn.ReLU(),                   # net.1
            nn.Identity(),               # net.2 (gap in some checkpoints)
            nn.Linear(hidden, num_classes),  # net.3
        )
    def forward(self, emb: torch.Tensor) -> torch.Tensor:
        return self.net(emb)

# --------------------- Utils ----------------------
def _load_json(path: Path):
    with open(path, "r") as f:
        return json.load(f)

def _safe_load_state_dict(model_path: Path) -> Dict[str, Any]:
    """Safe unpickling with allowlist; fallback to classic loader (trusted file)."""
    from torch.serialization import add_safe_globals
    try:
        from torch.torch_version import TorchVersion  # type: ignore
        add_safe_globals([TorchVersion])
    except Exception:
        pass

    state = None
    first_err = None
    try:
        state = torch.load(str(model_path), map_location="cpu", weights_only=True)
    except Exception as e:
        first_err = e
    if state is None:
        try:
            state = torch.load(str(model_path), map_location="cpu")  # trusted checkpoint
        except Exception as e2:
            raise RuntimeError(
                "Failed to load weights safely and classically.\n"
                f"Safe error: {type(first_err).__name__}: {first_err}\n"
                f"Classic error: {type(e2).__name__}: {e2}"
            )

    # unwrap common containers
    if isinstance(state, dict) and any(k in state for k in ("state_dict", "model", "weights")):
        state = state.get("state_dict", state.get("model", state.get("weights", state)))
    if not isinstance(state, dict):
        raise RuntimeError("Loaded object is not a state_dict (TorchScript not supported here).")

    # strip DDP prefix if present
    keys = list(state.keys())
    if keys and all(k.startswith("module.") for k in keys):
        state = {k[len("module."):] : v for k, v in state.items()}
    return state

# ----------------- CNN14 backends -----------------
def _cnn14_via_pip() -> nn.Module:
    """
    Build an embedding module using the PyPI 'panns-inference' package.
    Requires: pip install panns-inference
    """
    try:
        panns = importlib.import_module("panns_inference")
    except Exception as e:
        raise RuntimeError("panns-inference not installed. Run: pip install panns-inference") from e

    class _WrapPipAT(nn.Module):
        def __init__(self):
            super().__init__()
            self.at = panns.AudioTagging(checkpoint_path=None, device="cpu")
        def forward(self, x: torch.Tensor):
            # x: [1, T] @ 32k
            y = x.squeeze(0).detach().cpu().numpy().astype(np.float32)
            outputs = self.at.inference(y)  # some versions don't accept sr=...
            if isinstance(outputs, dict) and "embedding" in outputs:
                emb = outputs["embedding"]             # (1,2048) or (2048,)
            elif isinstance(outputs, (list, tuple)) and len(outputs) >= 2:
                emb = outputs[1]                       # (1,2048) or (2048,)
            else:
                raise RuntimeError("panns-inference .inference() did not return an embedding.")
            emb = np.asarray(emb)
            if emb.ndim == 1:
                emb = emb[None, :]
            return {"embedding": torch.from_numpy(emb).float()}  # [1,2048]
    return _WrapPipAT()

def _load_panns_cnn14() -> nn.Module:
    """
    Try 1) PyPI wrapper (no GitHub), 2) local TorchScript (CNN14_LOCAL_TS), 3) torch.hub.
    Control with env:
      USE_PIP_PANNS=1      -> force PyPI path
      CNN14_LOCAL_TS=path  -> use local TorchScript file if present
      TORCH_HUB_TRUST=1    -> trust_repo=True for hub load
    """
    # Prefer PyPI path when requested
    if os.getenv("USE_PIP_PANNS", "0") == "1":
        try:
            return _cnn14_via_pip()
        except Exception as e:
            print(f"[warn] panns-inference path failed: {e}")

    # Local TorchScript path
    local_ts = os.getenv("CNN14_LOCAL_TS")
    if local_ts and Path(local_ts).is_file():
        try:
            ts = torch.jit.load(local_ts, map_location="cpu")
            ts.eval()
            class _WrapTS(nn.Module):
                def __init__(self, ts_mod): super().__init__(); self.ts = ts_mod
                def forward(self, x):
                    out = self.ts(x)
                    if isinstance(out, dict) and "embedding" in out:
                        return out
                    if isinstance(out, (list, tuple)) and len(out) >= 2:
                        return {"embedding": out[1]}
                    raise RuntimeError("TorchScript CNN14 did not produce an 'embedding'.")
            return _WrapTS(ts)
        except Exception as e:
            print(f"[warn] Failed to load CNN14 TorchScript from {local_ts}: {e}")

    # torch.hub (GitHub)
    trust = os.getenv("TORCH_HUB_TRUST", "1") == "1"
    try:
        repo = "qiuqiangkong/panns-inference:main"
        model = torch.hub.load(repo, "Cnn14", pretrained=True, trust_repo=trust)
        model.eval()
        return model
    except Exception as e_main:
        try:
            repo = "qiuqiangkong/panns-inference"
            model = torch.hub.load(repo, "Cnn14", pretrained=True, trust_repo=trust)
            model.eval()
            return model
        except Exception as e_plain:
            raise RuntimeError(
                "Could not obtain CNN14 (PANNs) by any method.\n"
                "Fix options:\n"
                "  • pip install panns-inference  (and set USE_PIP_PANNS=1)\n"
                "  • Provide a TorchScript file and set CNN14_LOCAL_TS=path\n"
                "  • Ensure GitHub access for torch.hub\n"
                f"Hub errors:\n  main: {type(e_main).__name__}: {e_main}\n  plain: {type(e_plain).__name__}: {e_plain}"
            )

# ------------- wav -> embedding (backend-agnostic) -------------
def _wav_to_embedding(cnn14: nn.Module, wav_path: str) -> torch.Tensor:
    """Load audio, resample to 32k mono, return [1,2048] embedding."""
    y, _ = librosa.load(wav_path, sr=PANN_SR, mono=True)
    x = torch.from_numpy(y).float().unsqueeze(0)  # [1, T]
    with torch.no_grad():
        out = cnn14(x)
        if isinstance(out, dict) and "embedding" in out:
            emb = out["embedding"]
        elif isinstance(out, (list, tuple)) and len(out) >= 2:
            emb = out[1]
        else:
            raise RuntimeError("CNN14 backend did not produce an 'embedding'.")
    # Normalize to tensor [1,2048]
    if isinstance(emb, np.ndarray):
        emb = torch.from_numpy(emb).float()
    if emb.dim() == 0:
        emb = emb.view(1, 1)
    elif emb.dim() == 1:
        emb = emb.unsqueeze(0)
    elif emb.dim() > 2:
        emb = emb.reshape(emb.size(0), -1)
    return emb

# -------------------- Public API -------------------
def from_pretrained(ckpt_dir: str, filename: str | None = None):
    """
    Load ONLY the specified head weights file (no fallback).
    - filename: exact head file (e.g., 'frognet_head_maxprob_a3_k3.pth')
    - if None: uses env FROGNET_WEIGHTS or 'frognet_head_maxprob_a3_k3.pth'
    Returns: (pipeline_model, preprocess_fn, idx_to_class)
    """
    ckpt = Path(ckpt_dir)
    cfg = _load_json(ckpt / "config.json")
    class_to_idx = _load_json(ckpt / "class_to_idx.json")
    idx_to_class = {int(v): k for k, v in class_to_idx.items()}
    num_classes  = len(class_to_idx)

    model_file = filename or os.getenv("FROGNET_WEIGHTS", "frognet_head_maxprob_a3_k3.pth")
    model_path = ckpt / model_file
    if not model_path.is_file():
        raise FileNotFoundError(
            f"Required head weights not found: {model_path}\n"
            f"Set FROGNET_WEIGHTS or pass filename to from_pretrained()."
        )

    # Load head weights
    state = _safe_load_state_dict(model_path)
    keys  = list(state.keys())
    uses_gap = ("net.3.weight" in state) and ("net.2.weight" not in state)

    head = HeadMLP_TypeB(num_classes) if uses_gap else HeadMLP_TypeA(num_classes)
    missing, unexpected = head.load_state_dict(state, strict=True)
    if missing or unexpected:
        raise RuntimeError(
            "State dict mismatch for head-only model.\n"
            f"Missing: {missing}\nUnexpected: {unexpected}\n"
            f"First keys: {keys[:10]}"
        )
    head.eval()

    # Load CNN14 extractor (via PyPI / TS / hub)
    cnn14 = _load_panns_cnn14()

    # Simple pipeline wrapper (robust shapes)
    class Pipeline(nn.Module):
        def __init__(self, extractor: nn.Module, head: nn.Module):
            super().__init__()
            self.extractor = extractor
            self.head = head
        def forward(self, wav_path: str) -> torch.Tensor:
            emb = _wav_to_embedding(self.extractor, wav_path)  # could be np or torch; 1D or 2D

            # --- Normalize to torch.FloatTensor [1, 2048] ---
            if isinstance(emb, np.ndarray):
                emb = torch.from_numpy(emb).float()
            elif not torch.is_tensor(emb):
                raise RuntimeError(f"Unexpected embedding type: {type(emb)}")

            if emb.dim() == 0:
                emb = emb.view(1, 1)
            elif emb.dim() == 1:
                emb = emb.unsqueeze(0)
            elif emb.dim() > 2:
                emb = emb.reshape(emb.size(0), -1)

            if emb.shape[-1] != 2048:
                print(f"[debug] embedding shape {tuple(emb.shape)} (expected last dim 2048)")

            out = self.head(emb)  # should be [1, C]
            if isinstance(out, np.ndarray):
                out = torch.from_numpy(out)
            if out.dim() == 0:
                out = out.view(1, 1)
            elif out.dim() == 1:
                out = out.unsqueeze(0)

            print(f"[debug] head out shape {tuple(out.shape)}")
            return out

    pipeline = Pipeline(cnn14, head)

    def _noop_preprocess(_): return _  # API compatibility
    return pipeline, _noop_preprocess, idx_to_class


def predict_one(
    wav_path: str,
    model: nn.Module,
    _preprocess_unused,
    idx_to_class: Dict[int, str],
    topk: int = 3
):
    """wav_path → embedding → logits → softmax. Robust to any 0D/1D/2D mix."""
    with torch.no_grad():
        logits = model(wav_path)  # expect [1, C]

        if isinstance(logits, np.ndarray):
            logits = torch.from_numpy(logits)

        if not torch.is_tensor(logits):
            raise RuntimeError(f"Unexpected logits type: {type(logits)}")

        # Normalize logits to 2D [1, C]
        if logits.dim() == 0:
            logits = logits.view(1, 1)
        elif logits.dim() == 1:
            logits = logits.unsqueeze(0)
        elif logits.dim() > 2:
            logits = logits.view(logits.size(0), -1)

        # Softmax over the last dimension (works for any C)
        probs_t = torch.softmax(logits, dim=-1)
        probs = probs_t.squeeze(0).cpu().numpy()  # -> (C,)

    print(f"[debug] logits shape {tuple(logits.shape)} -> probs {probs.shape}")

    probs = np.atleast_1d(probs)
    pred_idx  = int(np.argmax(probs))
    pred_name = idx_to_class[pred_idx]
    conf      = float(probs[pred_idx])
    order     = np.argsort(probs)[::-1][:int(topk)]
    topk_out  = [(idx_to_class[int(i)], float(probs[int(i)])) for i in order]
    return pred_name, conf, topk_out
