"""Shape report values as HL7 FHIR R4 Observation resources."""
from __future__ import annotations

INTERPRETATION = {
    "critical_low": ("LL", "Critical low"),
    "low": ("L", "Low"),
    "borderline_low": ("L", "Low"),
    "normal": ("N", "Normal"),
    "borderline_high": ("H", "High"),
    "high": ("H", "High"),
    "critical_high": ("HH", "Critical high"),
    "unknown": ("IND", "Indeterminate"),
}


def observation(v: dict, patient_id: str) -> dict:
    code, display = INTERPRETATION.get(v["status"], ("IND", "Indeterminate"))
    obs: dict = {
        "resourceType": "Observation",
        "id": v["id"],
        "status": "final",
        "category": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": "laboratory"}]}],
        "code": {
            "coding": [{"system": "http://loinc.org", "code": v["loinc"], "display": v["name"]}] if v.get("loinc") else [],
            "text": v["raw_name"],
        },
        "subject": {"reference": f"Patient/{patient_id}"},
        "effectiveDateTime": v["report_date"],
        "interpretation": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation", "code": code, "display": display}]}],
    }
    if v.get("value_num") is not None:
        obs["valueQuantity"] = {"value": v["value_num"], "unit": v.get("unit") or ""}
    else:
        obs["valueString"] = v.get("value_text")
    rr: dict = {}
    if v.get("ref_low") is not None:
        rr["low"] = {"value": v["ref_low"], "unit": v.get("unit") or ""}
    if v.get("ref_high") is not None:
        rr["high"] = {"value": v["ref_high"], "unit": v.get("unit") or ""}
    if v.get("expected"):
        rr["text"] = v["expected"]
    if rr:
        obs["referenceRange"] = [rr]
    return obs
