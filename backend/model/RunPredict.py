import sys, json, argparse
from Predictor import from_pretrained, predict_one

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("wav", help="Path to .wav file")
    ap.add_argument("--ckpt", required=True,
                    help="Checkpoint directory containing config.json, class_to_idx.json, and weights")
    ap.add_argument("--weights", default="frognet_head_maxprob_a3_k3.pth",
                    help="Weights filename inside --ckpt (default: frognet_head_maxprob_a3_k3.pth). No fallback.")
    ap.add_argument("--topk", type=int, default=3)
    ap.add_argument("--device", default="cpu", choices=["cpu", "cuda"])
    args = ap.parse_args()

    try:
        model, preprocess, idx_to_class, used_weights = from_pretrained(
            args.ckpt, weights_file=args.weights, map_location=args.device
        )
        name, conf, topk = predict_one(args.wav, model, preprocess, idx_to_class, topk=args.topk)
        out = {
            "status": "ok",
            "weights": used_weights,
            "prediction": {"label": name, "confidence": round(conf, 6)},
            "topk": [{"label": l, "confidence": round(c, 6)} for (l, c) in topk]
        }
        print(json.dumps(out))
        sys.exit(0)

    except FileNotFoundError as e:
        err = {"status": "error", "type": "FileNotFoundError", "message": str(e)}
    except RuntimeError as e:
        err = {"status": "error", "type": "RuntimeError", "message": str(e)}
    except Exception as e:
        err = {"status": "error", "type": e.__class__.__name__, "message": str(e)}

    # Non-zero exit so your FastAPI or caller can detect failure
    print(json.dumps(err))
    sys.exit(2)

if __name__ == "__main__":
    main()
