"""Plain-language explanations with guardrails.

The deterministic layer decides; the language layer only describes. The model
(when one is plugged in) receives structured facts, never the raw document:
    {"test":"Ferritin","value":8,"unit":"ng/mL","ref_low":30,"ref_high":400,
     "status":"low","deviation":0.73}
and must return JSON with keys what_it_measures, what_yours_means,
common_causes[], ask_your_doctor[].

The prompt is NOT the guardrail. In code we:
  * reject any response containing a number not present in the input facts
  * check reading grade (textstat) - regenerate once if > 8, then fall back
  * fall back to the static blurb stored with the test
The UI renders every number from parsed state, never from these strings.

Cache key: sha256(test_id | status | deviation rounded to 0.25 | language), so
Haemoglobin 11.2 and 11.3 share a key. All misses go to ONE provider call.
"""
from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from typing import Protocol

from ..catalog import get_catalog, get_explanations

MAX_GRADE = 8.0
REQUIRED_KEYS = ("what_it_measures", "what_yours_means", "common_causes", "ask_your_doctor")

SYSTEM_PROMPT = """You explain one lab value to a patient who has the report in hand.
Rules:
- Never state or imply a diagnosis. Never name a disease as a conclusion.
- Never output a number that is not present in the input facts.
- Eighth-grade reading level or below. Short sentences. Gloss any jargon at once.
- Never say the person is safe, fine or healthy, or that there is nothing to worry about.
- Return only JSON with keys: what_it_measures, what_yours_means, common_causes (list), ask_your_doctor (list)."""


@dataclass(frozen=True)
class Facts:
    test_id: str
    value: float | None
    value_text: str | None
    unit: str | None
    ref_low: float | None
    ref_high: float | None
    status: str
    deviation: float
    lang: str = "en"

    def payload(self) -> dict:
        t = get_catalog().tests[self.test_id]
        return {
            "test": t.name, "value": self.value if self.value is not None else self.value_text,
            "unit": self.unit, "ref_low": self.ref_low, "ref_high": self.ref_high,
            "status": self.status, "deviation": round(self.deviation, 2),
        }


class Provider(Protocol):
    def generate(self, batch: list[Facts]) -> list[dict | None]:
        """One call for the whole batch. Return a body per item (or None)."""


def direction(status: str) -> str:
    if status.endswith("low"):
        return "low"
    if status.endswith("high"):
        return "high"
    return "normal"


def static_body(f: Facts) -> dict:
    body = _static_body(f)
    if f.status == "unknown":
        # No range to compare with: say so instead of borrowing "normal" text.
        ui = get_explanations(f.lang).get("_ui") or get_explanations("en")["_ui"]
        body["what_yours_means"] = ui.get("no_range") or get_explanations("en")["_ui"]["no_range"]
        body["common_causes"] = []
    return body


def _static_body(f: Facts) -> dict:
    ex = get_explanations(f.lang)
    cat = get_catalog()
    t = cat.tests[f.test_id]
    entry = ex.get(f.test_id)
    d = direction(f.status)
    if entry is None or d not in entry:
        generic = ex["_generic"]
        panel = ex.get("_panels", {}).get(t.panel) or next(p["name"] for p in cat.panels if p["id"] == t.panel)
        block = generic[d]
        return {
            "what_it_measures": generic["measures"].replace("{panel}", panel),
            "what_yours_means": block["means"],
            "common_causes": list(block.get("causes", [])),
            "ask_your_doctor": list(block.get("ask", [])),
            "source": "static_generic",
        }
    block = entry[d]
    return {
        "what_it_measures": entry["measures"],
        "what_yours_means": block["means"],
        "common_causes": list(block.get("causes", [])),
        "ask_your_doctor": list(block.get("ask", [])),
        "source": "static",
    }


class StaticProvider:
    """Default provider: curated text, no network. Real LLMs plug in via Provider."""

    def generate(self, batch: list[Facts]) -> list[dict | None]:
        return [static_body(f) for f in batch]


# ---------------------------------------------------------------- guards

_NUM_RE = re.compile(r"(?<![A-Za-z0-9.])[-+]?\d+(?:[.,]\d+)?")


def _numbers_in(text: str) -> list[float]:
    stripped = text
    for tok in sorted(get_catalog().name_tokens_with_digits(), key=len, reverse=True):
        stripped = re.sub(re.escape(tok), " ", stripped, flags=re.I)
    return [float(n.replace(",", ".")) for n in _NUM_RE.findall(stripped)]


def verify_numbers(body: dict, facts: Facts) -> bool:
    allowed = [x for x in (facts.value, facts.ref_low, facts.ref_high) if isinstance(x, (int, float))]
    text = json.dumps({k: body.get(k) for k in REQUIRED_KEYS}, ensure_ascii=False)
    for n in _numbers_in(text):
        if not any(abs(n - a) < 1e-9 for a in allowed):
            return False
    return True


def reading_grade(body: dict) -> float:
    import textstat

    text = " ".join([body["what_it_measures"], body["what_yours_means"], *body["common_causes"]])
    return float(textstat.flesch_kincaid_grade(text))


def is_well_formed(body: object) -> bool:
    return (
        isinstance(body, dict)
        and all(k in body for k in REQUIRED_KEYS)
        and isinstance(body["common_causes"], list)
        and isinstance(body["ask_your_doctor"], list)
    )


def passes_guards(body: dict | None, f: Facts) -> bool:
    if not is_well_formed(body):
        return False
    if not verify_numbers(body, f):
        return False
    if f.lang == "en" and reading_grade(body) > MAX_GRADE:
        return False
    return True


# ---------------------------------------------------------------- cache

def cache_key(f: Facts) -> str:
    dev = round(round(f.deviation / 0.25) * 0.25, 2)
    raw = f"{f.test_id}|{f.status}|{dev}|{f.lang}"
    return hashlib.sha256(raw.encode()).hexdigest()


class Explainer:
    def __init__(self, provider: Provider | None = None):
        self.provider: Provider = provider or StaticProvider()
        self.cache: dict[str, dict] = {}  # mirrors explanation_cache(key PK, lang, body)
        self.provider_calls = 0

    def explain(self, items: list[Facts]) -> list[dict]:
        out: list[dict | None] = [None] * len(items)
        misses: list[int] = []
        for i, f in enumerate(items):
            hit = self.cache.get(cache_key(f))
            if hit is not None:
                out[i] = hit
            else:
                misses.append(i)
        # de-duplicate misses that share a key; one call for all of them
        by_key: dict[str, list[int]] = {}
        for i in misses:
            by_key.setdefault(cache_key(items[i]), []).append(i)
        unique = [idxs[0] for idxs in by_key.values()]
        if unique:
            bodies = self._generate([items[i] for i in unique])
            retry = [j for j, b in enumerate(bodies) if not passes_guards(b, items[unique[j]])]
            if retry:
                again = self._generate([items[unique[j]] for j in retry])
                for j, b in zip(retry, again):
                    bodies[j] = b if passes_guards(b, items[unique[j]]) else static_body(items[unique[j]])
            for j, i in enumerate(unique):
                body = bodies[j] if bodies[j] is not None else static_body(items[i])
                self.cache[cache_key(items[i])] = body
                for k in by_key[cache_key(items[i])]:
                    out[k] = body
        return [b if b is not None else static_body(items[i]) for i, b in enumerate(out)]

    def _generate(self, batch: list[Facts]) -> list[dict | None]:
        self.provider_calls += 1
        try:
            res = list(self.provider.generate(batch))
        except Exception:
            return [None] * len(batch)
        return (res + [None] * len(batch))[: len(batch)]
