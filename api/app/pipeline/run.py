"""The full synchronous pipeline for one upload. No job queue.

Upload -> detect type -> words with coordinates -> cluster into rows/columns
       -> parse value/unit/range -> normalise name -> classify -> (explain on read)
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field

from .analyse import RowInput
from .cluster import words_to_rows
from .extract import ExtractionError, extract_words
from .parse import parse_cells

DATE_RE = re.compile(r"\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\b|\b(\d{4})-(\d{2})-(\d{2})\b")
HEADER_WORDS = {"test", "investigation", "parameter", "result", "value", "unit", "units",
                "reference", "range", "interval", "biological", "normal", "observed"}


@dataclass
class PipelineResult:
    file_hash: str
    source_type: str
    rows: list[RowInput]
    status: str  # "parsed" | "parse_failed"
    notes: dict = field(default_factory=dict)
    report_date: str | None = None
    lab_name: str | None = None


def _is_header(cells: list[str]) -> bool:
    words = {w.lower().strip(":") for c in cells for w in c.split()}
    return len(words & HEADER_WORDS) >= 2


PIPELINE_TIMEOUT_S = 20.0
_pool = None


def _executor():
    """A separate process isolates the PDF parser: a malformed or hostile file
    can hang or crash pdfminer, and must not take the API down with it."""
    global _pool
    if _pool is None:
        from concurrent.futures import ProcessPoolExecutor
        import multiprocessing as mp

        _pool = ProcessPoolExecutor(max_workers=2, mp_context=mp.get_context("spawn"))
    return _pool


async def run_pipeline_isolated(data: bytes, content_type: str | None,
                                timeout: float = PIPELINE_TIMEOUT_S) -> PipelineResult:
    import asyncio
    from concurrent.futures.process import BrokenProcessPool

    global _pool
    file_hash = hashlib.sha256(data).hexdigest()
    loop = asyncio.get_running_loop()
    try:
        fut = loop.run_in_executor(_executor(), run_pipeline, data, content_type)
        return await asyncio.wait_for(fut, timeout)
    except (asyncio.TimeoutError, TimeoutError):
        _reset_pool()
        return PipelineResult(file_hash, "unknown", [], "parse_failed",
                              {"reason": "This file took too long to read. It may be damaged or very large."})
    except BrokenProcessPool:
        _reset_pool()
        return PipelineResult(file_hash, "unknown", [], "parse_failed",
                              {"reason": "We could not open this file. It may be damaged."})


def _reset_pool() -> None:
    """A stuck worker cannot be cancelled, so the whole pool is replaced."""
    global _pool
    if _pool is not None:
        for p in list(getattr(_pool, "_processes", {}).values()):
            p.kill()
        _pool.shutdown(wait=False, cancel_futures=True)
        _pool = None


def run_pipeline(data: bytes, content_type: str | None) -> PipelineResult:
    file_hash = hashlib.sha256(data).hexdigest()  # kept ONLY to detect re-uploads
    try:
        words, source_type = extract_words(data, content_type)
    except ExtractionError as exc:
        return PipelineResult(file_hash, "unknown", [], "parse_failed", {"reason": str(exc)})

    table = words_to_rows(words)
    rows: list[RowInput] = []
    skipped = 0
    # Lines that look like results (a word and a number) but did not parse.
    # They are shown on the confirm screen so nothing disappears silently.
    unread: list[str] = []
    report_date = lab_name = None
    for cells in table:
        text = " ".join(cells)
        if report_date is None and (m := DATE_RE.search(text)) and re.search(r"date|reported|collected", text, re.I):
            if m.group(4):
                report_date = f"{m.group(4)}-{m.group(5)}-{m.group(6)}"
            else:
                report_date = f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
        if lab_name is None and re.search(r"(labs?|diagnostics|healthcare|pathology)\b", text, re.I) and len(cells) <= 2:
            lab_name = cells[0].strip()
        if _is_header(cells):
            continue
        parsed = parse_cells(cells)
        if parsed is None:
            skipped += 1
            # table-like: a named first cell and a digit in some later cell
            if len(cells) >= 2 and re.search(r"[A-Za-z]{2}", cells[0]) \
                    and any(re.search(r"\d", c) for c in cells[1:]) and not DATE_RE.search(text):
                unread.append(text.strip()[:120])
            continue
        rows.append(RowInput(**parsed.__dict__))

    notes = {"rows_found": len(rows), "lines_skipped": skipped, "words": len(words), "unread": unread[:25]}
    status = "parsed" if len(rows) >= 3 else "parse_failed"
    if status == "parse_failed":
        notes["reason"] = "We couldn't read this layout."
    return PipelineResult(file_hash, source_type, rows, status, notes, report_date, lab_name)
