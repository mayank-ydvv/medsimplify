import pytest

from app.pipeline.normalise import is_auto_matched, match_name


@pytest.mark.parametrize("raw,test_id", [
    ("SGPT", "ALT"), ("S.G.P.T", "ALT"), ("SGPT (ALT)", "ALT"), ("Alanine Aminotransferase", "ALT"),
    ("SGOT", "AST"), ("S.G.O.T", "AST"),
    ("Sr. Creatinine", "CREAT"), ("Serum Creatinine", "CREAT"),
    ("Vit. D (25-OH)", "VITD"), ("25-OH Vitamin D", "VITD"),
    ("Haemoglobin", "HGB"), ("Hemoglobin", "HGB"), ("Hb", "HGB"), ("HGB", "HGB"),
    ("Total WBC Count", "WBC"), ("HbA1c", "HBA1C"), ("Serum Ferritin", "FERR"),
])
def test_known_names(raw, test_id):
    assert match_name(raw).test_id == test_id


@pytest.mark.parametrize("raw,test_id", [("Heamoglobin", "HGB"), ("Trigylcerides", "TG"), ("Creatinin", "CREAT")])
def test_fuzzy_corrections_are_flagged(raw, test_id):
    m = match_name(raw)
    assert m.test_id == test_id and m.method == "fuzzy" and m.confidence >= 0.85
    assert is_auto_matched(raw, m)


def test_punctuated_alias_is_flagged_but_plain_alias_is_not():
    assert is_auto_matched("S.G.P.T", match_name("S.G.P.T"))
    assert not is_auto_matched("SGPT", match_name("SGPT"))


def test_unmatched():
    m = match_name("Homocysteine")
    assert m.test_id is None and m.method == "unmatched"
