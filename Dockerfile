# Use a small Python image
FROM python:3.11-slim

# Workdir inside the container
WORKDIR /app

# (Optional but good) prevent Python from writing .pyc files / buffering
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the project into the image
COPY . .

# Cloud Run will tell us which port to listen on via $PORT
ENV PORT=8080

# Start FastAPI with uvicorn
# Note: we use a shell command so we can read $PORT
# Use PORT from environment (Cloud Run sets this automatically, usually 8080)
CMD exec uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8080}

