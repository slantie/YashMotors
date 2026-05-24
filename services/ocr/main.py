import re
import io
import time
import logging

import easyocr
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
from PIL import Image
import numpy as np

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="OCR Service")

# Indian plate: XX NN(1-2) LLL(1-3) NNNN
PLATE_RE = re.compile(r"[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}")

MAX_DIM = 1920

# Common OCR confusion maps (positional: letter slots vs digit slots)
D2L = str.maketrans({'0': 'O', '1': 'I', '6': 'G', '5': 'S', '8': 'B', '2': 'Z'})
L2D = str.maketrans({'O': '0', 'I': '1', 'L': '1', 'S': '5', 'G': '6', 'B': '8', 'Z': '2'})

logger.info("Loading EasyOCR reader...")
reader = easyocr.Reader(["en"], gpu=False, verbose=False)
logger.info("EasyOCR ready.")


def normalize_indian_plate(raw: str) -> str:
    """
    Apply positional OCR confusion fixes for Indian plate format:
      [2 letters][1-2 digits][1-3 letters][4 digits]
    """
    t = re.sub(r"[^A-Z0-9]", "", raw.upper())
    if len(t) < 8:
        return t

    out = []
    i = 0

    # State code: 2 must-be-letters
    for _ in range(2):
        c = t[i] if i < len(t) else ""
        out.append(c.translate(D2L))
        i += 1

    # District code: 1-2 must-be-digits
    for _ in range(2):
        if i < len(t):
            c = t[i].translate(L2D)
            if c.isdigit():
                out.append(c)
                i += 1
            else:
                break

    # Series: 1-3 must-be-letters (leave ≥4 chars for registration)
    for _ in range(3):
        if i < len(t) - 4:
            c = t[i].translate(D2L)
            if c.isalpha():
                out.append(c)
                i += 1
            else:
                break

    # Registration: remaining → force to digits
    for c in t[i:]:
        out.append(c.translate(L2D))

    return "".join(out)


def try_extract_plate(text: str) -> str:
    """Try raw text, then normalized version."""
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


def resize_if_needed(img: Image.Image) -> Image.Image:
    w, h = img.size
    if max(w, h) > MAX_DIM:
        scale = MAX_DIM / max(w, h)
        new_size = (int(w * scale), int(h * scale))
        img = img.resize(new_size, Image.LANCZOS)
        logger.info("  Resized %sx%s → %sx%s", w, h, *new_size)
    return img


@app.post("/ocr")
async def ocr_plate(image: UploadFile = File(...)):
    t0 = time.perf_counter()
    logger.info("=== OCR request: filename=%s ===", image.filename)

    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    data = await image.read()
    logger.info("  Received %d bytes", len(data))

    try:
        img = Image.open(io.BytesIO(data)).convert("RGB")
        logger.info("  Image size=%s", img.size)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Cannot decode image: {e}")

    img = resize_if_needed(img)
    arr = np.array(img)

    results = reader.readtext(arr, detail=1, paragraph=False)

    plate = ""
    all_texts: list[str] = []
    SKIP_WORDS = {"IND", "IN", "INDIA"}
    MIN_CONF = 0.5

    for (bbox, text, conf) in results:
        logger.info("  detected: %r  conf=%.2f", text, conf)
        clean = re.sub(r"[^A-Z0-9]", "", text.upper())
        if conf < MIN_CONF:
            logger.info("  → skipped (conf %.2f < %.2f)", conf, MIN_CONF)
            continue
        if clean in SKIP_WORDS:
            logger.info("  → skipped (plate label)")
            continue
        all_texts.append(text)
        found = try_extract_plate(text)
        if found:
            plate = found
            logger.info("  MATCHED from single box: %r", plate)
            break

    if not plate:
        combined = " ".join(all_texts)
        logger.info("  No single-box match. Trying combined: %r", combined)
        plate = try_extract_plate(combined)
        if plate:
            logger.info("  MATCHED from combined: %r", plate)

    if not plate:
        logger.info("  ALL PASSES FAILED")

    logger.info("=== done %.2fs plate=%r ===", time.perf_counter() - t0, plate)
    return JSONResponse({"plate": plate, "raw": " | ".join(all_texts)})


@app.get("/health")
def health():
    return {"status": "ok"}
