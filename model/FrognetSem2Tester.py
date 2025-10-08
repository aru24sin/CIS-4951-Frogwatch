import os, json, time, math, random
from pathlib import Path
import numpy as np
np.complex = complex  
import librosa
import warnings
import argparse

import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from sklearn.metrics import accuracy_score, confusion_matrix
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

# Arguments (for testing and hyperparameter tuning)
parser = argparse.ArgumentParser()
parser.add_argument("--root_data", type=str, default=r"C:\Users\vnitu\Frog Data")
parser.add_argument("--test_folder", type=str, default="Test Data")
parser.add_argument("--ckpt_dir", type=str, default=os.path.join("checkpoints", "panns-frognet-v1"))

parser.add_argument("--target_sr", type=int, default=32000)
parser.add_argument("--win_sec", type=float, default=2.0)
parser.add_argument("--hop_sec", type=float, default=1.0)
parser.add_argument("--num_aug_win", type=int, default=2)

parser.add_argument("--batch_size", type=int, default=32)
parser.add_argument("--epochs", type=int, default=75)
parser.add_argument("--lr_head", type=float, default=5e-4)
parser.add_argument("--weight_decay", type=float, default=1e-4)
parser.add_argument("--label_smooth", type=float, default=0.05)

#Hyperparamters
parser.add_argument("--agg_method", type=str, choices=["avg", "maxprob", "entropy", "geomean"],
                    default="entropy", help="How to combine window probs into a clip prediction")
parser.add_argument("--agg_alpha", type=float, default=2.0,
                    help="Confidence sharpening (used by maxprob/entropy)")
parser.add_argument("--agg_topk", type=int, default=None,
                    help="If set, use only top-k windows by confidence. Overrides prop.")
parser.add_argument("--agg_topk_prop", type=float, default=0.35,
                    help="If topk not set, use ceil(prop * n_windows) with a minimum")
parser.add_argument("--min_topk", type=int, default=3,
                    help="Minimum top-k when using proportion")
parser.add_argument("--disable_small_clip_topk_threshold", type=int, default=4,
                    help="Disable top-k for clips with <= this many windows")
parser.add_argument("--save_cm_png", type=str, default=None, help="Optional path to save CM PNG")
parser.add_argument("--show_plots", action="store_true", help="Show plots interactively")

#import pretrained NN
parser.add_argument("--pann_ckpt", type=str, default=r"C:\Users\vnitu\panns_data\Cnn14_mAP=0.431.pth")
parser.add_argument("--pann_csv", type=str, default=r"C:\Users\vnitu\panns_data\class_labels_indices.csv")

args = parser.parse_args()

ROOT_DATA   = args.root_data
TEST_FOLDER = args.test_folder
CKPT_DIR    = args.ckpt_dir

TARGET_SR   = args.target_sr
WIN_SEC     = args.win_sec
HOP_SEC     = args.hop_sec
NUM_AUG_WIN = args.num_aug_win

BATCH_SIZE   = args.batch_size
EPOCHS       = args.epochs
LR_HEAD      = args.lr_head
WEIGHT_DECAY = args.weight_decay
LABEL_SMOOTH = args.label_smooth

#Default params
AGG_METHOD   = args.agg_method       #"entropy"
ALPHA        = args.agg_alpha        #2.0
TOPK_FIXED   = args.agg_topk         #None by default
TOPK_PROP    = args.agg_topk_prop    #0.35
MIN_TOPK     = args.min_topk         #3
SMALL_CLIP_DISABLE_TOPK_AT = args.disable_small_clip_topk_threshold  #4

SAVE_CM_PNG = args.save_cm_png
SHOW_PLOTS  = args.show_plots

RNG = np.random.default_rng(1234)

def _preflight_panns():
    missing = []
    if not Path(args.pann_ckpt).exists(): missing.append(args.pann_ckpt)
    if not Path(args.pann_csv).exists():  missing.append(args.pann_csv)
    if missing:
        raise FileNotFoundError("Missing required PANNs file(s):\n  " + "\n  ".join(missing))
_preflight_panns()

warnings.filterwarnings("ignore", message="You are using `torch.load` with `weights_only=False`")

#CNN14 Embeddings
from panns_inference import AudioTagging
_tag_device = 'cuda' if torch.cuda.is_available() else 'cpu'
tagger = AudioTagging(checkpoint_path=args.pann_ckpt, device=_tag_device)

