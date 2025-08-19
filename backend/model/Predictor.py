import json, os
import torch, librosa, cv2
import numpy as np

# MATCH TRAINING DATA

def audio_to_spectrogram(y, sr, size):
    mel = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=size[0])
    mel_db = librosa.power_to_db(mel, ref=np.max)
    return cv2.resize(mel_db, tuple(size))

# FROGNET ARCHITECTURE

import torch.nn as nn
class FrogNet(nn.Module):
    def __init__(self, num_classes):
        super().__init__()
        self.conv1 = nn.Conv2d(1, 16, 3, padding=1)
        self.conv2 = nn.Conv2d(16, 32, 3, padding=1)
        self.pool = nn.MaxPool2d(2)
        self.fc1 = nn.Linear(32 * 16 * 16, 64)
        self.fc2 = nn.Linear(64, num_classes)
    def forward(self, x):
        x = self.pool(torch.relu(self.conv1(x)))
        x = self.pool(torch.relu(self.conv2(x)))
        x = x.view(x.size(0), -1)
        x = torch.relu(self.fc1(x))
        return self.fc2(x)

# LOAD PRETRAINED MODEL

def from_pretrained(ckpt_dir):
    #get config and class mapping
    with open(os.path.join(ckpt_dir, "config.json")) as f:
        cfg = json.load(f)
    with open(os.path.join(ckpt_dir, "class_to_idx.json")) as f:
        class_to_idx = json.load(f)
    idx_to_class = {int(v): k for k, v in class_to_idx.items()}

    #get model parameters
    model = FrogNet(num_classes=len(class_to_idx))
    state = torch.load(os.path.join(ckpt_dir, "model.pt"), map_location="cpu")
    model.load_state_dict(state)
    model.eval()

    #make same preprocessing as training data
    sample_rate = cfg.get("sample_rate", None)
    spec_size   = cfg.get("spec_size", [64, 64])

    def preprocess(wav_path):
        y, sr = librosa.load(wav_path, sr=sample_rate)
        spec = audio_to_spectrogram(y, sr, spec_size)
        x = torch.tensor(spec).unsqueeze(0).unsqueeze(0).float()
        return x

    return model, preprocess, idx_to_class

# PREDICT SINGLE SPECIES WITH PRETRAINED MODEL

def predict_one(wav_path, model, preprocess, idx_to_class, topk=3):
    x = preprocess(wav_path)
    with torch.no_grad():
        logits = model(x)
        probs = torch.softmax(logits, dim=1).squeeze(0).numpy()
    pred_idx = int(probs.argmax())
    pred_name = idx_to_class[pred_idx]
    conf = float(probs[pred_idx])
    order = probs.argsort()[::-1][:topk]
    topk_out = [(idx_to_class[int(i)], float(probs[int(i)])) for i in order]
    return pred_name, conf, topk_out