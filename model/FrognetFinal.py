import os, random, json, time
import numpy as np
np.complex = complex  
import librosa, cv2

import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader

# CONFIGURATIONS

SPEC_SIZE   = (64, 64)     
N_MELS      = 64           
SAMPLE_RATE = 44100        
NUM_AUG     = 50       #Augmentations per training file to get more data
CKPT_DIR    = os.path.join("checkpoints", "frognet-v1")

# MODEL ARCHITECTURE

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

# SPECTROGRAM DATASET

class SpectrogramDataset(Dataset):
    def __init__(self, data, labels, class_to_idx):
        self.data = data
        self.labels = labels
        self.class_to_idx = class_to_idx
    def __len__(self): return len(self.data)
    def __getitem__(self, idx):
        spec = self.data[idx]
        label = self.class_to_idx[self.labels[idx]]
        return torch.tensor(spec).unsqueeze(0).float(), label

# AUDIO PROCESSING AND AUGMENTATION

def audio_to_spectrogram(y, sr, size=SPEC_SIZE):
    mel_spec = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=size[0])
    mel_spec_db = librosa.power_to_db(mel_spec, ref=np.max)
    mel_spec_resized = cv2.resize(mel_spec_db, size)
    return mel_spec_resized

def augment_audio(y, sr):
    choice = random.choice(['pitch', 'stretch', 'noise'])
    if choice == 'pitch':
        y = librosa.effects.pitch_shift(y, sr=sr, n_steps=random.uniform(-2, 2))
    elif choice == 'stretch':
        y = librosa.effects.time_stretch(y, rate=random.uniform(0.8, 1.2))
    else:
        y = y + 0.005 * np.random.normal(size=y.shape)
    return y

# TRAINING SET

root = r"C:\Users\vnitu\Frog Data"
X_train, y_train = [], []

for speciesName in os.listdir(root):
    if speciesName == "Test Data":  # Skip testing data
        continue
    speciesFolder = os.path.join(root, speciesName)
    if not os.path.isdir(speciesFolder):
        continue

    print(f"[LOAD] Species: {speciesName}")
    for wavFile in os.listdir(speciesFolder):
        if not wavFile.endswith('.wav'):
            continue
        file_path = os.path.join(speciesFolder, wavFile)
        try:
            y_audio, sr = librosa.load(file_path, sr=SAMPLE_RATE)
            # original
            X_train.append(audio_to_spectrogram(y_audio, sr)); y_train.append(speciesName)
            # augmentations
            for _ in range(NUM_AUG):
                aug = augment_audio(y_audio, sr)
                X_train.append(audio_to_spectrogram(aug, sr)); y_train.append(speciesName)
        except Exception as e:
            print(f"[WARN] Failed {file_path}: {e}")

X_train = np.array(X_train)
y_train = np.array(y_train)
print(f"\nTotal training samples (with aug): {len(X_train)}")

# ENCODING
all_species = sorted(set(y_train))
class_to_idx = {s:i for i,s in enumerate(all_species)}
idx_to_class = {i:s for s,i in class_to_idx.items()}
print(f"Classes ({len(all_species)}): {all_species}")

# DATA LOADERS
train_dataset = SpectrogramDataset(X_train, y_train, class_to_idx)
train_loader = DataLoader(train_dataset, batch_size=32, shuffle=True)

# TRAINING CYCLE

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = FrogNet(num_classes=len(all_species)).to(device)
optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
criterion = torch.nn.CrossEntropyLoss()

EPOCHS = 10
for epoch in range(EPOCHS):
    model.train()
    running = 0.0
    correct = total = 0
    for xb, yb in train_loader:
        xb, yb = xb.to(device), yb.to(device)
        optimizer.zero_grad()
        out = model(xb)
        loss = criterion(out, yb)
        loss.backward(); optimizer.step()

        running += loss.item() * xb.size(0)
        pred = out.argmax(1)
        correct += (pred == yb).sum().item()
        total += yb.size(0)
    print(f"Epoch {epoch+1:02d}/{EPOCHS} | loss: {running/len(train_dataset):.4f} | acc: {correct/total:.3f}")

# SAVE MODEL PARAMETERS

os.makedirs(CKPT_DIR, exist_ok=True)

#Save weights
weights_path = os.path.join(CKPT_DIR, "model.pt")
torch.save(model.state_dict(), weights_path)

#Map classes
with open(os.path.join(CKPT_DIR, "class_to_idx.json"), "w") as f:
    json.dump(class_to_idx, f, indent=2)

#Config
config = {
    "architecture": "FrogNet",
    "input_channels": 1,
    "spec_size": list(SPEC_SIZE),
    "n_mels": N_MELS,
    "sample_rate": SAMPLE_RATE,
    "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
}
with open(os.path.join(CKPT_DIR, "config.json"), "w") as f:
    json.dump(config, f, indent=2)

print("\nSaved checkpoint to:")
print("  ", weights_path)
print("   ", os.path.join(CKPT_DIR, "class_to_idx.json"))
print("   ", os.path.join(CKPT_DIR, "config.json"))