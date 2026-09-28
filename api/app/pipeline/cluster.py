"""Recover table structure from word coordinates by 1-D gap clustering.

Sort the coordinates, split wherever the gap exceeds a threshold. O(n log n),
no model, no training data. Both thresholds are DERIVED from the document:
  rows:    ~0.6 x median line height
  columns: ~2   x median character width
Never hardcoded: a different point size would silently merge columns.
"""
from __future__ import annotations

from dataclasses import dataclass
from statistics import median


@dataclass(frozen=True)
class Word:
    text: str
    x0: float
    x1: float
    top: float
    bottom: float

    @property
    def cy(self) -> float:
        return (self.top + self.bottom) / 2


def cluster_1d(values: list[float], gap: float) -> list[list[int]]:
    """Group indices of `values` so that consecutive sorted values closer than
    `gap` share a group. Returns groups of original indices, in sorted order."""
    if not values:
        return []
    order = sorted(range(len(values)), key=lambda i: values[i])
    groups: list[list[int]] = [[order[0]]]
    for prev, cur in zip(order, order[1:]):
        if values[cur] - values[prev] > gap:
            groups.append([])
        groups[-1].append(cur)
    return groups


def derive_thresholds(words: list[Word]) -> tuple[float, float]:
    heights = [w.bottom - w.top for w in words if w.bottom > w.top]
    char_w = [(w.x1 - w.x0) / len(w.text) for w in words if w.text and w.x1 > w.x0]
    line_h = median(heights) if heights else 10.0
    cw = median(char_w) if char_w else 5.0
    return 0.6 * line_h, 2.0 * cw


def words_to_rows(words: list[Word]) -> list[list[str]]:
    """Rows by vertical centre; within each row, join words into cells wherever
    the horizontal gap is smaller than the column threshold."""
    if not words:
        return []
    row_gap, col_gap = derive_thresholds(words)
    rows: list[list[str]] = []
    for group in cluster_1d([w.cy for w in words], row_gap):
        line = sorted((words[i] for i in group), key=lambda w: w.x0)
        cells: list[list[Word]] = [[line[0]]]
        for prev, cur in zip(line, line[1:]):
            if cur.x0 - prev.x1 > col_gap:
                cells.append([])
            cells[-1].append(cur)
        rows.append([" ".join(w.text for w in c) for c in cells])
    return rows


def column_count(words: list[Word]) -> int:
    """Number of distinct column starts across the document (used by tests)."""
    _, col_gap = derive_thresholds(words)
    starts: list[float] = []
    row_gap, _ = derive_thresholds(words)
    for group in cluster_1d([w.cy for w in words], row_gap):
        line = sorted((words[i] for i in group), key=lambda w: w.x0)
        starts.append(line[0].x0)
        for prev, cur in zip(line, line[1:]):
            if cur.x0 - prev.x1 > col_gap:
                starts.append(cur.x0)
    return len(cluster_1d(starts, col_gap * 2))
