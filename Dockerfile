FROM python:3.11-slim

WORKDIR /app

# Instalar dependencias del sistema
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copiar requirements primero
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar aplicación
COPY . .

# Crear directorio para media
RUN mkdir -p static/media

# Railway establece PORT automáticamente
EXPOSE $PORT

# Usar variable PORT de Railway
CMD uvicorn main:app --host 0.0.0.0 --port $PORT
