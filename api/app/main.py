"""MedSimplify API.

Explains a report the patient already owns. Never diagnoses.
Run:  .venv/bin/uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

import json
import uuid
from datetime import date
from typing import Literal

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .catalog import SHARED, get_catalog, get_explanations
from .fhir import observation
from .pipeline.analyse import RowInput, analyse_row
from .pipeline.explain import Explainer, Facts
from .pipeline.run import run_pipeline_isolated
from .store import Store

MAX_UPLOAD_BYTES = 15 * 1024 * 1024
ABNORMAL = {"low", "high", "critical_low", "critical_high", "borderline_low", "borderline_high"}
STATUS_RANK = {"critical_low": 0, "critical_high": 0, "low": 1, "high": 1,
               "borderline_low": 2, "borderline_high": 2, "unknown": 3, "normal": 4}

app = FastAPI(title="MedSimplify API", version="0.1.0",
              description="Explains lab reports. Does not diagnose.")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173"],
    allow_methods=["*"], allow_headers=["*"],
)

store = Store()
explainer = Explainer()
SAMPLE_PATIENT_ID = "p-sample"


# ------------------------------------------------------------------ auth stub

def current_user(x_user_id: str = Header(default="demo-user")) -> str:
    """Stand-in for the Supabase JWT. Row scoping below mirrors the RLS policies."""
    return x_user_id


# ------------------------------------------------------------------ models

class PatientIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    sex: Literal["F", "M"]
    birth_year: int


class ValuePatch(BaseModel):
    raw_name: str | None = None
    test_id: str | None = None
    value_num: float | None = None
    value_text: str | None = None
    unit: str | None = None
    ref_low: float | None = None
    ref_high: float | None = None
    clear_ref: bool = False


class PatientPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    sex: Literal["F", "M"] | None = None
    birth_year: int | None = None


class ReportPatch(BaseModel):
    report_date: date | None = None
    lab_name: str | None = Field(default=None, max_length=120)


class ValueIn(BaseModel):
    raw_name: str
    test_id: str | None = None
    value_num: float | None = None
    value_text: str | None = None
    unit: str | None = None
    ref_low: float | None = None
    ref_high: float | None = None


class ExplainIn(BaseModel):
    test_id: str
    value: float | None = None
    value_text: str | None = None
    unit: str | None = None
    ref_low: float | None = None
    ref_high: float | None = None
    status: str
    deviation: float = 0.0
    lang: str = "en"


# ------------------------------------------------------------------ helpers

def _age(p: dict, on: str | None = None) -> int:
    year = int(on[:4]) if on else date.today().year
    return year - p["birth_year"]


def _patient_or_404(user: str, pid: str) -> dict:
    p = store.get_patient(user, pid)
    if not p:
        raise HTTPException(404, "We couldn't find that person.")
    return p


def _report_or_404(user: str, rid: str) -> dict:
    r = store.get_report(user, rid)
    if not r:
        raise HTTPException(404, "We couldn't find that report.")
    return r


def _facts(v: dict, lang: str) -> Facts:
    return Facts(v["test_id"], v.get("value_num"), v.get("value_text"), v.get("unit"),
                 v.get("ref_low"), v.get("ref_high"), v["status"], v.get("deviation", 0.0), lang)


def _with_explanations(values: list[dict], lang: str) -> list[dict]:
    known = [v for v in values if v.get("test_id")]
    bodies = explainer.explain([_facts(v, lang) for v in known])  # ONE batched call
    by_id = {v["id"]: b for v, b in zip(known, bodies)}
    return [{**v, "explanation": by_id.get(v["id"])} for v in values]


def _panel_summary(values: list[dict], lang: str) -> str:
    ui = get_explanations(lang).get("_ui") or get_explanations("en")["_ui"]
    inc = [v for v in values if v.get("included", True)]
    n_ok = sum(1 for v in inc if v["status"] == "normal")
    parts = [ui["n_of_m_within"].format(n=n_ok, m=len(inc))]
    for v in sorted(inc, key=lambda v: STATUS_RANK.get(v["status"], 5)):
        if v["status"] in ABNORMAL:
            key = {"critical_low": "is_critical", "critical_high": "is_critical",
                   "low": "is_low", "borderline_low": "is_slightly_low",
                   "high": "is_high", "borderline_high": "is_slightly_high"}[v["status"]]
            parts.append(ui[key].format(test=v["name"]))
    return " ".join(parts[:3])


def _group(values: list[dict], lang: str) -> list[dict]:
    cat = get_catalog()
    out = []
    for panel in cat.panels:
        vs = [v for v in values if v.get("panel") == panel["id"]]
        if not vs:
            continue
        worst = min((STATUS_RANK.get(v["status"], 5) for v in vs if v.get("included", True)), default=4)
        out.append({**panel, "values": sorted(vs, key=lambda v: STATUS_RANK.get(v["status"], 5)),
                    "worst_rank": worst, "summary": _panel_summary(vs, lang)})
    return sorted(out, key=lambda p: p["worst_rank"])


def _counts(values: list[dict]) -> dict:
    inc = [v for v in values if v.get("included", True)]
    return {
        "total": len(inc),
        "within_range": sum(v["status"] == "normal" for v in inc),
        "needs_attention": sum(v["status"] in ABNORMAL and not v["status"].startswith("critical") for v in inc),
        "needs_prompt_attention": sum(v["status"].startswith("critical") for v in inc),
        "unrecognised": sum(v["status"] == "unrecognised" for v in values),
        "auto_matched": sum(bool(v.get("auto_matched")) for v in values),
    }


def _reanalyse(v: dict, row: RowInput, report: dict) -> dict:
    p = store.patients[report["patient_id"]]
    return analyse_row(row, p["sex"], _age(p, report["report_date"]), report["id"], p["id"],
                       report["report_date"], value_id=v["id"] if v else None)


# ------------------------------------------------------------------ routes

@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.get("/catalog")
def catalog() -> dict:
    """Tests list for the confirm-screen re-map dropdown."""
    return json.loads((SHARED / "catalog.json").read_text())


@app.post("/patients", status_code=201)
def create_patient(body: PatientIn, user: str = Depends(current_user)) -> dict:
    age = date.today().year - body.birth_year
    if age < 18:
        raise HTTPException(422, "MedSimplify supports adults (18 and over) in this version.")
    return store.create_patient(user, body.name.strip(), body.sex, body.birth_year)


@app.get("/patients")
def list_patients(user: str = Depends(current_user)) -> list[dict]:
    out = []
    for p in store.list_patients(user):
        reports = store.list_reports(user, p["id"])
        latest = reports[0] if reports else None
        worst = None
        if latest:
            vs = [v for v in store.report_values(latest["id"]) if v.get("included", True)]
            worst = min((v["status"] for v in vs), key=lambda s: STATUS_RANK.get(s, 5), default=None)
        out.append({**p, "age": _age(p), "report_count": len(reports),
                    "latest_report_date": latest["report_date"] if latest else None, "overall_status": worst})
    return out


@app.get("/patients/{pid}")
def get_patient(pid: str, user: str = Depends(current_user)) -> dict:
    p = _patient_or_404(user, pid)
    return {**p, "age": _age(p), "reports": store.list_reports(user, pid)}


@app.patch("/patients/{pid}")
def patch_patient(pid: str, body: PatientPatch, user: str = Depends(current_user)) -> dict:
    """Extension to the contract: edit a person. Sex and birth year choose the
    fallback ranges, so every value of theirs is re-analysed."""
    p = _patient_or_404(user, pid)
    upd = body.model_dump(exclude_unset=True, exclude_none=True)
    if "birth_year" in upd and date.today().year - upd["birth_year"] < 18:
        raise HTTPException(422, "MedSimplify supports adults (18 and over) in this version.")
    if "name" in upd:
        upd["name"] = upd["name"].strip()
    p.update(upd)
    if "sex" in upd or "birth_year" in upd:
        for r in store.list_reports(user, pid):
            for v in store.report_values(r["id"]):
                printed = v.get("ref_source") == "report"
                row = RowInput(raw_name=v["raw_name"], value_num=v.get("value_num"), value_text=v.get("value_text"),
                               unit=v.get("unit"), ref_low=v.get("ref_low") if printed else None,
                               ref_high=v.get("ref_high") if printed else None,
                               ref_text=v.get("expected") if printed else None, has_range=printed,
                               test_id=v.get("test_id") if v.get("match_method") == "user" else None)
                nv = analyse_row(row, p["sex"], _age(p, r["report_date"]), r["id"], pid, r["report_date"], value_id=v["id"])
                store.replace_value({**nv, "user_corrected": v.get("user_corrected", False)})
    return {**p, "age": _age(p)}


@app.delete("/patients/{pid}", status_code=204)
def delete_patient(pid: str, user: str = Depends(current_user)) -> None:
    if not store.delete_patient(user, pid):
        raise HTTPException(404, "We couldn't find that person.")


@app.post("/reports/upload", status_code=201)
async def upload_report(file: UploadFile = File(...), patient_id: str = Form(...),
                        user: str = Depends(current_user)) -> dict:
    p = _patient_or_404(user, patient_id)
    data = await file.read(MAX_UPLOAD_BYTES + 1)  # parsed in memory; never written to disk
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "This file is too large. Please upload a report under 15 MB.")
    result = await run_pipeline_isolated(data, file.content_type)
    del data
    existing = store.find_by_hash(patient_id, result.file_hash)
    if existing:
        # Same file already uploaded for this person: never store it twice
        # (that would put two identical points on every trend line).
        values = store.report_values(existing["id"])
        return {"report_id": existing["id"], "status": "duplicate", "report": existing,
                "rows": values, "counts": _counts(values)}
    report_date = result.report_date or date.today().isoformat()
    notes = {**result.notes, "date_found": result.report_date is not None}
    report = {"id": str(uuid.uuid4()), "patient_id": patient_id, "report_date": report_date,
              "lab_name": result.lab_name or "Uploaded report", "source_type": result.source_type,
              "file_hash": result.file_hash, "status": result.status, "parse_notes": notes}
    age = _age(p, report_date)
    values = [analyse_row(r, p["sex"], age, report["id"], patient_id, report_date) for r in result.rows]
    store.create_report(p, report, values)
    return {"report_id": report["id"], "status": result.status, "report": report,
            "rows": values, "counts": _counts(values)}


@app.patch("/reports/{rid}")
def patch_report(rid: str, body: ReportPatch, user: str = Depends(current_user)) -> dict:
    """Extension to the contract: correct the report date or lab on the confirm
    screen. The date is denormalised onto every value (trend index), and age
    bands depend on it, so every value is re-analysed."""
    r = _report_or_404(user, rid)
    upd = body.model_dump(exclude_unset=True)
    if "lab_name" in upd and upd["lab_name"]:
        r["lab_name"] = upd["lab_name"].strip()
    if "report_date" in upd and upd["report_date"]:
        r["report_date"] = upd["report_date"].isoformat()
        for v in store.report_values(rid):
            row = RowInput(
                raw_name=v["raw_name"], value_num=v.get("value_num"), value_text=v.get("value_text"),
                unit=v.get("unit"),
                ref_low=v.get("ref_low") if v.get("ref_source") == "report" else None,
                ref_high=v.get("ref_high") if v.get("ref_source") == "report" else None,
                ref_text=v.get("expected") if v.get("ref_source") == "report" else None,
                has_range=v.get("ref_source") == "report",
                test_id=v.get("test_id") if v.get("match_method") == "user" else None,
            )
            nv = analyse_row(row, store.patients[r["patient_id"]]["sex"],
                             _age(store.patients[r["patient_id"]], r["report_date"]),
                             rid, r["patient_id"], r["report_date"], value_id=v["id"])
            store.replace_value({**nv, "user_corrected": v.get("user_corrected", False)})
    return r


@app.get("/reports/{rid}")
def get_report(rid: str, lang: str = "en", format: str = Query("grouped", pattern="^(grouped|fhir)$"),
               user: str = Depends(current_user)) -> dict:
    r = _report_or_404(user, rid)
    values = store.report_values(rid)
    if format == "fhir":
        return {"resourceType": "Bundle", "type": "collection",
                "entry": [{"resource": observation(v, r["patient_id"])} for v in values if v.get("test_id")]}
    values = _with_explanations(values, lang)
    critical = [v for v in values if v["status"].startswith("critical")]
    return {"report": r, "patient": store.patients[r["patient_id"]], "counts": _counts(values),
            "critical": critical, "panels": _group([v for v in values if v.get("panel")], lang),
            "unrecognised": [v for v in values if not v.get("test_id")]}


@app.patch("/reports/{rid}/values/{vid}")
def patch_value(rid: str, vid: str, body: ValuePatch, user: str = Depends(current_user)) -> dict:
    r = _report_or_404(user, rid)
    v = store.values.get(vid)
    if not v or v["report_id"] != rid:
        raise HTTPException(404, "We couldn't find that row.")
    upd = body.model_dump(exclude_unset=True)
    ref_low = None if body.clear_ref else upd.get("ref_low", v.get("ref_low") if v["ref_source"] == "report" else None)
    ref_high = None if body.clear_ref else upd.get("ref_high", v.get("ref_high") if v["ref_source"] == "report" else None)
    row = RowInput(
        raw_name=upd.get("raw_name", v["raw_name"]),
        value_num=upd.get("value_num", v.get("value_num")),
        value_text=upd.get("value_text", v.get("value_text")),
        unit=upd.get("unit", v.get("unit")),
        ref_low=ref_low, ref_high=ref_high,
        ref_text=v.get("expected") if v.get("ref_source") == "report" else None,
        has_range=ref_low is not None or ref_high is not None,
        test_id=upd.get("test_id", v.get("test_id") if v.get("match_method") == "user" else None),
    )
    nv = {**_reanalyse(v, row, r), "user_corrected": True}
    store.replace_value(nv)
    return nv


@app.post("/reports/{rid}/values", status_code=201)
def add_value(rid: str, body: ValueIn, user: str = Depends(current_user)) -> dict:
    """Extension to the contract: 'Add a row manually' on the confirm screen."""
    r = _report_or_404(user, rid)
    row = RowInput(raw_name=body.raw_name, value_num=body.value_num, value_text=body.value_text, unit=body.unit,
                   ref_low=body.ref_low, ref_high=body.ref_high,
                   has_range=body.ref_low is not None or body.ref_high is not None, test_id=body.test_id)
    nv = {**_reanalyse({}, row, r), "user_corrected": True}
    store.replace_value(nv)
    return nv


@app.delete("/reports/{rid}/values/{vid}", status_code=204)
def delete_value(rid: str, vid: str, user: str = Depends(current_user)) -> None:
    _report_or_404(user, rid)
    v = store.values.get(vid)
    if not v or v["report_id"] != rid:
        raise HTTPException(404, "We couldn't find that row.")
    with store.lock:
        store.values.pop(vid)


@app.delete("/reports/{rid}", status_code=204)
def delete_report(rid: str, user: str = Depends(current_user)) -> None:
    if not store.delete_report(user, rid):
        raise HTTPException(404, "We couldn't find that report.")


@app.get("/trends/{pid}")
def trend(pid: str, test: str, user: str = Depends(current_user)) -> dict:
    _patient_or_404(user, pid)
    cat = get_catalog()
    t = cat.tests.get(test.upper())
    if not t:
        raise HTTPException(404, "We don't track that test.")
    pts = store.series(user, pid, t.id)
    latest = pts[-1] if pts else None
    return {
        "test_id": t.id, "name": t.name, "loinc": t.loinc, "unit": latest["unit"] if latest else t.unit,
        "band": {"low": latest["ref_low"], "high": latest["ref_high"],
                 "source": latest["ref_source"]} if latest else None,
        "points": [{"date": v["report_date"], "value": v.get("value_num"), "status": v["status"],
                    "lab": store.reports[v["report_id"]]["lab_name"], "report_id": v["report_id"]} for v in pts],
    }


@app.get("/trends/{pid}/summary")
def trend_summary(pid: str, user: str = Depends(current_user)) -> list[dict]:
    """Every test with 2+ points, with a delta check between the two latest."""
    _patient_or_404(user, pid)
    cat = get_catalog()
    out = []
    for tid in store.tracked_tests(user, pid):
        pts = [v for v in store.series(user, pid, tid) if v.get("value_num") is not None]
        if len(pts) < 2:
            continue
        a, b = pts[-2], pts[-1]
        pct = (b["value_num"] - a["value_num"]) / a["value_num"] * 100 if a["value_num"] else None
        t = cat.tests[tid]
        moving = pct is not None and abs(pct) >= t.delta_pct \
            and abs(b["value_num"] - a["value_num"]) >= min_delta(t, b)
        out.append({
            "test_id": tid, "name": t.name, "points": len(pts),
            "first": pts[0]["value_num"], "latest": b["value_num"], "previous": a["value_num"],
            "pct_change": round(pct, 1) if pct is not None else None,
            "overall_pct_change": round((b["value_num"] - pts[0]["value_num"]) / pts[0]["value_num"] * 100, 1)
            if pts[0]["value_num"] else None,
            "delta_flag": moving,
            "moving_within_range": moving and a["status"] == "normal" and b["status"] == "normal",
        })
    return sorted(out, key=lambda s: abs(s["overall_pct_change"] or 0), reverse=True)


def min_delta(t, v: dict) -> float:
    """A big percentage of a tiny number (CRP 0.1 -> 0.3 is +200%) is noise.
    A change must also be at least 10% of the reference range's scale."""
    if t.delta_abs is not None:
        return t.delta_abs
    lo, hi = v.get("ref_low"), v.get("ref_high")
    if lo is not None and hi is not None and hi > lo:
        return 0.1 * (hi - lo)
    bound = hi if hi is not None else lo
    return 0.1 * abs(bound) if bound else 0.0


