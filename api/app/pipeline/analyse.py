"""Row -> analysed value: normalise name, choose range, classify.

RANGE PRECEDENCE: the range printed on the patient's own report always wins
(it is assay- and instrument-specific). The curated catalog range keyed by
test + sex + age band is the fallback only. Which one was used is recorded in
ref_source and surfaced in the UI.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass

from ..catalog import get_catalog
from .classify import classify, classify_qualitative
from .normalise import is_auto_matched, match_name


@dataclass
class RowInput:
    raw_name: str
    value_num: float | None = None
    value_text: str | None = None
    unit: str | None = None
    ref_low: float | None = None
    ref_high: float | None = None
    ref_text: str | None = None  # printed qualitative expectation
    has_range: bool = False
    test_id: str | None = None  # user override from the confirm screen


def analyse_row(row: RowInput, sex: str, age: int, report_id: str, patient_id: str,
                report_date: str, value_id: str | None = None) -> dict:
    cat = get_catalog()
    if row.test_id and row.test_id in cat.tests:
        test_id, method, conf, auto = row.test_id, "user", 1.0, False
    else:
        m = match_name(row.raw_name)
        test_id, method, conf, auto = m.test_id, m.method, m.confidence, is_auto_matched(row.raw_name, m)

    base = {
        "id": value_id or str(uuid.uuid4()),
        "report_id": report_id,
        "patient_id": patient_id,
        "report_date": report_date,
        "raw_name": row.raw_name,
        "value_num": row.value_num,
        "value_text": row.value_text,
        "unit": row.unit,
        "match_method": method,
        "match_conf": conf,
        "auto_matched": auto,
    }
    if test_id is None:
        return {**base, "test_id": None, "name": row.raw_name, "loinc": None, "panel": None,
                "ref_low": row.ref_low, "ref_high": row.ref_high, "expected": row.ref_text,
                "ref_source": "report" if row.has_range else "none", "ref_band": None,
                "crit_low": None, "crit_high": None,
                "status": "unrecognised", "deviation": 0.0, "included": False, "implausible": False}

    t = cat.tests[test_id]
    unit = row.unit or t.unit or None
    out = {**base, "test_id": t.id, "name": t.name, "loinc": t.loinc, "panel": t.panel, "unit": unit,
           "decimals": t.decimals, "included": True, "implausible": False}

    if t.kind == "qualitative" or (row.value_num is None and row.value_text):
        expected = row.ref_text or t.expected or "Negative"
        status, dev = classify_qualitative(row.value_text or "", expected)
        return {**out, "ref_low": None, "ref_high": None, "expected": expected,
                "ref_source": "report" if row.ref_text else "catalog", "ref_band": None,
                "crit_low": None, "crit_high": None, "status": status, "deviation": dev}

    if row.has_range and (row.ref_low is not None or row.ref_high is not None):
        low, high, source, band = row.ref_low, row.ref_high, "report", None
    else:
        r = cat.fallback_range(t, sex, age)
        if r and unit and cat.to_row_unit(t, unit, 1.0) is None:
            r = None  # printed in a unit we cannot convert: don't compare apples to oranges
        if r:
            low = cat.to_row_unit(t, unit or t.unit, r.low)
            high = cat.to_row_unit(t, unit or t.unit, r.high)
            source, band = "catalog", {"sex": r.sex, "age_min": r.age_min, "age_max": r.age_max}
        else:
            low = high = None
            source, band = "none", None

    crit_low = cat.to_row_unit(t, unit or t.unit, t.crit_low)
    crit_high = cat.to_row_unit(t, unit or t.unit, t.crit_high)
    implausible = is_implausible(t, unit, row.value_num)
    if row.value_num is None or implausible:
        # An impossible number (e.g. Hb 104 from a dropped decimal point) is a
        # reading or typing error. Ask the user to check it; never raise an alarm.
        status, dev = "unknown", 0.0
    else:
        status, dev = classify(row.value_num, low, high, crit_low, crit_high)
    return {**out, "ref_low": low, "ref_high": high, "expected": None, "ref_source": source,
            "ref_band": band, "crit_low": crit_low, "crit_high": crit_high,
            "status": status, "deviation": dev, "implausible": implausible}


def is_implausible(t, unit: str | None, value: float | None) -> bool:
    if value is None or not t.plausible:
        return False
    cat = get_catalog()
    lo = cat.to_row_unit(t, unit or t.unit, t.plausible[0])
    hi = cat.to_row_unit(t, unit or t.unit, t.plausible[1])
    if lo is None or hi is None:
        return False  # unknown unit: cannot judge
    return not (lo <= value <= hi)
