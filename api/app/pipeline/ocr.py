"""OCR path for scans and photos. Optional: install requirements-ocr.txt.

Produces the same Word shape as the digital path so clustering is shared.
"""
from __future__ import annotations

import io

from .cluster import Word
from .extract import ExtractionError


def ocr_words(data: bytes, kind: str) -> list[Word]:
    try:
        from paddleocr import PaddleOCR  # type: ignore
    except ImportError as exc:
        raise ExtractionError(
            "This looks like a scanned report or a photo. Reading scans is not switched on here yet."
        ) from exc

    images = []
    if kind == "pdf":
        from pdf2image import convert_from_bytes  # type: ignore

        images = convert_from_bytes(data, dpi=300)
    else:
        from PIL import Image  # paddleocr depends on pillow

        images = [Image.open(io.BytesIO(data))]

    import numpy as np

    engine = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
    words: list[Word] = []
    y_offset = 0.0
    for img in images:
        result = engine.ocr(np.array(img), cls=True) or []
        for line in result[0] or []:
            box, (text, _conf) = line
            xs = [p[0] for p in box]
            ys = [p[1] for p in box]
            words.append(Word(text, min(xs), max(xs), min(ys) + y_offset, max(ys) + y_offset))
        y_offset += img.height + 50
    if not words:
        raise ExtractionError("We could not find any text in this image.")
    return words
