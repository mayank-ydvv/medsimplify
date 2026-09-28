"""Turn an uploaded file (bytes, in memory only) into positioned words.

Digital PDFs: pdfplumber gives every word with x0, x1, top, bottom.
Scans / photos: rasterise at 300 DPI + OCR (optional extra), same output shape.
The raw bytes are never written to disk.
"""
from __future__ import annotations

import io

from .cluster import Word

MIN_WORDS_FOR_DIGITAL = 15
MAX_PAGES = 30  # lab reports are short; a huge file is almost certainly the wrong one


class ExtractionError(Exception):
    """Raised with a plain-language message safe to show to the user."""


def detect_type(data: bytes, content_type: str | None) -> str:
    if data[:4] == b"%PDF":
        return "pdf"
    if data[:3] == b"\xff\xd8\xff" or data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image"
    if content_type and content_type.startswith("image/"):
        return "image"
    raise ExtractionError("This file is not a PDF or a photo we can read.")


def pdf_words(data: bytes) -> tuple[list[Word], int]:
    import pdfplumber

    words: list[Word] = []
    try:
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            if len(pdf.pages) > MAX_PAGES:
                raise ExtractionError(f"This file has more than {MAX_PAGES} pages. Please upload just the lab report pages.")
            y_offset = 0.0
            for page in pdf.pages:
                for w in page.extract_words(keep_blank_chars=False, use_text_flow=False, x_tolerance=1.5):
                    words.append(Word(w["text"], w["x0"], w["x1"], w["top"] + y_offset, w["bottom"] + y_offset))
                y_offset += float(page.height) + 50  # keep pages from overlapping
            return words, len(pdf.pages)
    except ExtractionError:
        raise
    except Exception as exc:  # pdfminer raises many types on broken files
        raise ExtractionError("We could not open this PDF. It may be damaged or password-protected.") from exc


def extract_words(data: bytes, content_type: str | None) -> tuple[list[Word], str]:
    """Return (words, source_type) where source_type is 'digital' or 'scan'."""
    kind = detect_type(data, content_type)
    if kind == "pdf":
        words, _ = pdf_words(data)
        if len(words) >= MIN_WORDS_FOR_DIGITAL:
            return words, "digital"
    from .ocr import ocr_words  # lazy: optional dependency

    return ocr_words(data, kind), "scan"
