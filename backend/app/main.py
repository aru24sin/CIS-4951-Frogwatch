from fastapi import FastAPI
from app.routes import audio

app = FastAPI()
app.include_router(audio.router)

@app.get("/")
def read_root():
    return {"message": "FrogWatch Backend is running!"}
