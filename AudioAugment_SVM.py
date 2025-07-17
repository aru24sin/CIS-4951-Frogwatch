#Program Purpose:
#   -Create multiple augmentations from .wav files to create more data, given low amounts of readily available data
#   -Augmentations are similar enough to help model understand classes, but different enough to aid generalizability
#   -Tested using simple SVM

import os
import numpy as np
import librosa
import random
from sklearn import svm
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score

root = r"C:\Users\vnitu\Frog Data"  
num_classes = 8

X = []
y = []

#introduce slight changes to audio to aid generalizability
def augment_audio(y, sr):
    #Return augmented version of the input audio
    aug_y = y.copy()

    #Random augment
    choice = random.choice(['pitch', 'stretch', 'noise'])

    if choice == 'pitch':
        steps = random.uniform(-2, 2)
        aug_y = librosa.effects.pitch_shift(y=aug_y, sr=sr, n_steps=steps)
    elif choice == 'stretch':
        rate = random.uniform(0.8, 1.2)
        aug_y = librosa.effects.time_stretch(y=aug_y, rate=rate)
    elif choice == 'noise':
        noise_amp = 0.005 * np.random.uniform() * np.amax(aug_y)
        aug_y = aug_y + noise_amp * np.random.normal(size=aug_y.shape)

    return aug_y

# Process .wav files for each species according to folder name - species taken from FOTR website
for speciesName in os.listdir(root):
    speciesFolder = os.path.join(root, speciesName)
    if not os.path.isdir(speciesFolder):
        continue

    print(f"Processing species: {speciesName}")

    for wavFile in os.listdir(speciesFolder):
        if not wavFile.endswith('.wav'):
            continue

        file_path = os.path.join(speciesFolder, wavFile)

        try:
            y_audio, sr = librosa.load(file_path, sr=None)
        except Exception as e:
            print(f"Failed to load {file_path}: {e}")
            continue

        #Original file
        mfcc = librosa.feature.mfcc(y=y_audio, sr=sr, n_mfcc=13)
        mfcc_mean = np.mean(mfcc, axis=1)
        X.append(mfcc_mean)
        y.append(speciesName)

        #Augmented files
        for _ in range(num_augmented):
            aug_y = augment_audio(y_audio, sr)
            try:
                mfcc_aug = librosa.feature.mfcc(y=aug_y, sr=sr, n_mfcc=13)
                mfcc_aug_mean = np.mean(mfcc_aug, axis=1)
                X.append(mfcc_aug_mean)
                y.append(speciesName)
            except Exception as e:
                print(f"Failed to extract features from augmented audio: {e}")

#array conversion
X = np.array(X)
y = np.array(y)

print(f"Total samples: {len(X)}")

#Split data
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

#Train SVM
clf = svm.SVC(kernel='rbf', C=1, gamma='scale')
clf.fit(X_train, y_train)

#Evaluate accuracy
y_pred = clf.predict(X_test)
acc = accuracy_score(y_test, y_pred)

print(f"\nTest accuracy: {acc:.2f}")