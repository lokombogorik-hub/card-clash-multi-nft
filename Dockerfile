FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# system deps (psycopg3 sometimes needs libpq)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq5 \
    curl \
  && rm -rf /var/lib/apt/lists/*

# install python deps
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# copy backend code
COPY backend /app

# Railway sets PORT
ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]