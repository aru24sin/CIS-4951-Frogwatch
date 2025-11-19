FROM python:3.11-slim

# Work inside /app in the container
WORKDIR /app

# System deps (minimal)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ffmpeg \
 && rm -rf /var/lib/apt/lists/*

# Install Python deps first (for layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 🔴 Explicitly copy the Firebase service account JSON into /app/backend
COPY backend/frogwatch-backend-firebase-adminsdk-fbsvc-38e9d9024d.json backend/

# Copy the rest of the project source
COPY . .

# Cloud Run sets PORT; default to 8080 if not set
ENV PORT=8080
ENV USE_PIP_PANNS=1


# Start FastAPI app
CMD ["sh", "-c", "uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
