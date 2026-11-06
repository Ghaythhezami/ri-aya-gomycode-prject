from __future__ import annotations

import os

os.environ["SCHEDULER_ENV"] = "test"
os.environ.pop("DATABASE_URL", None)

import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.helpers import SECRET, make_token


@pytest.fixture(autouse=True)
def _env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SERVICE_JWT_SECRET", SECRET)
    monkeypatch.delenv("DATABASE_URL", raising=False)


@pytest.fixture
def client() -> TestClient:
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token()}"}
