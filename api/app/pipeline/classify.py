"""Deterministic classification. Never a model.

Critical thresholds are checked FIRST so a panic value can never be reported as
a mild abnormality. Deviation is the distance outside the range divided by the
bound that was crossed (falls back to range width when that bound is 0), so it
works for one-sided ranges and does not under-call lows on wide ranges. The 10%
borderline band stops the app alarming people about a value a hair outside.
"""
from __future__ import annotations

import re

BORDERLINE = 0.10


def _denom(bound: float, low: float | None, high: float | None) -> float:
    if bound != 0:
        return abs(bound)
    if low is not None and high is not None and high != low:
        return high - low
    return 1.0


def deviation(value: float, low: float | None, high: float | None) -> float:
    if low is not None and value < low:
        return (low - value) / _denom(low, low, high)
    if high is not None and value > high:
        return (value - high) / _denom(high, low, high)
    return 0.0


def classify(value: float, ref_low: float | None, ref_high: float | None,
             crit_low: float | None = None, crit_high: float | None = None) -> tuple[str, float]:
    dev = round(deviation(value, ref_low, ref_high), 4)
    if crit_low is not None and value <= crit_low:
        return "critical_low", dev
    if crit_high is not None and value >= crit_high:
        return "critical_high", dev
    if ref_low is None and ref_high is None:
        # Nothing to compare with. Never call this "normal": that would be
        # reassurance the data does not support.
        return "unknown", 0.0
    if ref_low is not None and value < ref_low:
        return ("borderline_low" if dev < BORDERLINE else "low"), dev
    if ref_high is not None and value > ref_high:
        return ("borderline_high" if dev < BORDERLINE else "high"), dev
    return "normal", 0.0


# Qualitative results (urine dipstick etc.) are stored as text and compared
# against an expected result on an ordinal scale, NOT a numeric range.
_ORDINAL = {
    "nil": 0, "negative": 0, "neg": 0, "absent": 0, "not detected": 0, "none": 0,
    "trace": 1, "traces": 1,
    "1+": 2, "+": 2, "positive": 2, "present": 2, "pos": 2, "detected": 2,
    "2+": 3, "++": 3,
    "3+": 4, "+++": 4,
    "4+": 5, "++++": 5,
}


def qualitative_rank(text: str) -> int | None:
    key = re.sub(r"\s+", " ", text.strip().lower()).rstrip(".")
    key = re.sub(r"^(?:positive|present)\s*\(?\s*([1-4]\+)\s*\)?$", r"\1", key)
    return _ORDINAL.get(key)


def classify_qualitative(value_text: str, expected: str) -> tuple[str, float]:
    got, want = qualitative_rank(value_text), qualitative_rank(expected)
    if got is None or want is None:
        return "unknown", 0.0
    steps = got - want
    if steps <= 0:
        return "normal", 0.0
    if steps == 1:
        return "borderline_high", 1.0
    return "high", float(steps)


def is_qualitative_token(text: str) -> bool:
    return qualitative_rank(text) is not None
