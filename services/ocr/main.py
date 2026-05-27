import os
import re
import io
import time
import logging
from contextlib import asynccontextmanager

import boto3
import cv2
import numpy as np
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
from PIL import Image, UnidentifiedImageError
from paddleocr import PaddleOCR

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# Indian plate: XX NN(1-2) LLL(1-3) NNNN
PLATE_RE = re.compile(r"[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}")

MAX_DIM = 1920
MAX_BYTES = 10 * 1024 * 1024  # 10 MB
TEXTRACT_MAX_BYTES = 5 * 1024 * 1024  # Textract sync limit
MIN_CONF = 0.5
MIN_CONF_COMBINE = 0.30   # lower bar for multi-box combination pass only
SKIP_WORDS = {"IND", "IN", "INDIA"}

# Positional OCR confusion maps for Indian plates
D2L = str.maketrans({"0": "O", "1": "I", "6": "G", "5": "S", "8": "B", "2": "Z"})
L2D = str.maketrans({"O": "0", "I": "1", "L": "1", "S": "5", "G": "6", "B": "8", "Z": "2"})

reader: PaddleOCR | None = None
_textract_client = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global reader
    logger.info("Loading PaddleOCR model...")
    reader = PaddleOCR(use_angle_cls=True, lang="en", use_gpu=False, show_log=False)
    # Warmup — forces model weights into memory before first real request
    dummy = np.zeros((64, 256, 3), dtype=np.uint8)
    reader.ocr(dummy, cls=True)
    logger.info("PaddleOCR ready.")
    yield


app = FastAPI(title="OCR Service", lifespan=lifespan)


# ── plate normalization ────────────────────────────────────────────────────────

def normalize_indian_plate(raw: str) -> str:
    """Apply positional OCR confusion fixes for Indian plate format:
    [2 letters][1-2 digits][1-3 letters][4 digits]
    """
    t = re.sub(r"[^A-Z0-9]", "", raw.upper())
    if len(t) < 8:
        return t

    out = []
    i = 0

    for _ in range(2):  # state code: must be letters
        c = t[i] if i < len(t) else ""
        out.append(c.translate(D2L))
        i += 1

    for _ in range(2):  # district: must be digits
        if i < len(t):
            c = t[i].translate(L2D)
            if c.isdigit():
                out.append(c)
                i += 1
            else:
                break

    for _ in range(3):  # series: must be letters, leave ≥4 for registration
        if i < len(t) - 4:
            c = t[i].translate(D2L)
            if c.isalpha():
                out.append(c)
                i += 1
            else:
                break

    for c in t[i:]:  # registration: force to digits
        out.append(c.translate(L2D))

    return "".join(out)


def try_extract_plate(text: str) -> str:
    """Try raw text first, then normalized version."""
    clean = re.sub(r"[^A-Z0-9]", "", text.upper())
    m = PLATE_RE.search(clean)
    if m:
        return m.group(0)
    normalized = normalize_indian_plate(clean)
    m = PLATE_RE.search(normalized)
    if m:
        logger.info("  Normalized %r → %r → matched %r", clean, normalized, m.group(0))
        return m.group(0)
    return ""


# ── preprocessing ──────────────────────────────────────────────────────────────

def preprocess(img: Image.Image) -> np.ndarray:
    """Resize to MAX_DIM + CLAHE contrast enhancement for dim/overexposed plates."""
    w, h = img.size
    if max(w, h) > MAX_DIM:
        scale = MAX_DIM / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
        logger.info("  Resized %dx%d → %dx%d", w, h, *img.size)

    arr = np.array(img)

    # CLAHE on the L channel of LAB — boosts local contrast without over-saturating
    lab = cv2.cvtColor(arr, cv2.COLOR_RGB2LAB)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    lab[:, :, 0] = clahe.apply(lab[:, :, 0])
    return cv2.cvtColor(lab, cv2.COLOR_LAB2RGB)


# ── Textract fallback ──────────────────────────────────────────────────────────

def _get_textract_client():
    global _textract_client
    if _textract_client is None:
        _textract_client = boto3.client(
            "textract",
            region_name=os.environ.get("AWS_REGION", "ap-southeast-1"),
        )
    return _textract_client


def _compress_for_textract(data: bytes) -> bytes:
    """Recompress to JPEG if image exceeds Textract's 5 MB sync limit."""
    if len(data) <= TEXTRACT_MAX_BYTES:
        return data
    logger.info("  Image %d bytes > Textract limit, recompressing to JPEG", len(data))
    img = Image.open(io.BytesIO(data)).convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    buf.seek(0)
    result = buf.read()
    logger.info("  Recompressed: %d bytes", len(result))
    return result


