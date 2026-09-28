from pathlib import Path

from fastapi.testclient import TestClient

from app.main import SAMPLE_PATIENT_ID, app

FIX = Path(__file__).resolve().parents[1] / "fixtures"
client = TestClient(app)


def _new_patient(user="u1"):
    r = client.post("/patients", json={"name": "Test Person", "sex": "F", "birth_year": 1956},
                    headers={"X-User-Id": user})
    assert r.status_code == 201
    return r.json()["id"]


def _upload(pid, user="u1", name="sample_report.pdf"):
    with open(FIX / name, "rb") as f:
        return client.post("/reports/upload", data={"patient_id": pid},
                           files={"file": (name, f, "application/pdf")}, headers={"X-User-Id": user})


def test_upload_end_to_end():
    pid = _new_patient()
    r = _upload(pid)
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "parsed"
    rows = {v["raw_name"]: v for v in body["rows"]}
    assert rows["S.G.P.T"]["test_id"] == "ALT" and rows["S.G.P.T"]["auto_matched"]
    assert rows["Potassium"]["status"] == "critical_high"
    assert rows["Sr. Creatinine"]["status"] == "normal"  # 1.1 at the upper limit 1.1
    assert rows["Sr. Creatinine"]["ref_high"] == 1.1  # em-dash range parsed
    assert rows["HbA1c"]["ref_source"] == "catalog" and rows["HbA1c"]["status"] == "high"
    assert rows["Homocysteine"]["status"] == "unrecognised" and not rows["Homocysteine"]["included"]
    assert rows["Urine Protein"]["status"] == "borderline_high"
    assert rows["Platelet Count"]["crit_low"] == 0.2  # 20,000/cumm expressed in lakh/cumm
    assert rows["Total WBC Count"]["value_num"] == 7200  # "7,200", not 7.2
    assert rows["Total WBC Count"]["status"] == "normal"
    assert rows["Triglycerides"]["value_num"] == 188  # "188 *" flag stripped
    assert body["counts"]["needs_prompt_attention"] == 1  # "6.3 H" was not dropped
    assert body["report"]["parse_notes"]["unread"] == ["Serum Magnesium 2.l mg/dL 1.6 - 2.6"]


def test_grouped_report_sorts_abnormal_first_and_lists_critical():
    pid = _new_patient()
    rid = _upload(pid).json()["report_id"]
    rep = client.get(f"/reports/{rid}", headers={"X-User-Id": "u1"}).json()
    assert rep["panels"][0]["id"] == "kidney"  # holds the critical potassium
    assert [v["test_id"] for v in rep["critical"]] == ["K"]
    k = next(v for p in rep["panels"] for v in p["values"] if v["test_id"] == "K")
    assert k["explanation"]["what_it_measures"].startswith("Potassium")


def test_fhir_output():
    rep = client.get("/reports/r3?format=fhir").json()
    obs = [e["resource"] for e in rep["entry"]]
    hb = next(o for o in obs if o["code"]["coding"][0]["code"] == "718-7")
    assert hb["valueQuantity"]["value"] == 10.4 and hb["interpretation"][0]["coding"][0]["code"] == "L"


def test_patch_remaps_and_reclassifies():
    pid = _new_patient()
    body = _upload(pid).json()
    rid = body["report_id"]
    homo = next(v for v in body["rows"] if v["raw_name"] == "Homocysteine")
    r = client.patch(f"/reports/{rid}/values/{homo['id']}", json={"test_id": "CRP"}, headers={"X-User-Id": "u1"})
    assert r.status_code == 200 and r.json()["test_id"] == "CRP" and r.json()["included"]
    hb = next(v for v in body["rows"] if v["raw_name"] == "Haemoglobin")
    r = client.patch(f"/reports/{rid}/values/{hb['id']}", json={"value_num": 6.5}, headers={"X-User-Id": "u1"})
    assert r.json()["status"] == "critical_low"


def test_trends_and_delta_check():
    t = client.get(f"/trends/{SAMPLE_PATIENT_ID}?test=HBA1C").json()
    assert [p["value"] for p in t["points"]] == [6.1, 6.8, 7.4]
    s = client.get(f"/trends/{SAMPLE_PATIENT_ID}/summary").json()
    assert s[0]["test_id"] == "CREAT"  # most dramatic movement
    creat = s[0]
    assert creat["pct_change"] == 22.2 and creat["moving_within_range"]
    assert not next(x for x in s if x["test_id"] == "HBA1C")["delta_flag"]


def test_questions_and_translated_summary():
    q = client.get("/reports/r3/questions").json()
    assert q[0]["test_id"] == "K"
    s = client.get("/reports/r3/summary?lang=en").json()
    assert s["panels"][0]["id"] == "kidney"
    lip = next(p for p in s["panels"] if p["id"] == "lipids")
    assert lip["summary"].startswith("1 of 3 within range.")


def test_row_level_scoping():
    pid = _new_patient("owner")
    rid = _upload(pid, "owner").json()["report_id"]
    assert client.get(f"/reports/{rid}", headers={"X-User-Id": "intruder"}).status_code == 404
    assert client.get(f"/patients/{pid}", headers={"X-User-Id": "intruder"}).status_code == 404