def list_audio_files(folder):
    exts = (".wav", ".mp3", ".m4a")
    return [str(Path(folder, f)) for f in os.listdir(folder) if f.lower().endswith(exts)]

def build_windows_for_file(path, sr=TARGET_SR, win_sec=WIN_SEC, hop_sec=HOP_SEC):
    try:
        dur = librosa.get_duration(path=path, sr=sr)
    except Exception:
        y, _ = librosa.load(path, sr=sr, mono=True)
        dur = len(y) / sr if len(y) else 0.0
    if dur <= 0:
        return []
    starts = np.arange(0.0, max(0.0, dur - win_sec + 1e-6) + 1e-6, hop_sec)
    return [float(s) for s in starts]

def mix_gaussian_snr(wave, snr_db):
    rms = np.sqrt(np.mean(wave**2) + 1e-12)
    noise = RNG.standard_normal(size=wave.shape).astype(np.float32)
    rms_n = np.sqrt(np.mean(noise**2) + 1e-12)
    snr_lin = 10 ** (snr_db / 20.0)
    noise_scaled = noise * (rms / (snr_lin * rms_n + 1e-12))
    out = wave + noise_scaled
    return np.clip(out, -1.0, 1.0)

#Dataset
class WindowedAudioDataset(Dataset):
    def __init__(self, items, class_to_idx, train=True):
        self.items = items
        self.class_to_idx = class_to_idx
        self.train = train

    def __len__(self): return len(self.items)

    def __getitem__(self, i):
        it = self.items[i]
        path, label, start = it["path"], it["label"], it["start"]
        y, sr = librosa.load(path, sr=TARGET_SR, mono=True, offset=start, duration=WIN_SEC)
        if len(y) < int(WIN_SEC * TARGET_SR):
            pad = int(WIN_SEC * TARGET_SR) - len(y)
            y = np.pad(y, (0, pad), mode="constant")

        if self.train:
            gain = 10 ** (RNG.uniform(-6, 6) / 20.0)
            y = np.clip(y * gain, -1.0, 1.0)
            if RNG.random() < 0.7:
                y = mix_gaussian_snr(y, snr_db=RNG.choice([20, 10, 5, 0, -5]))

        y = y.astype(np.float32)
        y_id = self.class_to_idx[label]
        return y, y_id, path

#Handle clips
def _extract_embedding_from_panns_out(out):
    """
    PANNs may return:
      - dict with keys {'embedding', 'clipwise_output'}
      - tuple/list like (clipwise_output, embedding)
      - a single tensor/ndarray
    Return a 1D numpy array of shape [2048].
    """
    #dict case
    if isinstance(out, dict):
        emb = out.get('embedding', None)
        if emb is None and 'feature' in out:
            emb = out['feature']
    #tuple/list case
    elif isinstance(out, (list, tuple)):
        emb = None
        for item in out:
            if torch.is_tensor(item):
                arr = item.detach().cpu().numpy()
            else:
                arr = np.asarray(item)
            if arr.ndim == 2 and arr.shape[-1] == 2048:
                emb = arr
                break
            if arr.ndim == 1 and arr.shape[0] == 2048:
                emb = arr
                break
        if emb is None:
            last = out[-1]
            emb = last.detach().cpu().numpy() if torch.is_tensor(last) else np.asarray(last)
    else:
        emb = out.detach().cpu().numpy() if torch.is_tensor(out) else np.asarray(out)

    emb = np.asarray(emb)
    if emb.ndim == 2 and emb.shape[0] == 1:
        emb = emb[0]
    return emb.astype(np.float32, copy=False)

def collate_to_embeddings(batch):
    waves, labels, paths = zip(*batch)
    embs = []
    for w in waves:
        w = np.asarray(w, dtype=np.float32)
        x = w[np.newaxis, :]  #(1, num_samples)
        out = tagger.inference(x)
        emb = _extract_embedding_from_panns_out(out)
        embs.append(emb)

    embs = torch.tensor(np.stack(embs, axis=0), dtype=torch.float32)
    labels = torch.tensor(labels, dtype=torch.long)
    return embs, labels, list(paths)

#Index data
print("[Indexing dataset]")
train_items, test_items = [], []
species_set = set()

