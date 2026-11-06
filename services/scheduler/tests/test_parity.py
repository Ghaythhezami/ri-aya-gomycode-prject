"""Parity with the TypeScript optimiser: exact equality on every shared fixture."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.optimizer import optimize

FIXTURES = sorted((Path(__file__).parent / "fixtures").glob("optimizer-*.json"))


def test_fixtures_exist() -> None:
    assert len(FIXTURES) >= 8


@pytest.mark.parametrize("path", FIXTURES, ids=lambda p: p.stem)
def test_optimize_matches_typescript(path: Path) -> None:
    data = json.loads(path.read_text(encoding="utf-8"))
    assert optimize(data["input"]) == data["output"]


@pytest.mark.parametrize("path", FIXTURES, ids=lambda p: p.stem)
def test_http_matches_typescript(path: Path, client: TestClient, auth: dict[str, str]) -> None:
    data = json.loads(path.read_text(encoding="utf-8"))
    response = client.post("/v1/optimize", json=data["input"], headers=auth)
    assert response.status_code == 200, response.text
    assert response.json() == data["output"]


def test_optimizer_is_deterministic() -> None:
    data = json.loads(FIXTURES[0].read_text(encoding="utf-8"))
    assert optimize(data["input"]) == optimize(data["input"])
