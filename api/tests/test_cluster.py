from pathlib import Path

import pytest

from app.pipeline.cluster import Word, cluster_1d, derive_thresholds, words_to_rows
from app.pipeline.extract import pdf_words

FIX = Path(__file__).resolve().parents[1] / "fixtures"


def test_cluster_1d_splits_on_gap():
    groups = cluster_1d([1.0, 1.2, 5.0, 5.1, 9.0], gap=1.0)
    assert [sorted(g) for g in groups] == [[0, 1], [2, 3], [4]]


def test_cluster_1d_empty():
    assert cluster_1d([], 1.0) == []


def _synthetic(scale: float) -> list[Word]:
    """Same table at two point sizes. Hardcoded thresholds would merge or split."""
    cw, lh = 5 * scale, 10 * scale
    out = []
    for r, cells in enumerate([("Haemoglobin", "10.4", "g/dL", "12.0–15.0"), ("Potassium", "6.3", "mmol/L", "3.5–5.1")]):
        x = 10.0
        for c, text in zip((0, 30, 42, 56), cells):
            x0 = 10 + c * cw
            out.append(Word(text, x0, x0 + len(text) * cw, r * lh * 2, r * lh * 2 + lh))
    return out


@pytest.mark.parametrize("scale", [0.8, 1.0, 1.6])
def test_thresholds_are_derived_from_document(scale):
    words = _synthetic(scale)
    row_gap, col_gap = derive_thresholds(words)
    assert row_gap == pytest.approx(0.6 * 10 * scale)
    assert col_gap == pytest.approx(2 * 5 * scale)
    rows = words_to_rows(words)
    assert rows == [["Haemoglobin", "10.4", "g/dL", "12.0–15.0"], ["Potassium", "6.3", "mmol/L", "3.5–5.1"]]


def test_two_point_sizes_recover_the_same_rows():
    small, _ = pdf_words((FIX / "sample_report.pdf").read_bytes())
    large, _ = pdf_words((FIX / "sample_report_13pt.pdf").read_bytes())
    assert derive_thresholds(small) != derive_thresholds(large)
    assert words_to_rows(small) == words_to_rows(large)