for species in os.listdir(ROOT_DATA):
    species_path = os.path.join(ROOT_DATA, species)
    if not os.path.isdir(species_path):
        continue
    if species == TEST_FOLDER:
        print("[LOAD TEST] folder")
        for sub in os.listdir(species_path):
            sub_path = os.path.join(species_path, sub)
            if not os.path.isdir(sub_path): 
                continue
            files = list_audio_files(sub_path)
            for f in files:
                for st in build_windows_for_file(f):
                    test_items.append({"path": f, "label": sub, "start": st})
                    species_set.add(sub)
        continue

    files = list_audio_files(species_path)
    if not files:
        continue
    print(f"[LOAD TRAIN] {species} ({len(files)} files)")
    for f in files:
        starts = build_windows_for_file(f)
        for st in starts:
            train_items.append({"path": f, "label": species, "start": st})
            for _ in range(NUM_AUG_WIN):
                jitter = float(RNG.uniform(-0.2, 0.2))
                st_aug = max(0.0, st + jitter)
                train_items.append({"path": f, "label": species, "start": st_aug})
        species_set.add(species)

classes = sorted(list(species_set))
class_to_idx = {c: i for i, c in enumerate(classes)}
idx_to_class = {i: c for c, i in class_to_idx.items()}

print(f"\nClasses ({len(classes)}): {classes}")
print(f"Train windows: {len(train_items)} | Test windows: {len(test_items)}")

train_ds = WindowedAudioDataset(train_items, class_to_idx, train=True)
test_ds  = WindowedAudioDataset(test_items,  class_to_idx, train=False)

train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True,
                          num_workers=0, collate_fn=collate_to_embeddings)
test_loader  = DataLoader(test_ds, batch_size=BATCH_SIZE, shuffle=False,
                          num_workers=0, collate_fn=collate_to_embeddings)

#MLP head (2048 --> num_classes)
class Head(nn.Module):
    def __init__(self, num_classes):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(2048, 256),
            nn.ReLU(inplace=True),
            nn.Dropout(0.3),
            nn.Linear(256, num_classes)
        )
    def forward(self, x):
        return self.net(x)

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
head = Head(num_classes=len(classes)).to(device)

#Label smoothing (optional)
if LABEL_SMOOTH > 0:
    class SmoothCE(nn.Module):
        def __init__(self, eps=0.1): super().__init__(); self.eps = eps
        def forward(self, logits, target):
            n = logits.size(1)
            logp = torch.log_softmax(logits, dim=1)
            onehot = torch.zeros_like(logp).scatter_(1, target.unsqueeze(1), 1)
            soft = (1 - self.eps) * onehot + self.eps / n
            return (-soft * logp).sum(dim=1).mean()
    criterion = SmoothCE(LABEL_SMOOTH)
else:
    criterion = nn.CrossEntropyLoss()

optimizer = torch.optim.AdamW(head.parameters(), lr=LR_HEAD, weight_decay=WEIGHT_DECAY)

#Weighted agg helpers
def _entropy(p, eps=1e-12):
    p = np.clip(p, eps, 1.0)
    return -np.sum(p * np.log(p))

def aggregate_probs(plist, method="entropy", alpha=2.0, topk=None, eps=1e-12):
    """
    plist: list of (num_classes,) numpy arrays of probs
    method: "avg" | "maxprob" | "entropy" | "geomean"
    alpha: confidence sharpness (used by maxprob/entropy)
    topk: if set, only use the top-k most confident windows (by weight score)
    """
    P = np.stack(plist, axis=0)  #[n_windows, C]
    n, C = P.shape

    if method == "geomean":
        P = np.clip(P, eps, 1.0)
        logP = np.log(P)
        if topk is not None and topk < n:
            conf = P.max(axis=1)
            idx = np.argsort(-conf)[:topk]
            logP = logP[idx]
        agg = np.exp(np.mean(logP, axis=0))
        agg = agg / np.sum(agg)
        return agg

    #Compute scalar confidence per window
    if method == "avg":
        w = np.ones((n,), dtype=np.float32)
    elif method == "maxprob":
        w = (P.max(axis=1) + eps) ** alpha
    elif method == "entropy":
        norm_ent = np.array([_entropy(p, eps)/np.log(C) for p in P])  #in [0,1]
        conf = 1.0 - norm_ent  #high when distribution is peaky
        w = np.clip(conf, 0.0, 1.0) ** alpha
    else:
        raise ValueError(f"Unknown method: {method}")

    if topk is not None and topk < n:
        idx = np.argsort(-w)[:topk]
        P = P[idx]
        w = w[idx]

    w_sum = np.sum(w) + eps
    agg = np.sum(P * w[:, None], axis=0) / w_sum
    agg = np.maximum(agg, 0.0)
    s = agg.sum()
    if s > 0:
        agg = agg / s
    return agg

