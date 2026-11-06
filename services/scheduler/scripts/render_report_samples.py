"""Render sample analytics reports and PNGs: python scripts/render_report_samples.py OUT_DIR"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import pypdfium2 as pdfium

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.report import render_analytics_report  # noqa: E402
from app.report_schemas import ReportRequest  # noqa: E402
from tests.report_fixture import arabic_payload, build_payload  # noqa: E402


def main(out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    for locale in ("en", "fr", "ar"):
        payload = arabic_payload() if locale == "ar" else build_payload(locale)
        started = time.perf_counter()
        pdf = render_analytics_report(ReportRequest.model_validate(payload))
        ms = (time.perf_counter() - started) * 1000
        (out / f"report-{locale}.pdf").write_bytes(pdf)
        doc = pdfium.PdfDocument(pdf)
        for index in range(len(doc)):
            doc[index].render(scale=1.6).to_pil().save(out / f"report-{locale}-p{index + 1}.png")
        print(f"{locale}: {len(doc)} pages, {len(pdf) // 1024} KiB, {ms:.0f} ms")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
