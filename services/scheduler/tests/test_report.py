from __future__ import annotations

import io
import time

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader

from app.report import render_analytics_report, vis
from app.report_schemas import ReportRequest
from tests.helpers import make_token
from tests.report_fixture import arabic_payload, build_payload

URL = "/v1/reports/analytics"


def _payload(locale: str, **kw):  # type: ignore[no-untyped-def]
    return arabic_payload(**kw) if locale == "ar" else build_payload(locale, **kw)


@pytest.mark.parametrize("locale", ["en", "fr", "ar"])
def test_renders_with_insights_and_metadata(
    client: TestClient, auth: dict[str, str], locale: str
) -> None:
    response = client.post(URL, json=_payload(locale), headers=auth)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")
    reader = PdfReader(io.BytesIO(response.content))
    assert len(reader.pages) >= 2
    meta = reader.metadata
    assert meta is not None
    assert meta.title and "RI'AYA" in meta.title
    assert meta.author == ("مركز النور الطبي" if locale == "ar" else "Al Noor Medical Center")
    assert meta.creator == "RI'AYA"
    assert meta.producer == "RI'AYA"
    assert meta.subject
    assert reader.trailer["/Root"]["/Lang"] == locale


def test_no_insights_is_one_to_two_pages() -> None:
    pdf = render_analytics_report(ReportRequest.model_validate(build_payload(insights=False)))
    assert 1 <= len(PdfReader(io.BytesIO(pdf)).pages) <= 2


@pytest.mark.parametrize("locale", ["en", "fr", "ar"])
def test_empty_analytics_renders(client: TestClient, auth: dict[str, str], locale: str) -> None:
    body = _payload(locale, empty=True)
    body["analytics"] = {}
    response = client.post(URL, json=body, headers=auth)
    assert response.status_code == 200
    assert response.content.startswith(b"%PDF")
    body = _payload(locale, empty=True)
    body["insights"]["demand"] = {"matrix": []}
    body["insights"]["recommendations"] = []
    body["insights"]["forecast"] = []
    assert client.post(URL, json=body, headers=auth).status_code == 200


def test_page_footer_and_brand_text_extractable() -> None:
    pdf = render_analytics_report(ReportRequest.model_validate(build_payload("en")))
    reader = PdfReader(io.BytesIO(pdf))
    first = reader.pages[0].extract_text()
    assert "RI'AYA" in first
    assert "Page 1 of" in first
    assert "confidential" in first
    assert "Al Noor Medical Center" in first


def test_no_patient_fields_are_rendered() -> None:
    payload = build_payload("en")
    payload["analytics"]["patientName"] = "Secret Patient"
    pdf = render_analytics_report(ReportRequest.model_validate(payload))
    text = "".join(p.extract_text() for p in PdfReader(io.BytesIO(pdf)).pages)
    assert "Secret Patient" not in text


def test_arabic_shaping_and_bracket_mirroring() -> None:
    shown = vis("اتجاه (بالدقائق)")
    assert "(" in shown and ")" in shown
    assert shown.index(")") > shown.index("(") or shown[0] == "("
    assert vis("Latin only") == "Latin only"


def test_90_day_report_is_fast() -> None:
    req = ReportRequest.model_validate(arabic_payload(days=90))
    render_analytics_report(req)  # warm the font cache
    started = time.perf_counter()
    render_analytics_report(req)
    assert time.perf_counter() - started < 1.5


def test_requires_auth(client: TestClient) -> None:
    response = client.post(URL, json=build_payload())
    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHORIZED"
    bad = {"Authorization": f"Bearer {make_token(aud='riaya-comms')}"}
    assert client.post(URL, json=build_payload(), headers=bad).status_code == 401


def test_validation_error_shape(client: TestClient, auth: dict[str, str]) -> None:
    body = build_payload()
    body["locale"] = "de"
    body["clinic"]["timeZone"] = "Mars/Base"
    body["range"]["from"] = "yesterday"
    response = client.post(URL, json=body, headers=auth)
    assert response.status_code == 422
    payload = response.json()
    assert payload["code"] == "VALIDATION_FAILED"
    fields = {d["field"] for d in payload["details"]}
    assert {"locale", "clinic.timeZone", "range.from"} <= fields
    assert all(set(d) == {"field", "message"} for d in payload["details"])
