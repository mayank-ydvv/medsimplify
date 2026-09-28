"""Map a printed test name onto a catalog test.

In order:
  1. exact hash lookup on a normalised key            O(1)
  2. alias table lookup                                O(1)
  3. trigram retrieval + Levenshtein via rapidfuzz, cutoff 85
  4. unmatched -> surfaced on the confirm screen, logged for alias curation
"""
from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass
from functools import lru_cache

from rapidfuzz import fuzz, process

from ..catalog import get_catalog, normalise_key

log = logging.getLogger("medsimplify.normalise")
FUZZY_CUTOFF = 85


@dataclass(frozen=True)
class Match:
    test_id: str | None
    method: str  # exact | alias | fuzzy | unmatched
    confidence: float  # 0..1

    @property
    def auto_matched(self) -> bool:
        """True when the name on the report was not a direct hit, so the user
        should see what we mapped it to."""
        return self.method == "fuzzy"


def _trigrams(s: str) -> set[str]:
    p = f"  {s} "
    return {p[i:i + 3] for i in range(len(p) - 2)}


@lru_cache(maxsize=1)
def _index() -> tuple[list[str], list[str], dict[str, set[int]]]:
    cat = get_catalog()
    keys: list[str] = []
    ids: list[str] = []
    for table in (cat.exact, cat.alias):
        for k, tid in table.items():
            keys.append(k)
            ids.append(tid)
    grams: dict[str, set[int]] = defaultdict(set)
    for i, k in enumerate(keys):
        for g in _trigrams(k):
            grams[g].add(i)
    return keys, ids, grams


def match_name(raw: str) -> Match:
    cat = get_catalog()
    key = normalise_key(raw)
    if not key:
        return Match(None, "unmatched", 0.0)
    if key in cat.exact:
        return Match(cat.exact[key], "exact", 1.0)
    if key in cat.alias:
        # An alias is a curated, known-equivalent name. We still flag it as
        # auto-matched when the printed text differs from the display name, so
        # the user can see "Read as 'S.G.P.T' -> matched to 'SGPT (ALT)'".
        return Match(cat.alias[key], "alias", 0.99)

    keys, ids, grams = _index()
    # trigram retrieval: only score candidates sharing >= 1/3 of trigrams
    q = _trigrams(key)
    hits: dict[int, int] = defaultdict(int)
    for g in q:
        for i in grams.get(g, ()):
            hits[i] += 1
    candidates = [i for i, n in hits.items() if n >= max(1, len(q) // 3)]
    if candidates:
        choices = {i: keys[i] for i in candidates}
        best = process.extractOne(key, choices, scorer=fuzz.ratio, score_cutoff=FUZZY_CUTOFF)
        if best:
            _, score, idx = best
            return Match(ids[idx], "fuzzy", round(score / 100, 3))
    log.info("unmatched test name %r (key %r) - candidate for alias curation", raw, key)
    return Match(None, "unmatched", 0.0)


def is_auto_matched(raw: str, m: Match) -> bool:
    """Show the amber chip when we had to correct the printed name: any fuzzy
    match, or an alias hit only after stripping punctuation (e.g. 'S.G.P.T').
    A literal alias like 'SGPT' or 'Hb' is a known name, not a correction."""
    if m.test_id is None:
        return False
    if m.method == "fuzzy":
        return True
    if m.method == "alias":
        t = get_catalog().tests[m.test_id]
        literal = raw.strip().lower()
        return literal not in {t.name.lower(), t.id.lower(), *(a.lower() for a in t.aliases)}
    return False
