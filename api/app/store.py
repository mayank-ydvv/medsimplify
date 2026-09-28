"""In-memory repository with the same shape as db/schema.sql.

Every read is scoped by user_id, mirroring the row-level security policies the
database enforces in production. Deleting a patient cascades to reports and
values exactly as ON DELETE CASCADE does.
"""
from __future__ import annotations

import threading
import uuid
from datetime import datetime, timezone


class Store:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.patients: dict[str, dict] = {}
        self.reports: dict[str, dict] = {}
        self.values: dict[str, dict] = {}
        # (patient_id, test_id) -> [value ids] ~ index report_values(patient_id, test_id, report_date)
        self.trend_index: dict[tuple[str, str], list[str]] = {}

    # -- patients
    def create_patient(self, user_id: str, name: str, sex: str, birth_year: int, pid: str | None = None) -> dict:
        p = {"id": pid or str(uuid.uuid4()), "user_id": user_id, "name": name, "sex": sex,
             "birth_year": birth_year, "created_at": _now()}
        with self.lock:
            self.patients[p["id"]] = p
        return p

    def get_patient(self, user_id: str, pid: str) -> dict | None:
        p = self.patients.get(pid)
        return p if p and p["user_id"] == user_id else None

    def list_patients(self, user_id: str) -> list[dict]:
        return [p for p in self.patients.values() if p["user_id"] == user_id]

    def delete_patient(self, user_id: str, pid: str) -> bool:
        with self.lock:
            if not self.get_patient(user_id, pid):
                return False
            for rid in [r["id"] for r in self.reports.values() if r["patient_id"] == pid]:
                self._delete_report_locked(rid)
            del self.patients[pid]
            return True

    # -- reports
    def create_report(self, patient: dict, report: dict, values: list[dict]) -> dict:
        """One bulk insert for all values (a single statement in Postgres)."""
        with self.lock:
            self.reports[report["id"]] = report
            for v in values:
                self.values[v["id"]] = v
                if v.get("test_id"):
                    self.trend_index.setdefault((patient["id"], v["test_id"]), []).append(v["id"])
        return report

    def get_report(self, user_id: str, rid: str) -> dict | None:
        r = self.reports.get(rid)
        if not r:
            return None
        return r if self.get_patient(user_id, r["patient_id"]) else None

    def list_reports(self, user_id: str, pid: str) -> list[dict]:
        if not self.get_patient(user_id, pid):
            return []
        rs = [r for r in self.reports.values() if r["patient_id"] == pid]
        return sorted(rs, key=lambda r: r["report_date"], reverse=True)

    def find_by_hash(self, pid: str, file_hash: str) -> dict | None:
        return next((r for r in self.reports.values() if r["patient_id"] == pid and r.get("file_hash") == file_hash), None)

    def report_values(self, rid: str) -> list[dict]:
        return [v for v in self.values.values() if v["report_id"] == rid]

    def replace_value(self, v: dict) -> None:
        with self.lock:
            old = self.values.get(v["id"])
            if old and old.get("test_id") and old["test_id"] != v.get("test_id"):
                key = (old["patient_id"], old["test_id"])
                self.trend_index[key] = [x for x in self.trend_index.get(key, []) if x != v["id"]]
            self.values[v["id"]] = v
            if v.get("test_id"):
                ids = self.trend_index.setdefault((v["patient_id"], v["test_id"]), [])
                if v["id"] not in ids:
                    ids.append(v["id"])

    def delete_report(self, user_id: str, rid: str) -> bool:
        with self.lock:
            if not self.get_report(user_id, rid):
                return False
            self._delete_report_locked(rid)
            return True

    def _delete_report_locked(self, rid: str) -> None:
        for vid in [v["id"] for v in self.values.values() if v["report_id"] == rid]:
            v = self.values.pop(vid)
            if v.get("test_id"):
                key = (v["patient_id"], v["test_id"])
                self.trend_index[key] = [x for x in self.trend_index.get(key, []) if x != vid]
        self.reports.pop(rid, None)

    # -- trends
    def series(self, user_id: str, pid: str, test_id: str) -> list[dict]:
        if not self.get_patient(user_id, pid):
            return []
        vals = [self.values[i] for i in self.trend_index.get((pid, test_id), []) if i in self.values]
        return sorted((v for v in vals if v.get("included", True)), key=lambda v: v["report_date"])

    def tracked_tests(self, user_id: str, pid: str) -> list[str]:
        if not self.get_patient(user_id, pid):
            return []
        return [tid for (p, tid), ids in self.trend_index.items() if p == pid and len(ids) >= 2]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()