@app.post("/explain")
def explain(body: ExplainIn) -> dict:
    if body.test_id not in get_catalog().tests:
        raise HTTPException(404, "We don't have an explanation for that test.")
    f = Facts(body.test_id, body.value, body.value_text, body.unit, body.ref_low, body.ref_high,
              body.status, body.deviation, body.lang)
    return explainer.explain([f])[0]


@app.get("/reports/{rid}/questions")
def questions(rid: str, lang: str = "en", user: str = Depends(current_user)) -> list[dict]:
    _report_or_404(user, rid)
    vals = [v for v in _with_explanations(store.report_values(rid), lang)
            if v["status"] in ABNORMAL and v.get("explanation")]
    vals.sort(key=lambda v: STATUS_RANK.get(v["status"], 5))
    return [{"test_id": v["test_id"], "name": v["name"], "status": v["status"],
             "questions": v["explanation"]["ask_your_doctor"]} for v in vals]


@app.get("/reports/{rid}/summary")
def summary(rid: str, lang: str = "en", user: str = Depends(current_user)) -> dict:
    _report_or_404(user, rid)
    values = store.report_values(rid)
    return {"lang": lang, "counts": _counts(values),
            "panels": [{"id": p["id"], "name": p["name"], "summary": p["summary"]}
                       for p in _group([v for v in values if v.get("panel")], lang)]}


