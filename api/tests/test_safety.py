"""Values that must never be shown as reassuring or as a false alarm."""
from app.pipeline.analyse import RowInput, analyse_row
from app.pipeline.explain import Facts, static_body


def _row(**kw):
    return analyse_row(RowInput(**kw), "F", 70, "r", "p", "2026-09-12")


def test_no_range_is_unknown_not_normal():
    # a unit we cannot convert means no catalog range applies
    v = _row(raw_name="Haemoglobin", value_num=10.4, unit="mmol/L")
    assert v["ref_source"] == "none"
    assert v["status"] == "unknown"


def test_no_range_explanation_does_not_say_within_range():
    body = static_body(Facts("HGB", 10.4, None, "mmol/L", None, None, "unknown", 0))
    assert "within" not in body["what_yours_means"].lower()
    assert "no range" in body["what_yours_means"].lower()


def test_dropped_decimal_is_flagged_for_checking_not_alarmed():
    v = _row(raw_name="Haemoglobin", value_num=104, unit="g/dL", ref_low=12, ref_high=15, has_range=True)
    assert v["implausible"] is True
    assert v["status"] == "unknown"  # no critical banner for an impossible number


def test_real_panic_value_is_still_critical():
    v = _row(raw_name="Potassium", value_num=7.8, unit="mmol/L", ref_low=3.5, ref_high=5.1, has_range=True)
    assert v["implausible"] is False
    assert v["status"] == "critical_high"


def test_plausibility_respects_the_printed_unit():
    # 2.6 lakh/cumm platelets = 260,000/cumm, well inside the plausible range
    v = _row(raw_name="Platelet Count", value_num=2.6, unit="lakh/cumm", ref_low=1.5, ref_high=4.1, has_range=True)
    assert v["implausible"] is False and v["status"] == "normal"
