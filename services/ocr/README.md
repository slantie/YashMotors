# OCR Service

FastAPI microservice for Indian vehicle registration plate recognition and document text extraction. Used during intake to auto-fill the vehicle number from a photo.

## Stack

| Layer | Tech |
|-------|------|
| Framework | FastAPI (Python 3.11) |
| OCR Engine | PaddleOCR (PP-OCRv4) |
| Cloud OCR | AWS Textract (fallback for large docs) |
| Image processing | OpenCV, Pillow |
| Runtime | Uvicorn |

## Environment Variables

```env
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET=...
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Returns `{ status: "ok" }` |
| `POST` | `/ocr` | Extract vehicle number from uploaded image |

### `POST /ocr`

Accepts `multipart/form-data` with field `file` (JPEG/PNG/HEIC). Returns:

```json
{
  "vehicleNumber": "GJ01AB1234",
  "confidence": 0.94,
  "allText": ["GJ01AB1234", "..."]
}
```

**Plate detection logic:**
- Regex: `[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}` (Indian format)
- Confusion map corrects common OCR errors: `0↔O`, `1↔I`, `6↔G`, `8↔B`, `5↔S`
- Minimum confidence threshold: 0.5 (combines adjacent boxes below 0.3)
- Falls back to AWS Textract for images > 5 MB

## First-Run Model Download

PaddleOCR downloads ~400 MB of model weights on first run to `~/.paddleocr/`. The `paddleocr_models` Docker volume persists these across container rebuilds.

**Docker `start_period: 180s`** — the health check allows 3 minutes for model download before marking unhealthy.

## Running

```bash
# Dev
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Production (Docker)
docker compose up ocr
```
