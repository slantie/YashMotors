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
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download PaddleOCR models and run a warmup inference at build time.
# Bakes models into the image — first request is fast, not a cold-start download.
RUN python -c "\
from paddleocr import PaddleOCR; \
import numpy as np; \
ocr = PaddleOCR(use_angle_cls=True, lang='en', use_gpu=False, show_log=False); \
ocr.ocr(np.zeros((64, 256, 3), dtype=np.uint8), cls=True); \
print('PaddleOCR model pre-loaded OK')"

COPY main.py .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