def choose_topk_for_clip(n_windows, fixed_k=None, prop=0.35, min_k=3, disable_for_small_at=4):
    """Dynamic top-k rule tuned for ~9 overlapping windows per clip."""
    if n_windows <= disable_for_small_at:
        return None  #don't use top-k at all for tiny clips
    if fixed_k is not None:
        return max(1, min(fixed_k, n_windows))
    k = int(np.ceil(prop * n_windows))
    k = max(min_k, min(k, n_windows))
    return k

#Train loop (head-only)
def run_epoch(loader, train_mode=True):
    head.train(train_mode)
    total_loss, total, correct = 0.0, 0, 0
    with torch.set_grad_enabled(train_mode):
        for embs, labels, _paths in loader:
            embs, labels = embs.to(device), labels.to(device)
            logits = head(embs)
            loss = criterion(logits, labels)
            if train_mode:
                optimizer.zero_grad(); loss.backward(); optimizer.step()
            total_loss += loss.item() * embs.size(0)
            correct += (logits.argmax(1) == labels).sum().item()
            total += labels.size(0)
    return total_loss / max(1, total), correct / max(1, total)

print("\n[Training head on frozen CNN14 embeddings]")
for ep in range(1, EPOCHS + 1):
    tr_loss, tr_acc = run_epoch(train_loader, train_mode=True)
    te_loss, te_acc = run_epoch(test_loader,  train_mode=False)
    print(f"Epoch {ep:02d}/{EPOCHS} | train loss {tr_loss:.4f} acc {tr_acc:.3f} | test acc {te_acc:.3f}")

#Clip level evaluation (conf weighted)
print("\n[Evaluating on Test Data at clip level]")
head.eval()
file_probs, file_labels = {}, {}

with torch.no_grad():
    for embs, labels, paths in test_loader:
        embs = embs.to(device)
        probs = torch.softmax(head(embs), dim=1).cpu().numpy()
        for p, y, path in zip(probs, labels.numpy(), paths):
            file_probs.setdefault(path, []).append(p)
            file_labels[path] = int(y)

y_true, y_pred = [], []
for f, plist in file_probs.items():
    n_w = len(plist)
    k = choose_topk_for_clip(
        n_windows=n_w,
        fixed_k=TOPK_FIXED,
        prop=TOPK_PROP,
        min_k=MIN_TOPK,
        disable_for_small_at=SMALL_CLIP_DISABLE_TOPK_AT
    )
    agg_prob = aggregate_probs(plist, method=AGG_METHOD, alpha=ALPHA, topk=k)
    y_true.append(file_labels[f])
    y_pred.append(int(np.argmax(agg_prob)))

acc_clip = accuracy_score(y_true, y_pred) if len(y_true) else 0.0
print(f"\nFinal CLIP-LEVEL accuracy on '{TEST_FOLDER}': {acc_clip:.3f}")

cm = confusion_matrix(y_true, y_pred, labels=list(range(len(classes)))) if len(y_true) else np.zeros((len(classes), len(classes)), dtype=int)
df_cm = pd.DataFrame(cm, index=[idx_to_class[i] for i in range(len(classes))],
                        columns=[idx_to_class[i] for i in range(len(classes))])
plt.figure(figsize=(10,8))
sns.heatmap(df_cm, annot=True, fmt="d", cmap="Blues")
plt.xlabel("Predicted"); plt.ylabel("Actual")
plt.title(f"Confusion Matrix - Test Data (Clip Level)\nAgg={AGG_METHOD}, alpha={ALPHA}, topk={'None' if TOPK_FIXED is None else TOPK_FIXED} (prop={TOPK_PROP}, min={MIN_TOPK})")
plt.tight_layout()

if SAVE_CM_PNG:
    Path(os.path.dirname(SAVE_CM_PNG) or ".").mkdir(parents=True, exist_ok=True)
    plt.savefig(SAVE_CM_PNG, dpi=200)
    print(f"[Saved confusion matrix to] {SAVE_CM_PNG}")

if SHOW_PLOTS:
    plt.show()
else:
    plt.close()