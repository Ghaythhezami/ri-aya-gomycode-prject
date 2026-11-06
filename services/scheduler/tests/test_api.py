from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from tests.helpers import SECRET, make_token

OPT_BODY = {
    "doctors": [{"id": "a", "specialty": "GP", "available": [{"start": 0, "end": 3_600_000}]}],
    "appointments": [],
    "objective": "MIN_WAIT",
    "now": 0,
    "slotMinutes": 15,
    "dayStart": 0,
    "dayEnd": 86_400_000,
}
INSIGHTS_BODY = {"from": "2026-01-01", "to": "2026-01-31", "timeZone": "Europe/Paris"}


def test_health_without_store(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "store": "none"}


def test_health_store_down(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@127.0.0.1:1/none")
    monkeypatch.setattr("app.insights_repo.CONNECT_TIMEOUT_SECONDS", 1)
    assert client.get("/health").json() == {"status": "degraded", "store": "down"}


def test_request_id_is_echoed(client: TestClient) -> None:
    assert (
        client.get("/health", headers={"X-Request-Id": "req-123"}).headers["x-request-id"]
        == "req-123"
    )
    assert (
        client.get("/health", headers={"X-Request-Id": "bad id!"}).headers["x-request-id"]
        != "bad id!"
    )


def test_no_cors_headers(client: TestClient) -> None:
    response = client.get("/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in response.headers


@pytest.mark.parametrize("path", ["/v1/optimize", "/v1/insights"])
@pytest.mark.parametrize(
    "token",
    [
        None,
        "garbage",
        make_token(exp_in=-120),
        make_token(aud="riaya-comms"),
        make_token(iss="someone-else"),
        make_token(secret="another-secret-that-is-32-chars-long!!"),
        make_token(clinic_id=None),
        make_token(sub=None),
    ],
    ids=[
        "missing",
        "garbage",
        "expired",
        "wrong-aud",
        "wrong-iss",
        "wrong-secret",
        "no-clinic",
        "no-sub",
    ],
)
def test_rejected_tokens(client: TestClient, path: str, token: str | None) -> None:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    response = client.post(
        path, json=OPT_BODY if "optimize" in path else INSIGHTS_BODY, headers=headers
    )
    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHORIZED"


def test_leeway_accepts_slightly_expired(client: TestClient) -> None:
    token = make_token(exp_in=-10)
    response = client.post(
        "/v1/optimize", json=OPT_BODY, headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200


def test_alg_none_rejected(client: TestClient) -> None:
    import jwt

    token = jwt.encode(
        {
            "iss": "riaya-api",
            "aud": "riaya-scheduler",
            "sub": "x",
            "clinic_id": "c",
            "exp": 9_999_999_999,
        },
        None,
        algorithm="none",
    )
    response = client.post(
        "/v1/optimize", json=OPT_BODY, headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 401


def test_secret_too_short_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.config import ConfigError, load_settings

    monkeypatch.setenv("SCHEDULER_ENV", "production")
    monkeypatch.setenv("SERVICE_JWT_SECRET", "short")
    with pytest.raises(ConfigError):
        load_settings()
    monkeypatch.setenv("SERVICE_JWT_SECRET", SECRET)
    assert load_settings().port == 4100
    monkeypatch.setenv("SCHEDULER_ENV", "test")


def test_optimize_ok(client: TestClient, auth: dict[str, str]) -> None:
    response = client.post("/v1/optimize", json=OPT_BODY, headers=auth)
    assert response.status_code == 200
    assert response.json()["status"] == "NO_IMPROVEMENT"


def test_optimize_validation_shape(client: TestClient, auth: dict[str, str]) -> None:
    body = {**OPT_BODY, "objective": "NOPE", "slotMinutes": 0}
    response = client.post("/v1/optimize", json=body, headers=auth)
    assert response.status_code == 422
    payload = response.json()
    assert payload["code"] == "VALIDATION_FAILED"
    assert {d["field"] for d in payload["details"]} == {"objective", "slotMinutes"}


def test_insights_requires_store(client: TestClient, auth: dict[str, str]) -> None:
    response = client.post("/v1/insights", json=INSIGHTS_BODY, headers=auth)
    assert response.status_code == 503
    assert response.json()["code"] == "SERVICE_UNAVAILABLE"


def test_insights_store_unreachable(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@127.0.0.1:1/none")
    monkeypatch.setattr("app.insights_repo.CONNECT_TIMEOUT_SECONDS", 1)
    response = client.post("/v1/insights", json=INSIGHTS_BODY, headers=auth)
    assert response.status_code == 503
    assert response.json()["code"] == "SERVICE_UNAVAILABLE"
    assert "127.0.0.1" not in response.text


@pytest.mark.parametrize(
    ("body", "field"),
    [
        ({**INSIGHTS_BODY, "from": "2026-02-01"}, "to"),
        ({**INSIGHTS_BODY, "to": "2029-01-01"}, "to"),
        ({**INSIGHTS_BODY, "timeZone": "Mars/Olympus"}, "timeZone"),
        ({**INSIGHTS_BODY, "timeZone": "../etc/passwd"}, "timeZone"),
        ({**INSIGHTS_BODY, "from": "not-a-date"}, "from"),
        ({"to": "2026-01-31", "timeZone": "UTC"}, "from"),
    ],
)
def test_insights_validation(
    client: TestClient, auth: dict[str, str], body: dict, field: str
) -> None:
    response = client.post("/v1/insights", json=body, headers=auth)
    assert response.status_code == 422
    payload = response.json()
    assert payload["code"] == "VALIDATION_FAILED"
    assert field in {d["field"] for d in payload["details"]}


def test_range_of_730_days_is_accepted_731_is_not(client: TestClient, auth: dict[str, str]) -> None:
    ok = {"from": "2024-01-01", "to": "2025-12-30", "timeZone": "UTC"}  # 730 days
    bad = {"from": "2024-01-01", "to": "2025-12-31", "timeZone": "UTC"}  # 731 days
    assert (
        client.post("/v1/insights", json=ok, headers=auth).status_code == 503
    )  # passes validation
    assert client.post("/v1/insights", json=bad, headers=auth).status_code == 422


def test_clinic_id_in_body_is_ignored(client: TestClient, auth: dict[str, str]) -> None:
    body = {**INSIGHTS_BODY, "clinicId": "someone-else"}
    assert client.post("/v1/insights", json=body, headers=auth).status_code == 503


def test_unhandled_error_is_hidden(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    def boom(_: dict) -> dict:
        raise RuntimeError("secret detail /srv/app.py")

    monkeypatch.setattr("app.main.optimize", boom)
    response = client.post("/v1/optimize", json=OPT_BODY, headers=auth)
    assert response.status_code == 500
    assert response.json() == {"code": "INTERNAL", "message": "Internal error"}


def test_unknown_route_uses_uniform_error(client: TestClient) -> None:
    response = client.get("/nope")
    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"