def textract_extract_plate(data: bytes) -> tuple[str, float | None]:
    """Call AWS Textract DetectDocumentText, scan LINE blocks for a plate match."""
    client = _get_textract_client()
    image_bytes = _compress_for_textract(data)
    response = client.detect_document_text(Document={"Bytes": image_bytes})

    for block in response.get("Blocks", []):
        if block.get("BlockType") != "LINE":
            continue
        text = block.get("Text", "")
        conf = block.get("Confidence", 0.0) / 100.0  # Textract is 0–100
        logger.info("  [Textract] LINE: %r  conf=%.2f", text, conf)
        found = try_extract_plate(text)
        if found:
            logger.info("  [Textract] MATCHED: %r (conf=%.2f)", found, conf)
            return found, conf

    return "", None


# ── OCR endpoint ───────────────────────────────────────────────────────────────

@app.post("/ocr")
async def ocr_plate(image: UploadFile = File(...)):
    t0 = time.perf_counter()
    logger.info("=== OCR request: filename=%s content_type=%s ===", image.filename, image.content_type)

    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    data = await image.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image too large (max 10 MB)")
    logger.info("  Received %d bytes", len(data))

    try:
        img = Image.open(io.BytesIO(data)).convert("RGB")
    except UnidentifiedImageError:
        raise HTTPException(status_code=400, detail="Invalid image format")
    except Exception:
        raise HTTPException(status_code=400, detail="Cannot decode image")

    arr = preprocess(img)
    logger.info("  Preprocessed shape: %s", arr.shape[:2])

    results = reader.ocr(arr, cls=True)  # type: ignore[union-attr]

    plate = ""
    plate_conf: float | None = None
    all_texts: list[str] = []
    # (x_left, text) for boxes that pass the combination threshold — sorted spatially
    combine_candidates: list[tuple[float, str]] = []
    detection_count = 0

    # PaddleOCR returns list-of-pages; each page: [[bbox, (text, conf)], ...]
    for page in results or []:
        if not page:
            continue
        for line in page:
            bbox, text_conf = line[0], line[1]
            text, conf = text_conf[0], float(text_conf[1])
            logger.info("  detected: %r  conf=%.2f", text, conf)

            clean = re.sub(r"[^A-Z0-9]", "", text.upper())
            if clean in SKIP_WORDS:
                logger.info("  → skipped (plate label word)")
                continue

            # Track any box above combination threshold for spatial multi-box pass
            if conf >= MIN_CONF_COMBINE:
                x_left = min(pt[0] for pt in bbox)
                combine_candidates.append((x_left, text))

            if conf < MIN_CONF:
                logger.info("  → skipped (conf %.2f < %.2f)", conf, MIN_CONF)
                continue

            detection_count += 1
            all_texts.append(text)

            if not plate:
                found = try_extract_plate(text)
                if found:
                    plate = found
                    plate_conf = conf
                    logger.info("  MATCHED: %r (conf=%.2f)", plate, conf)

    if not plate and combine_candidates:
        # Sort left-to-right so plate fragments join in reading order
        combine_candidates.sort(key=lambda t: t[0])
        combined_spatial = "".join(t for _, t in combine_candidates)
        combined_spaced  = " ".join(t for _, t in combine_candidates)
        logger.info(
            "  No single-box match. Trying spatial-combined: %r (from %d boxes, min_conf=%.2f)",
            combined_spatial, len(combine_candidates), MIN_CONF_COMBINE,
        )
        for candidate in (combined_spatial, combined_spaced):
            found = try_extract_plate(candidate)
            if found:
                plate = found
                logger.info("  MATCHED from combined: %r", plate)
                break

    # ── Textract fallback ──────────────────────────────────────────────────────
    source = "paddle" if plate else "none"

    if not plate:
        logger.info("  PaddleOCR found no plate — trying Textract fallback")
        try:
            tx_plate, tx_conf = textract_extract_plate(data)
            if tx_plate:
                plate = tx_plate
                plate_conf = tx_conf
                source = "textract"
                logger.info("  Textract fallback succeeded: %r", plate)
            else:
                logger.info("  Textract found no plate either")
        except Exception as e:
            logger.error("  Textract fallback error: %s", e)

    elapsed_ms = round((time.perf_counter() - t0) * 1000)
    logger.info("=== done %dms plate=%r source=%s ===", elapsed_ms, plate, source)

    return JSONResponse({
        "plate": plate,
        "confidence": plate_conf,
        "raw": " | ".join(all_texts),
        "detection_count": detection_count,
        "processing_time_ms": elapsed_ms,
        "matched": bool(plate),
        "source": source,
    })


# ── health ─────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    if reader is None:
        raise HTTPException(status_code=503, detail="Model not ready")
    try:
        dummy = np.zeros((64, 256, 3), dtype=np.uint8)
        reader.ocr(dummy, cls=False)
        return {"status": "ok", "model": "paddleocr"}
    except Exception as e:
        logger.error("Health check inference failed: %s", e)
        raise HTTPException(status_code=503, detail="Model inference failed")
