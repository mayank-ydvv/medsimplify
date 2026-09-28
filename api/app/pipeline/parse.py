"""Parse value, unit and reference range out of a recovered table row.

Range regexes accept the ASCII hyphen AND the en-dash (–) and em-dash (—).
Indian lab reports use them routinely; missing them makes ranges parse as
null, so abnormal values silently read as normal.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from .classify import is_qualitative_token

DASH = r"[-‐‑‒–—−]"  # hyphen, non-breaking hyphen, figure dash, en, em, minus
NUM = r"\d+(?:[.,]\d+)?"

RANGE_BETWEEN = re.compile(rf"^\(?\s*({NUM})\s*(?:{DASH}|to)\s*({NUM})\s*\)?$", re.I)
RANGE_LT = re.compile(rf"^\(?\s*(?:<|≤|<=|upto|up to|less than|below)\s*({NUM})\s*\)?$", re.I)
RANGE_GT = re.compile(rf"^\(?\s*(?:>|≥|>=|more than|above|greater than)\s*({NUM})\s*\)?$", re.I)
VALUE_RE = re.compile(rf"^([<>]?)\s*({NUM})$")

KNOWN_UNITS = [
    "g/dL", "g/dl", "mg/dL", "mg/dl", "U/L", "IU/L", "u/l", "iu/l", "mmol/L", "mEq/L", "µIU/mL", "uIU/mL", "mIU/L",
    "ng/mL", "ng/ml", "pg/mL", "pg/ml", "ng/dL", "µg/dL", "ug/dL", "mcg/dL", "fL", "fl", "pg", "%", "mm/hr",
    "mg/L", "/cumm", "cells/cumm", "lakh/cumm", "lakhs/cumm", "million/cumm", "mill/cumm", "thou/cumm",
    "10^3/µL", "10^6/µL", "mL/min/1.73m²", "mL/min/1.73m2", "µmol/L", "nmol/L", "pmol/L", "ratio", "pH",
]
_UNIT_KEYS: dict[str, str] = {}
for _u in KNOWN_UNITS:  # first spelling wins, so "g/dl" displays as "g/dL"
    _UNIT_KEYS.setdefault(_u.lower().replace("µ", "u"), _u)


# Digit-grouping commas: "7,200" (thousands) and "2,60,000" (Indian lakh
# grouping). A comma is a grouping comma when it is followed by zero or more
# two-digit groups and then exactly three digits. Anything else ("1,5") is a
# decimal comma. Getting this wrong turned a WBC of 7,200 into 7.2.
_GROUPING_COMMA = re.compile(r"(?<=\d),(?=(?:\d{2},)*\d{3}(?!\d))")

# Abnormal-value flags labs print next to the number: "6.3 H", "6.3*", "↑ 6.3".
_FLAG = re.compile(r"^\s*(?:[↑↓*]+\s*)?(.*?)(?:\s*(?:(?<![A-Za-z])(?:HH|LL|H|L)|[↑↓*]+))?\s*$")


def ungroup(text: str) -> str:
    return _GROUPING_COMMA.sub("", text)


def strip_flag(text: str) -> str:
    m = _FLAG.match(text)
    return m.group(1) if m else text


def _num(s: str) -> float:
    return float(s.replace(",", "."))


@dataclass
class ParsedRange:
    low: float | None
    high: float | None
    text: str | None = None  # qualitative expected ("Negative", "Nil")


def parse_range(text: str) -> ParsedRange | None:
    t = ungroup(text.strip())
    if not t:
        return None
    if m := RANGE_BETWEEN.match(t):
        return ParsedRange(_num(m.group(1)), _num(m.group(2)))
    if m := RANGE_LT.match(t):
        return ParsedRange(None, _num(m.group(1)))
    if m := RANGE_GT.match(t):
        return ParsedRange(_num(m.group(1)), None)
    if is_qualitative_token(t):
        return ParsedRange(None, None, t)
    return None


def parse_value(text: str) -> tuple[float | None, str | None]:
    """Return (numeric value, qualitative text). Exactly one is set, or neither."""
    t = ungroup(strip_flag(text.strip())).replace(" ", "")
    if m := VALUE_RE.match(t):
        return _num(m.group(2)), None
    if is_qualitative_token(text):
        return None, text.strip()
    return None, None


def parse_unit(text: str) -> str | None:
    key = text.strip().lower().replace("µ", "u").replace("μ", "u")
    if key in _UNIT_KEYS:
        return _UNIT_KEYS[key].replace("uIU", "µIU").replace("ug/", "µg/")
    return None


@dataclass
class ParsedRow:
    raw_name: str
    value_num: float | None
    value_text: str | None
    unit: str | None
    ref_low: float | None
    ref_high: float | None
    ref_text: str | None
    has_range: bool


def parse_cells(cells: list[str]) -> ParsedRow | None:
    """Interpret a row of column cells. Column order varies between labs, so we
    classify each cell by what it looks like rather than by position:
    first text cell = name, first value-like cell after it = value, etc."""
    cells = [c.strip() for c in cells if c and c.strip()]
    if len(cells) < 2:
        return None
    name = cells[0]
    if not re.search(r"[A-Za-z]", name) or VALUE_RE.match(name.replace(" ", "")):
        return None
    value_num = value_text = unit = None
    rng: ParsedRange | None = None
    for cell in cells[1:]:
        if value_num is None and value_text is None:
            v, vt = parse_value(cell)
            if v is not None or vt is not None:
                value_num, value_text = v, vt
                continue
        if unit is None and (u := parse_unit(cell)):
            unit = u
            continue
        if rng is None and (r := parse_range(cell)):
            rng = r
            continue
        # value and unit fused together, e.g. "10.4 g/dL"
        if value_num is None and value_text is None:
            m = re.match(rf"^({NUM})\s*(\S+)$", cell)
            if m and parse_unit(m.group(2)):
                value_num, unit = _num(m.group(1)), parse_unit(m.group(2))
                continue
    if value_num is None and value_text is None:
        return None
    return ParsedRow(
        raw_name=name,
        value_num=value_num,
        value_text=value_text,
        unit=unit,
        ref_low=rng.low if rng else None,
        ref_high=rng.high if rng else None,
        ref_text=rng.text if rng else None,
        has_range=bool(rng and (rng.low is not None or rng.high is not None or rng.text)),
    )
