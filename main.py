import multiprocessing
from server.server import start_server
from client.client import FrogClient
import flwr as fl

def start_client(client_id):
    fl.client.start_numpy_client(
        server_address="localhost:8080",
        client=FrogClient(client_id)
    )

if __name__ == "__main__":
    server_process = multiprocessing.Process(target=start_server)
    server_process.start()

    client_ids = [1, 2]
    client_processes = [multiprocessing.Process(target=start_client, args=(cid,)) for cid in client_ids]

    for p in client_processes:
        p.start()

    for p in client_processes:
        p.join()
