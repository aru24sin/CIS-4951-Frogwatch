from torch.utils.data import DataLoader, TensorDataset
import torch

def get_data_loaders(client_id):
    # Simulated: replace with actual audio-to-spectrogram conversion later
    X = torch.rand(100, 1, 64, 64)  # Fake spectrograms
    y = torch.randint(0, 5, (100,))
    dataset = TensorDataset(X, y)
    train, test = torch.utils.data.random_split(dataset, [80, 20])
    return DataLoader(train, batch_size=8), DataLoader(test, batch_size=8)