# ------------------------------------------------------------------ seed

def seed_sample(user: str = "demo-user") -> str:
    """Load the illustrative sample patient so the API is explorable at once."""
    if store.get_patient(user, SAMPLE_PATIENT_ID):
        return SAMPLE_PATIENT_ID
    s = json.loads((SHARED / "sample.json").read_text())
    p = store.create_patient(user, s["patient"]["name"], s["patient"]["sex"], s["patient"]["birth_year"],
                             pid=SAMPLE_PATIENT_ID)
    latest_ranges = {v["test"]: v for v in s["values_latest"]}
    for rep in s["reports"]:
        report = {"id": rep["id"], "patient_id": p["id"], "report_date": rep["date"], "lab_name": rep["lab"],
                  "source_type": "sample", "file_hash": None, "status": "parsed",
                  "parse_notes": {"sample": True}}
        rows: list[RowInput] = []
        if rep["id"] == s["reports"][0]["id"]:
            for v in s["values_latest"]:
                printed = v.get("ref_source") == "report"
                rows.append(RowInput(raw_name=v.get("raw_name", v["test"]), value_num=v.get("value"),
                                     value_text=v.get("value_text"), unit=v.get("unit"),
                                     ref_low=v.get("low") if printed else None,
                                     ref_high=v.get("high") if printed else None,
                                     ref_text=v.get("expected"), has_range=printed))
        else:
            for name, series in s["trends"].items():
                pt = next((x for x in series if x["date"] == rep["date"]), None)
                if pt is None:
                    continue
                ref = latest_ranges[name]
                printed = ref.get("ref_source") == "report"
                rows.append(RowInput(raw_name=name, value_num=pt["v"], unit=ref.get("unit"),
                                     ref_low=ref.get("low") if printed else None,
                                     ref_high=ref.get("high") if printed else None, has_range=printed))
        age = _age(p, rep["date"])
        values = [analyse_row(r, p["sex"], age, rep["id"], p["id"], rep["date"]) for r in rows]
        store.create_report(p, report, values)
    return p["id"]


seed_sample()
