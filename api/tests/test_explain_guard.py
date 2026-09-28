import re

from app.catalog import SHARED
from app.pipeline.explain import Explainer, Facts, cache_key, static_body, verify_numbers

FERRITIN = Facts("FERR", 8, None, "ng/mL", 30, 400, "low", 0.73)


class RogueProvider:
    """Simulates a model that invents a number and uses jargon."""

    def __init__(self):
        self.calls = 0

    def generate(self, batch):
        self.calls += 1
        return [{
            "what_it_measures": "Ferritin measures iron stores.",
            "what_yours_means": "Your value is 12, which is low.",  # 12 is not in the input
            "common_causes": ["Low iron"],
            "ask_your_doctor": ["Do I need iron?"],
        } for _ in batch]


class GoodProvider:
    def __init__(self):
        self.calls = 0

    def generate(self, batch):
        self.calls += 1
        return [{
            "what_it_measures": "Ferritin shows how much iron is stored.",
            "what_yours_means": f"Your ferritin is {f.value}. That is below {f.ref_low}.",
            "common_causes": ["Not enough iron in food"],
            "ask_your_doctor": ["Do I need iron tablets?"],
        } for f in batch]


def test_invented_number_falls_back_to_static():
    p = RogueProvider()
    body = Explainer(p).explain([FERRITIN])[0]
    assert body == static_body(FERRITIN)
    assert p.calls == 2  # original + one regeneration, then static fallback


def test_numbers_from_input_are_allowed():
    p = GoodProvider()
    body = Explainer(p).explain([FERRITIN])[0]
    assert "Your ferritin is 8" in body["what_yours_means"]


def test_test_name_digits_are_not_treated_as_values():
    f = Facts("B12", 198, None, "pg/mL", 211, 911, "borderline_low", 0.06)
    assert verify_numbers(static_body(f), f)


def test_cache_key_buckets_deviation():
    a = Facts("HGB", 11.2, None, "g/dL", 12, 15, "borderline_low", 0.067)
    b = Facts("HGB", 11.3, None, "g/dL", 12, 15, "borderline_low", 0.058)
    assert cache_key(a) == cache_key(b)
    assert cache_key(a) != cache_key(Facts("HGB", 11.2, None, "g/dL", 12, 15, "borderline_low", 0.067, "hi"))


def test_misses_are_batched_into_one_call():
    p = GoodProvider()
    ex = Explainer(p)
    items = [Facts(t, 1, None, None, None, None, "normal", 0) for t in ("HGB", "WBC", "PLT", "ALT")]
    ex.explain(items)
    assert p.calls == 1
    ex.explain(items)  # all cached now
    assert p.calls == 1


def test_static_text_never_contains_values_or_banned_words():
    import json
    banned = re.compile(r"\b(safe|fine|healthy|harmless|nothing to worry about)\b", re.I)
    for path in (SHARED / "explanations").glob("*.json"):
        text = path.read_text()
        assert not banned.search(text), f"{path.name}: {banned.search(text).group()}"
        data = json.loads(text)
        for tid, entry in data.items():
            if tid.startswith("_"):
                continue
            f = Facts(tid, None, None, None, None, None, "normal", 0)
            for d in ("low", "high", "normal"):
                if d in entry:
                    assert verify_numbers({"what_it_measures": entry["measures"], "what_yours_means": entry[d]["means"],
                                           "common_causes": entry[d].get("causes", []),
                                           "ask_your_doctor": entry[d].get("ask", [])}, f), (path.name, tid, d)
