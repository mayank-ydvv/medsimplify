import json

import pytest

from app.catalog import SHARED
from app.pipeline.classify import classify, classify_qualitative

CASES = json.loads((SHARED / "classify_cases.json").read_text())


@pytest.mark.parametrize("c", CASES["numeric"], ids=lambda c: c["name"])
def test_numeric_vectors(c):
    status, dev = classify(c["value"], c["low"], c["high"], c["crit_low"], c["crit_high"])
    assert status == c["status"]
    assert dev == pytest.approx(c["deviation"], abs=1e-3)


@pytest.mark.parametrize("c", CASES["qualitative"], ids=lambda c: c["name"])
def test_qualitative_vectors(c):
    status, dev = classify_qualitative(c["value"], c["expected"])
    assert status == c["status"]
    assert dev == c["deviation"]


def test_critical_is_checked_before_ordinary_abnormal():
    # 6.3 is also > 5.1 (high); it must never be reported as merely "high"
    assert classify(6.3, 3.5, 5.1, 2.5, 6.0)[0] == "critical_high"


def test_one_sided_ranges_do_not_crash():
    assert classify(171, None, 100)[0] == "high"
    assert classify(30, 40, None)[0] == "low"
