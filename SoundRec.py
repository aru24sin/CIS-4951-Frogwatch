import sounddevice as sd
from scipy.io.wavfile import write, read
import matplotlib.pyplot as plt
import numpy as np

#Recording Settings
fs = 44100  #Sampling rate
seconds = 10  #Duration
filename = "output.wav"

#Record Audio
print("Recording Started")
recording = sd.rec(int(seconds * fs), samplerate=fs, channels=1, dtype='int16')
sd.wait()
print("Recording Complete")

#Save to file (.wav)
write(filename, fs, recording)
print(f"Audio saved as {filename}")

#Load file
sample_rate, samples = read(filename)

#Convert to mono
if samples.ndim > 1:
    samples = samples[:, 0]

#Spectrogram plot
plt.figure(figsize=(10, 4))
plt.specgram(samples, Fs=sample_rate, NFFT=1024, noverlap=512, cmap='viridis')
plt.xlabel('Time [s]')
plt.ylabel('Frequency [Hz]')
plt.title('Spectrogram of Recorded Audio')
plt.colorbar(label='Intensity [dB]')
plt.tight_layout()
plt.show()