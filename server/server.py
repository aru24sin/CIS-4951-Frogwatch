import flwr as fl

def start_server():
    fl.server.start_server(
        server_address="localhost:8080",
        config=fl.server.ServerConfig(num_rounds=3),
        strategy=fl.server.strategy.FedAvg()
    )
