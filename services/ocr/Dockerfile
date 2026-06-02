FROM python:3.11-slim

# libgomp1: required by PaddlePaddle CPU (OpenMP)
# libgl1 + libglib2.0-0: required by OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
        libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --retries 5 --timeout 180 -r requirements.txt

# boto3 in a separate layer — keeps the heavy PaddlePaddle layer cached on rebuilds
RUN pip install --no-cache-dir --retries 5 --timeout 180 "boto3>=1.34.0"

COPY main.py .

EXPOSE 8000
# WEB_CONCURRENCY workers, each loading its own PaddleOCR model — size to container memory
# (default 1). Shell form so the env var expands at runtime.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port 8000 --workers ${WEB_CONCURRENCY:-1}"]