def test_cascade_delete():
    pid = _new_patient("del")
    rid = _upload(pid, "del").json()["report_id"]
    assert client.delete(f"/patients/{pid}", headers={"X-User-Id": "del"}).status_code == 204
    assert client.get(f"/reports/{rid}", headers={"X-User-Id": "del"}).status_code == 404
    from app.main import store
    assert not [v for v in store.values.values() if v["patient_id"] == pid]


def test_minors_rejected():
    r = client.post("/patients", json={"name": "Kid", "sex": "M", "birth_year": 2015})
    assert r.status_code == 422


def test_garbage_file_is_parse_failed_not_500():
    pid = _new_patient()
    r = client.post("/reports/upload", data={"patient_id": pid},
                    files={"file": ("x.pdf", b"%PDF-1.4 broken", "application/pdf")}, headers={"X-User-Id": "u1"})
    assert r.status_code == 201 and r.json()["status"] == "parse_failed"


def test_duplicate_upload_is_not_stored_twice():
    pid = _new_patient("dup")
    first = _upload(pid, "dup").json()
    second = _upload(pid, "dup")
    assert second.status_code == 201
    body = second.json()
    assert body["status"] == "duplicate" and body["report_id"] == first["report_id"]
    assert len(client.get(f"/patients/{pid}", headers={"X-User-Id": "dup"}).json()["reports"]) == 1
    pts = client.get(f"/trends/{pid}?test=HGB", headers={"X-User-Id": "dup"}).json()["points"]
    assert len(pts) == 1


def test_report_date_found_and_correctable():
    pid = _new_patient("date")
    up = _upload(pid, "date").json()
    assert up["report"]["parse_notes"]["date_found"] is True
    rid = up["report_id"]
    r = client.patch(f"/reports/{rid}", json={"report_date": "2026-01-05", "lab_name": "City Lab"}, headers={"X-User-Id": "date"})
    assert r.status_code == 200 and r.json()["report_date"] == "2026-01-05" and r.json()["lab_name"] == "City Lab"
    pts = client.get(f"/trends/{pid}?test=HGB", headers={"X-User-Id": "date"}).json()["points"]
    assert [p["date"] for p in pts] == ["2026-01-05"]


def test_patch_without_range_keeps_catalog_source():
    """The web client now sends only changed fields; editing a value must not
    turn a catalog range into a 'printed on your report' range."""
    pid = _new_patient("src")
    up = _upload(pid, "src").json()
    hb = next(v for v in up["rows"] if v["raw_name"] == "HbA1c")
    assert hb["ref_source"] == "catalog"
    r = client.patch(f"/reports/{up['report_id']}/values/{hb['id']}", json={"value_num": 7.9}, headers={"X-User-Id": "src"}).json()
    assert r["ref_source"] == "catalog" and r["status"] == "high"


def test_hung_parser_times_out_cleanly(monkeypatch):
    import asyncio
    from app.pipeline import run as run_mod

    async def slow(data, content_type, timeout=0.2):
        return await run_mod.run_pipeline_isolated(data, content_type, timeout=0.01)

    monkeypatch.setattr("app.main.run_pipeline_isolated", slow)
    pid = _new_patient("slow")
    r = _upload(pid, "slow")
    assert r.status_code == 201 and r.json()["status"] == "parse_failed"
    assert "too long" in r.json()["report"]["parse_notes"]["reason"]


def test_small_changes_on_small_numbers_are_not_flagged():
    from app.catalog import get_catalog
    from app.main import min_delta

    crp = get_catalog().tests["CRP"]
    # CRP 0.1 -> 0.3 is +200% but far below 10% of the 6 mg/L limit
    assert abs(0.3 - 0.1) < min_delta(crp, {"ref_low": None, "ref_high": 6.0})
    creat = get_catalog().tests["CREAT"]
    assert abs(1.1 - 0.9) >= min_delta(creat, {"ref_low": 0.6, "ref_high": 1.1})


def test_editing_sex_reanalyses_catalog_ranges():
    pid = _new_patient("edit")
    up = _upload(pid, "edit").json()
    rid = up["report_id"]
    # Ferritin fallback differs by sex; make it catalog-sourced by clearing the printed range
    fe = next(v for v in up["rows"] if v["raw_name"] == "Serum Ferritin")
    client.patch(f"/reports/{rid}/values/{fe['id']}", json={"clear_ref": True, "value_num": 20}, headers={"X-User-Id": "edit"})
    women = next(v for p in client.get(f"/reports/{rid}", headers={"X-User-Id": "edit"}).json()["panels"] for v in p["values"] if v["test_id"] == "FERR")
    assert (women["ref_low"], women["status"]) == (13, "normal")
    r = client.patch(f"/patients/{pid}", json={"sex": "M", "name": "Renamed"}, headers={"X-User-Id": "edit"})
    assert r.status_code == 200 and r.json()["name"] == "Renamed"
    men = next(v for p in client.get(f"/reports/{rid}", headers={"X-User-Id": "edit"}).json()["panels"] for v in p["values"] if v["test_id"] == "FERR")
    assert (men["ref_low"], men["status"]) == (30, "low")
    assert client.patch(f"/patients/{pid}", json={"birth_year": 2015}, headers={"X-User-Id": "edit"}).status_code == 422
