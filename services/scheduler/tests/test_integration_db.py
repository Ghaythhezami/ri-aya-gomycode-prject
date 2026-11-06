"""Optional integration test against the local docker PostgreSQL; skipped when unreachable."""

from __future__ import annotations

import os

import psycopg
import pytest
from fastapi.testclient import TestClient

from tests.helpers import make_token

URL = os.environ.get("RIAYA_TEST_DATABASE_URL", "postgresql://riaya:riaya@localhost:5432/riaya")


def _clinic_ids() -> list[str]:
    try:
        with psycopg.connect(URL, connect_timeout=2) as conn:
            return [r[0] for r in conn.execute('SELECT id FROM "clinics" ORDER BY id').fetchall()]
    except psycopg.Error:
        return []


CLINICS = _clinic_ids()
pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(not CLINICS, reason="local PostgreSQL not reachable or not seeded"),
]


def _count(clinic_id: str) -> int:
    with psycopg.connect(URL) as conn:
        row = conn.execute(
            'SELECT count(*) FROM "appointments" WHERE "clinicId" = %s', (clinic_id,)
        ).fetchone()
        return int(row[0])


def test_insights_against_local_postgres(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATABASE_URL", URL)
    clinic = CLINICS[0]
    headers = {"Authorization": f"Bearer {make_token(clinic_id=clinic)}"}
    body = {"from": "2025-01-01", "to": "2026-12-31", "timeZone": "Africa/Tunis"}
    response = client.post("/v1/insights", json=body, headers=headers)
    assert response.status_code == 200, response.text
    out = response.json()
    assert out["meta"]["rowsScanned"] == out["totals"]["appointments"]
    assert out["totals"]["appointments"] <= _count(clinic)
    assert len(out["demand"]["matrix"]) == 7
    assert len(out["forecast"]) == 14
    assert client.get("/health").json() == {"status": "ok", "store": "up"}


def test_other_clinic_gets_no_rows(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", URL)
    headers = {"Authorization": f"Bearer {make_token(clinic_id='no-such-clinic')}"}
    body = {"from": "2025-01-01", "to": "2026-12-31", "timeZone": "UTC"}
    out = client.post("/v1/insights", json=body, headers=headers).json()
    assert out["totals"]["appointments"] == 0
