import torch
import flwr as fl
from model.frognet import FrogNet
from ..utils.data_utils import get_data_loaders

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

class FrogClient(fl.client.NumPyClient):
    def __init__(self, client_id):
        self.model = FrogNet().to(DEVICE)
        self.train_loader, self.test_loader = get_data_loaders(client_id)

    def get_parameters(self, config): 
        return [val.cpu().numpy() for val in self.model.state_dict().values()]

    def set_parameters(self, parameters): 
        state_dict = self.model.state_dict()
        for k, v in zip(state_dict.keys(), parameters):
            state_dict[k] = torch.tensor(v)
        self.model.load_state_dict(state_dict)

    def fit(self, parameters, config):
        self.set_parameters(parameters)
        self.model.train()
        optimizer = torch.optim.Adam(self.model.parameters(), lr=0.001)
        loss_fn = torch.nn.CrossEntropyLoss()

        for x, y in self.train_loader:
            x, y = x.to(DEVICE), y.to(DEVICE)
            optimizer.zero_grad()
            loss = loss_fn(self.model(x), y)
            loss.backward()
            optimizer.step()

        return self.get_parameters(config), len(self.train_loader.dataset), {}

    def evaluate(self, parameters, config):
        self.set_parameters(parameters)
        self.model.eval()
        loss_fn = torch.nn.CrossEntropyLoss()
        correct, loss = 0, 0.0

        with torch.no_grad():
            for x, y in self.test_loader:
                x, y = x.to(DEVICE), y.to(DEVICE)
                pred = self.model(x)
                loss += loss_fn(pred, y).item()
                correct += (pred.argmax(1) == y).sum().item()

        return float(loss), len(self.test_loader.dataset), {"accuracy": correct / len(self.test_loader.dataset)}
