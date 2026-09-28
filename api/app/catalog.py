"""Seeded reference data (tests, aliases, ranges, critical values, conversions).

Loaded once from shared/catalog.json, which the web app also reads, so both
sides classify against identical data. Read-only at runtime.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

SHARED = Path(__file__).resolve().parents[2] / "shared"


@dataclass(frozen=True)
class RefRange:
    sex: str  # "F", "M" or "*"
    age_min: int
    age_max: int
    low: float | None
    high: float | None


@dataclass(frozen=True)
class Test:
    id: str
    loinc: str
    name: str
    panel: str
    unit: str
    kind: str  # "numeric" | "qualitative"
    decimals: int
    aliases: tuple[str, ...]
    ranges: tuple[RefRange, ...]
    crit_low: float | None
    crit_high: float | None
    conversions: dict[str, float] = field(default_factory=dict)
    expected: str | None = None
    delta_pct: float = 20.0
    plausible: tuple[float, float] | None = None  # canonical unit
    delta_abs: float | None = None  # minimum absolute change for the delta check


def normalise_key(name: str) -> str:
    """Lowercase and strip punctuation so 'S.G.P.T', 'Sr. Creatinine' and
    'Vit. D (25-OH)' collapse onto stable keys."""
    s = name.lower().replace("µ", "u")
    s = re.sub(r"[^a-z0-9+]+", " ", s).strip()
    # join runs of single letters: "s g p t" -> "sgpt"
    s = re.sub(r"\b([a-z])((?: [a-z]\b)+)", lambda m: m.group(0).replace(" ", ""), s)
    return s


def unit_key(unit: str) -> str:
    return unit.lower().replace("µ", "u").replace("μ", "u").replace(" ", "")


class Catalog:
    def __init__(self, raw: dict):
        self.panels: list[dict] = raw["panels"]
        self.tests: dict[str, Test] = {}
        for t in raw["tests"]:
            crit = t.get("critical") or {}
            test = Test(
                id=t["id"],
                loinc=t["loinc"],
                name=t["name"],
                panel=t["panel"],
                unit=t.get("unit", ""),
                kind=t.get("kind", "numeric"),
                decimals=t.get("decimals", 1),
                aliases=tuple(t.get("aliases", [])),
                ranges=tuple(RefRange(**r) for r in t.get("ranges", [])),
                crit_low=crit.get("low"),
                crit_high=crit.get("high"),
                conversions={unit_key(c["from"]): c["multiplier"] for c in t.get("conversions", [])},
                expected=t.get("expected"),
                delta_pct=t.get("delta_pct", 20.0),
                plausible=tuple(t["plausible"]) if t.get("plausible") else None,
                delta_abs=t.get("delta_abs"),
            )
            self.tests[test.id] = test
        # 1. exact table: normalised display name + code
        # 2. alias table: curated aliases (Indian lab conventions)
        self.exact: dict[str, str] = {}
        self.alias: dict[str, str] = {}
        for test in self.tests.values():
            self.exact[normalise_key(test.name)] = test.id
            self.exact[normalise_key(test.id)] = test.id
            for a in test.aliases:
                self.alias[normalise_key(a)] = test.id

    def fallback_range(self, test: Test, sex: str, age: int) -> RefRange | None:
        for r in test.ranges:
            if r.sex in (sex, "*") and r.age_min <= age <= r.age_max:
                return r
        return None

    def to_row_unit(self, test: Test, row_unit: str, canonical_value: float | None) -> float | None:
        """Convert a canonical-unit threshold into the unit printed on the row."""
        if canonical_value is None:
            return None
        if not row_unit or unit_key(row_unit) == unit_key(test.unit):
            return canonical_value
        mult = test.conversions.get(unit_key(row_unit))
        if mult is None:
            return None  # unknown unit: never guess a critical threshold
        return canonical_value / mult

    def name_tokens_with_digits(self) -> set[str]:
        """Test names like 'B12', 'T3', 'HbA1c' contain digits that are not values."""
        out: set[str] = set()
        for t in self.tests.values():
            for word in re.findall(r"[A-Za-z]*\d+[A-Za-z0-9-]*", " ".join((t.name, *t.aliases))):
                out.add(word.lower())
        return out


@lru_cache(maxsize=1)
def get_catalog() -> Catalog:
    return Catalog(json.loads((SHARED / "catalog.json").read_text()))


@lru_cache(maxsize=8)
def get_explanations(lang: str) -> dict:
    path = SHARED / "explanations" / f"{lang}.json"
    if not path.exists():
        path = SHARED / "explanations" / "en.json"
    return json.loads(path.read_text())
