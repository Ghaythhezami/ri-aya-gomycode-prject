from datetime import UTC, datetime, timedelta

from tests.conftest import TEST_SECRET, auth, make_token


async def test_health_is_open(client):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "store": "up"}


async def test_request_id_passthrough_and_generated(client):
    r = await client.get("/health", headers={"X-Request-Id": "abc-123"})
    assert r.headers["x-request-id"] == "abc-123"
    r = await client.get("/health", headers={"X-Request-Id": "bad id with spaces"})
    assert r.headers["x-request-id"] != "bad id with spaces"
    assert len(r.headers["x-request-id"]) == 32


async def _expect_401(client, headers):
    r = await client.get("/v1/notifications/unread-count", headers=headers)
    assert r.status_code == 401
    assert r.json()["code"] == "UNAUTHORIZED"
    assert set(r.json()) <= {"code", "message", "details"}


async def test_missing_token(client):
    await _expect_401(client, {})


async def test_malformed_header(client):
    await _expect_401(client, {"Authorization": "Token abc"})
    await _expect_401(client, {"Authorization": "Bearer not-a-jwt"})


async def test_wrong_signature(client):
    token = make_token(secret="another-secret-0123456789-abcdefghijklmnopq")
    await _expect_401(client, {"Authorization": f"Bearer {token}"})


async def test_wrong_audience_and_issuer(client):
    for extra in ({"aud": "riaya-scheduler"}, {"iss": "someone-else"}):
        await _expect_401(client, {"Authorization": f"Bearer {make_token(**extra)}"})


async def test_expired_beyond_leeway(client):
    past = datetime.now(UTC) - timedelta(seconds=120)
    await _expect_401(client, {"Authorization": f"Bearer {make_token(exp=past)}"})


async def test_expired_within_leeway_is_accepted(client):
    just_expired = datetime.now(UTC) - timedelta(seconds=10)
    r = await client.get(
        "/v1/notifications/unread-count",
        headers={"Authorization": f"Bearer {make_token(exp=just_expired)}"},
    )
    assert r.status_code == 200


async def test_missing_required_claims(client):
    await _expect_401(client, {"Authorization": f"Bearer {make_token(clinic=None)}"})
    await _expect_401(client, {"Authorization": f"Bearer {make_token(sub=None)}"})
    await _expect_401(client, {"Authorization": f"Bearer {make_token(exp=None)}"})


async def test_none_algorithm_rejected(client):
    import jwt

    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "iss": "riaya-api",
            "aud": "riaya-comms",
            "sub": "u",
            "clinic_id": "c",
            "exp": now + timedelta(seconds=60),
        },
        key=None,
        algorithm="none",
    )
    await _expect_401(client, {"Authorization": f"Bearer {token}"})


async def test_validation_error_shape(client):
    r = await client.post("/v1/notifications", headers=auth(), json={"category": "NOPE"})
    assert r.status_code == 422
    body = r.json()
    assert body["code"] == "VALIDATION_FAILED"
    assert isinstance(body["details"], list) and body["details"]
    assert {"field", "message", "type"} <= set(body["details"][0])
    assert "input" not in body["details"][0]


async def test_clinic_id_in_body_is_rejected(client):
    r = await client.post(
        "/v1/notifications",
        headers=auth(),
        json={
            "clinicId": "clinic-b",
            "category": "SYSTEM",
            "titleKey": "t",
            "bodyKey": "b",
            "dedupeKey": "x",
        },
    )
    assert r.status_code == 422


async def test_unknown_route_uses_error_shape(client):
    r = await client.get("/v1/nope", headers=auth())
    assert r.status_code == 404
    assert r.json()["code"] == "NOT_FOUND"


async def test_store_down_returns_503(client):
    from app import db as db_module

    real_client, real_flag = db_module._client, db_module._indexed
    db_module._client = db_module.make_client("mongodb://127.0.0.1:1")
    db_module._indexed = False
    try:
        r = await client.get("/v1/notifications/unread-count", headers=auth())
        assert r.status_code == 503
        assert r.json()["code"] == "SERVICE_UNAVAILABLE"
        h = await client.get("/health")
        assert h.json() == {"status": "degraded", "store": "down"}
    finally:
        await db_module._client.close()
        db_module._client, db_module._indexed = real_client, real_flag


def test_secret_constant_is_long_enough():
    assert len(TEST_SECRET) >= 32
