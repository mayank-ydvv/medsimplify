import pytest

from app.pipeline.parse import parse_cells, parse_range, parse_unit, parse_value


@pytest.mark.parametrize("text,low,high", [
    ("13.0 - 17.0", 13.0, 17.0),
    ("13.0 – 17.0", 13.0, 17.0),   # en-dash
    ("13.0 — 17.0", 13.0, 17.0),   # em-dash
    ("13.0–17.0", 13.0, 17.0),
    ("13.0 to 17.0", 13.0, 17.0),
    ("(0.6 - 1.1)", 0.6, 1.1),
    ("< 200", None, 200.0),
    ("<200", None, 200.0),
    ("> 40", 40.0, None),
    ("≥ 40", 40.0, None),
    ("Upto 35", None, 35.0),
])
def test_numeric_ranges(text, low, high):
    r = parse_range(text)
    assert r is not None, text
    assert (r.low, r.high) == (low, high)


@pytest.mark.parametrize("text", ["Negative", "Nil", "Trace", "NIL", "Absent"])
def test_qualitative_expected(text):
    r = parse_range(text)
    assert r is not None and r.text == text and r.low is None and r.high is None


def test_dash_range_is_never_silently_null():
    """The single most likely source of a silently wrong result."""
    for dash in "-–—−":
        assert parse_range(f"3.5 {dash} 5.1") is not None


def test_values():
    assert parse_value("10.4") == (10.4, None)
    assert parse_value("7,200".replace(",", "")) == (7200.0, None)
    assert parse_value("Trace") == (None, "Trace")
    assert parse_value("2+") == (None, "2+")
    assert parse_value("Pale yellow") == (None, None)


def test_units_keep_display_case():
    assert parse_unit("g/dl") == "g/dL"
    assert parse_unit("uIU/mL") == "µIU/mL"


def test_row_with_fused_value_unit():
    row = parse_cells(["Haemoglobin", "10.4 g/dL", "12.0 – 15.0"])
    assert row and row.value_num == 10.4 and row.unit == "g/dL" and (row.ref_low, row.ref_high) == (12.0, 15.0)


def test_header_like_row_rejected():
    assert parse_cells(["12.5", "g/dL"]) is None


@pytest.mark.parametrize("text,want", [
    ("7,200", 7200.0),          # thousands comma, NOT 7.2
    ("2,60,000", 260000.0),     # Indian lakh grouping
    ("1,50,00,000", 15000000.0),
    ("1,5", 1.5),               # decimal comma
    ("12,34", 12.34),
])
def test_grouping_commas(text, want):
    assert parse_value(text) == (want, None)


@pytest.mark.parametrize("text", ["6.3 H", "6.3H", "6.3 HH", "6.3*", "6.3 *", "↑ 6.3", "6.3 ↑"])
def test_abnormal_flags_are_stripped(text):
    assert parse_value(text) == (6.3, None)


def test_flags_do_not_eat_qualitative_words():
    assert parse_value("NIL") == (None, "NIL")
    assert parse_value("Nil") == (None, "Nil")


def test_grouped_ranges():
    r = parse_range("1,50,000 – 4,10,000")
    assert (r.low, r.high) == (150000.0, 410000.0)
    r = parse_range("4,000 - 11,000")
    assert (r.low, r.high) == (4000.0, 11000.0)


def test_flagged_row_is_not_dropped():
    row = parse_cells(["Potassium", "6.3 H", "mmol/L", "3.5 - 5.1"])
    assert row and row.value_num == 6.3 and (row.ref_low, row.ref_high) == (3.5, 5.1)
