"""Analytics PDF report (reportlab). Aggregates only: no patient data ever reaches this module.

Arabic: every string goes through `arabic-reshaper` + `python-bidi`, mixed-script runs are drawn
with Noto Naskh Arabic (Arabic letters) or Noto Sans (Latin, digits, symbols), and long Arabic
paragraphs are wrapped by hand because platypus wraps in visual order.
"""

from __future__ import annotations

import io
import math
import re
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape  # nosec B406 - escapes our own output markup, parses nothing
from zoneinfo import ZoneInfo

import arabic_reshaper
from bidi import get_display
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.charts.linecharts import HorizontalLineChart
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import (
    Flowable,
    HRFlowable,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from .report_i18n import LABELS, LEAD_TIME, MONTHS, STATUS, WEEKDAYS
from .report_schemas import ReportRequest

FONT_DIR = Path(__file__).parent / "fonts"
LATIN, LATIN_B, ARAB, ARAB_B = "NotoSans", "NotoSans-Bold", "NotoNaskh", "NotoNaskh-Bold"

# Brand tokens (backoffice/src/index.css)
PRIMARY = colors.HexColor("#0f766e")
PRIMARY_DARK = colors.HexColor("#0b5c56")
NAVY = colors.HexColor("#15283f")
TEXT = colors.HexColor("#172b4d")
MUTED = colors.HexColor("#5f6875")
BORDER = colors.HexColor("#e5eaf0")
ACCENT = colors.HexColor("#ddf6f3")
SURFACE = colors.HexColor("#f4f8fb")
SUCCESS = colors.HexColor("#166534")
ERROR = colors.HexColor("#b91c1c")
STATUS_COLORS = {
    "SCHEDULED": "#64748b",
    "CONFIRMED": "#1d4ed8",
    "CHECKED_IN": "#0891b2",
    "IN_PROGRESS": "#7c3aed",
    "COMPLETED": "#166534",
    "CANCELLED": "#b45309",
    "NO_SHOW": "#b91c1c",
}

PAGE_W, PAGE_H = A4
MARGIN_X, MARGIN_TOP, MARGIN_BOTTOM = 40, 36, 46
CONTENT_W = PAGE_W - 2 * MARGIN_X

_ARABIC = re.compile(r"[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]")
_SIGNED = re.compile(r"(?<![\w])[+\-−]?\d+(?:[.,:/\-]\d+)*(?:\s?%)?")
_MIRROR = str.maketrans("()[]<>{}", ")(][><}{")


# ------------------------------------------------------------------ fonts and text


@lru_cache(maxsize=1)
def register_fonts() -> None:
    for name, file in (
        (LATIN, "NotoSans-Regular.ttf"),
        (LATIN_B, "NotoSans-Bold.ttf"),
        (ARAB, "NotoNaskhArabic-Regular.ttf"),
        (ARAB_B, "NotoNaskhArabic-Bold.ttf"),
    ):
        pdfmetrics.registerFont(TTFont(name, str(FONT_DIR / file)))


# Unicode isolates built at runtime (no bidi control characters in this source file).
_LRI, _PDI = chr(0x2066), chr(0x2069)


def vis(text: str) -> str:
    """Logical -> visual order with Arabic shaping; Latin-only text is returned untouched."""
    if not _ARABIC.search(text):
        return text
    shaped = _SIGNED.sub(lambda m: f"{_LRI}{m.group(0)}{_PDI}", arabic_reshaper.reshape(text))
    shown = get_display(shaped, base_dir="R").replace(_LRI, "").replace(_PDI, "")
    return shown.translate(_MIRROR)  # python-bidi leaves brackets unmirrored


def runs(visual: str) -> list[tuple[bool, str]]:
    """Split visual text into (is_arabic, text) runs; spaces stay with the current run."""
    out: list[tuple[bool, str]] = []
    for ch in visual:
        arabic = bool(_ARABIC.match(ch))
        if ch.isspace() and out:
            out[-1] = (out[-1][0], out[-1][1] + ch)
        elif out and out[-1][0] == arabic:
            out[-1] = (arabic, out[-1][1] + ch)
        else:
            out.append((arabic, ch))
    return out


def font_for(arabic: bool, bold: bool) -> str:
    return (ARAB_B if bold else ARAB) if arabic else (LATIN_B if bold else LATIN)


def text_width(text: str, size: float, bold: bool = False) -> float:
    return sum(
        pdfmetrics.stringWidth(part, font_for(ar, bold), size) for ar, part in runs(vis(text))
    )


def draw_text(
    canv: Any,
    x: float,
    y: float,
    text: str,
    size: float,
    *,
    bold: bool = False,
    align: str = "left",
    color: Any = TEXT,
) -> None:
    parts = runs(vis(text))
    total = sum(pdfmetrics.stringWidth(p, font_for(ar, bold), size) for ar, p in parts)
    cursor = x - total if align == "right" else x - total / 2 if align == "center" else x
    canv.setFillColor(color)
    for ar, part in parts:
        font = font_for(ar, bold)
        canv.setFont(font, size)
        canv.drawString(cursor, y, part)
        cursor += pdfmetrics.stringWidth(part, font, size)


def markup(text: str, base_font: str, bold: bool = False) -> str:
    """Paragraph markup of `text`; runs whose font differs from the style font get a font tag."""
    out = []
    for ar, part in runs(vis(text)):
        font = font_for(ar, bold)
        escaped = escape(part)
        out.append(escaped if font == base_font else f'<font name="{font}">{escaped}</font>')
    return "".join(out)


def ellipsize(text: str, width: float, size: float, bold: bool = False) -> str:
    if text_width(text, size, bold) <= width:
        return text
    while text and text_width(text + "…", size, bold) > width:
        text = text[:-1]
    return text.rstrip() + "…"


def wrap_lines(text: str, width: float, size: float, bold: bool = False) -> list[str]:
    lines: list[str] = []
    current = ""
    for word in text.split():
        candidate = f"{current} {word}".strip()
        if current and text_width(candidate, size, bold) > width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines or [""]


# ------------------------------------------------------------------ formatting


class Ctx:
    def __init__(self, req: ReportRequest) -> None:
        self.req = req
        self.locale = req.locale
        self.rtl = req.locale == "ar"
        self.t = LABELS[req.locale]
        self.base = ARAB if self.rtl else LATIN
        self.base_b = ARAB_B if self.rtl else LATIN_B
        self.align = TA_RIGHT if self.rtl else TA_LEFT
        self.lead = 1.55 if self.rtl else 1.3

    def style(
        self,
        name: str,
        size: float,
        *,
        bold: bool = False,
        color: Any = TEXT,
        align: int | None = None,
        after: float = 0,
        before: float = 0,
    ) -> ParagraphStyle:
        return ParagraphStyle(
            name,
            fontName=self.base_b if bold else self.base,
            fontSize=size,
            leading=size * self.lead,
            textColor=color,
            alignment=self.align if align is None else align,
            spaceAfter=after,
            spaceBefore=before,
            wordWrap="LTR",
        )

    def mk(self, text: str, bold: bool = False) -> str:
        return markup(text, self.base_b if bold else self.base, bold)

    def num(self, value: float, decimals: int = 1, sign: bool = False) -> str:
        rounded = round(float(value), decimals)
        text = f"{rounded:+.{decimals}f}" if sign else f"{rounded:.{decimals}f}"
        if "." in text:
            text = text.rstrip("0").rstrip(".")
        if text in ("-0", "+0"):
            text = "0"
        return text.replace(".", ",") if self.locale == "fr" else text

    def pct(self, value: float, sign: bool = False) -> str:
        sep = " " if self.locale == "fr" else ""
        return f"{self.num(value, 1, sign)}{sep}%"

    def date(self, iso: str) -> str:
        try:
            y, m, d = (int(p) for p in iso[:10].split("-"))
            return f"{d} {MONTHS[self.locale][m - 1]} {y}"
        except (ValueError, IndexError):
            return iso

    def datetime(self, iso: str, zone: str) -> str:
        try:
            moment = datetime.fromisoformat(iso.replace("Z", "+00:00"))
            if moment.tzinfo is None:
                moment = moment.replace(tzinfo=ZoneInfo("UTC"))
            local = moment.astimezone(ZoneInfo(zone))
        except (ValueError, OSError):
            return iso
        return f"{self.date(local.strftime('%Y-%m-%d'))} {local:%H:%M}"

    def period(self) -> str:
        rng = self.req.range
        if rng.label:
            return rng.label
        return f"{self.date(rng.from_)} - {self.date(rng.to)}"


def rate_pct(rate: float) -> float:
    return rate * 100 if rate <= 1 else rate


def short_date(iso: str) -> str:
    return f"{iso[8:10]}/{iso[5:7]}" if len(iso) >= 10 else iso


def step_for(maximum: float) -> float:
    raw = max(maximum, 1) / 4
    mag = 10 ** math.floor(math.log10(raw))
    for factor in (1, 2, 5, 10):
        if factor * mag >= raw:
            return max(factor * mag, 1)
    return max(10 * mag, 1)


# ------------------------------------------------------------------ flowables


class HBars(Flowable):
    """Horizontal bar list: (label, value, value text, colour). Mirrored when `rtl`."""

    def __init__(
        self,
        items: list[tuple[str, float, str, Any]],
        width: float,
        rtl: bool,
        label_w: float = 110,
        row_h: float = 17,
    ) -> None:
        super().__init__()
        self.items, self.width, self.rtl = items, width, rtl
        self.label_w, self.row_h = label_w, row_h
        self.height = row_h * len(items)

    def wrap(self, *_: Any) -> tuple[float, float]:
        return self.width, self.height

    def draw(self) -> None:
        c = self.canv
        top = max((v for _, v, _, _ in self.items), default=0) or 1
        value_w = max((text_width(vt, 8, True) for _, _, vt, _ in self.items), default=0) + 6
        avail = self.width - self.label_w - 6 - value_w
        for i, (label, value, vtext, color) in enumerate(self.items):
            y = self.height - (i + 1) * self.row_h
            ty = y + self.row_h / 2 - 3
            bar_len = max(0.0, value / top * avail)
            label = ellipsize(label, self.label_w, 8)
            if self.rtl:
                right = self.width
                draw_text(c, right, ty, label, 8, align="right")
                x0 = right - self.label_w - 6
                c.setFillColor(SURFACE)
                c.roundRect(x0 - avail, y + 3, avail, self.row_h - 6, 2, stroke=0, fill=1)
                c.setFillColor(color)
                if bar_len > 0:
                    c.roundRect(x0 - bar_len, y + 3, bar_len, self.row_h - 6, 2, stroke=0, fill=1)
                draw_text(c, x0 - avail - 4, ty, vtext, 8, bold=True, align="right")
            else:
                draw_text(c, 0, ty, label, 8)
                x0 = self.label_w + 6
                c.setFillColor(SURFACE)
                c.roundRect(x0, y + 3, avail, self.row_h - 6, 2, stroke=0, fill=1)
                c.setFillColor(color)
                if bar_len > 0:
                    c.roundRect(x0, y + 3, bar_len, self.row_h - 6, 2, stroke=0, fill=1)
                draw_text(c, x0 + avail + 4, ty, vtext, 8, bold=True)


class ColumnBars(Flowable):
    """Vertical columns with labels underneath (peak hours, forecast). Mirrored when `rtl`."""

    def __init__(
        self,
        values: list[float],
        labels: list[str],
        width: float,
        rtl: bool,
        highlight: set[int] | None = None,
        height: float = 105,
        value_texts: list[str] | None = None,
    ) -> None:
        super().__init__()
        self.values, self.labels, self.width, self.rtl = values, labels, width, rtl
        self.highlight = highlight or set()
        self.height = height
        self.value_texts = value_texts

    def wrap(self, *_: Any) -> tuple[float, float]:
        return self.width, self.height

    def draw(self) -> None:
        c = self.canv
        n = len(self.values)
        if not n:
            return
        top = max(self.values) or 1
        pitch = self.width / n
        base_y, plot_h = 14.0, self.height - 14 - 12
        c.setStrokeColor(BORDER)
        c.setLineWidth(0.6)
        c.line(0, base_y, self.width, base_y)
        for i, value in enumerate(self.values):
            slot = n - 1 - i if self.rtl else i
            x = slot * pitch
            h = value / top * plot_h
            c.setFillColor(PRIMARY_DARK if i in self.highlight else colors.HexColor("#5eb5ac"))
            if h > 0:
                c.rect(x + pitch * 0.18, base_y, pitch * 0.64, h, stroke=0, fill=1)
            cx = x + pitch / 2
            if value > 0:
                text = self.value_texts[i] if self.value_texts else str(int(round(value)))
                draw_text(c, cx, base_y + h + 2, text, 6.5, align="center", color=TEXT)
            if self.labels[i]:
                draw_text(c, cx, 3, self.labels[i], 6.5, align="center", color=MUTED)


class Heatmap(Flowable):
    def __init__(
        self,
        matrix: list[list[float]],
        day_labels: list[str],
        width: float,
        rtl: bool,
    ) -> None:
        super().__init__()
        self.matrix, self.day_labels, self.width, self.rtl = matrix, day_labels, width, rtl
        used = [h for h in range(24) if any(len(r) > h and r[h] > 0 for r in matrix)]
        lo = min(used + [8]) if used else 8
        hi = max(used + [17]) if used else 17
        self.hours = list(range(lo, hi + 1))
        self.label_w = 52
        self.cell_h = 17
        self.height = self.cell_h * 7 + 14

    def wrap(self, *_: Any) -> tuple[float, float]:
        return self.width, self.height

    def draw(self) -> None:
        c = self.canv
        cols = len(self.hours)
        cell_w = (self.width - self.label_w) / cols
        peak = max((v for row in self.matrix for v in row), default=0) or 1
        for r in range(7):
            row = self.matrix[r] if r < len(self.matrix) else []
            y = 14 + (6 - r) * self.cell_h
            lx = self.width if self.rtl else 0
            draw_text(
                c,
                lx,
                y + 5,
                self.day_labels[r],
                7.5,
                align="right" if self.rtl else "left",
            )
            for k, hour in enumerate(self.hours):
                value = row[hour] if hour < len(row) else 0
                slot = cols - 1 - k if self.rtl else k
                x = slot * cell_w + (0 if self.rtl else self.label_w)
                ratio = value / peak
                fill = colors.Color(
                    0.96 - 0.96 * ratio + 0.043 * ratio,
                    0.97 - 0.97 * ratio + 0.463 * ratio,
                    0.97 - 0.97 * ratio + 0.431 * ratio,
                )
                c.setFillColor(fill)
                c.setStrokeColor(colors.white)
                c.setLineWidth(0.8)
                c.rect(x, y, cell_w, self.cell_h, stroke=1, fill=1)
                if value > 0 and cell_w >= 15:
                    draw_text(
                        c,
                        x + cell_w / 2,
                        y + 5,
                        str(int(round(value))),
                        6.5,
                        align="center",
                        color=colors.white if ratio > 0.5 else TEXT,
                    )
        for k, hour in enumerate(self.hours):
            slot = cols - 1 - k if self.rtl else k
            x = slot * cell_w + (0 if self.rtl else self.label_w)
            draw_text(c, x + cell_w / 2, 3, f"{hour:02d}", 6.5, align="center", color=MUTED)


# ------------------------------------------------------------------ page chrome


def canvas_factory(ctx: Ctx):
    clinic = ctx.req.clinic.name
    t = ctx.t
    rtl = ctx.rtl

    class NumberedCanvas(Canvas):
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            super().__init__(*args, **kwargs)
            self._pages: list[dict[str, Any]] = []

        def showPage(self) -> None:  # noqa: N802 (reportlab API)
            self._pages.append(dict(self.__dict__))
            self._startPage()

        def save(self) -> None:
            total = len(self._pages)
            for number, state in enumerate(self._pages, start=1):
                self.__dict__.update(state)
                self._chrome(number, total)
                super().showPage()
            super().save()

        def _chrome(self, number: int, total: int) -> None:
            self.setStrokeColor(BORDER)
            self.setLineWidth(0.6)
            self.line(MARGIN_X, 32, PAGE_W - MARGIN_X, 32)
            left, right = (PAGE_W - MARGIN_X, MARGIN_X) if rtl else (MARGIN_X, PAGE_W - MARGIN_X)
            side = "right" if rtl else "left"
            other = "left" if rtl else "right"
            draw_text(self, left, 20, t["footer"], 7.5, align=side, color=MUTED)
            page = f"{t['page']} {number} {t['of']} {total}"
            draw_text(self, right, 20, page, 7.5, align=other, color=MUTED)
            if number > 1:
                self.setFillColor(PRIMARY)
                self.rect(0, PAGE_H - 7, PAGE_W, 7, stroke=0, fill=1)
                title = f"{clinic} · {t['title']}"
                draw_text(self, left, PAGE_H - 24, title, 8, align=side, color=MUTED)

    return NumberedCanvas


# ------------------------------------------------------------------ sections


def _section(ctx: Ctx, title: str, *body: Any, keep: bool = True) -> list[Any]:
    head = Paragraph(ctx.mk(title, True), ctx.style("h2", 11.5, bold=True, color=NAVY, after=2))
    rule = HRFlowable(width="100%", thickness=1.2, color=PRIMARY, spaceAfter=6)
    items = [head, rule, *body, Spacer(1, 12)]
    return [KeepTogether(items)] if keep else items


def _empty(ctx: Ctx) -> Paragraph:
    return Paragraph(ctx.mk(ctx.t["no_data"]), ctx.style("empty", 9, color=MUTED, after=6))


def _header(ctx: Ctx) -> Table:
    req, t = ctx.req, ctx.t
    start = ctx.align
    end = TA_LEFT if ctx.rtl else TA_RIGHT
    scope = t["scope_organization"] if req.scope == "organization" else t["scope_clinic"]

    def small(label: str, value: str) -> str:
        return f'<font size="7" color="#bfe9e4">{ctx.mk(label)}</font><br/>{ctx.mk(value)}'

    brand = Paragraph(
        '<font color="#bfe9e4">RI\'AYA</font>',
        ParagraphStyle("brand", fontName=LATIN_B, fontSize=8, leading=11, alignment=start),
    )
    name = Paragraph(
        ctx.mk(req.clinic.name, True),
        ctx.style("clinic", 17, bold=True, color=colors.white, align=start),
    )
    title = Paragraph(
        ctx.mk(t["title"]), ctx.style("title", 11, color=colors.HexColor("#d8f3ef"), align=start)
    )
    info = ctx.style("info", 8.5, color=colors.white, align=end)
    right = [
        Paragraph(small(t["period"], ctx.period()), info),
        Spacer(1, 3),
        Paragraph(
            small(t["generated"], ctx.datetime(req.generated_at, req.clinic.time_zone)), info
        ),
        Spacer(1, 3),
        Paragraph(ctx.mk(scope), info),
    ]
    cells = [[[brand, name, title], right]]
    widths = [CONTENT_W * 0.58, CONTENT_W * 0.42]
    if ctx.rtl:
        cells = [[right, [brand, name, title]]]
        widths.reverse()
    table = Table(cells, colWidths=widths)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), PRIMARY),
                ("ROUNDEDCORNERS", [6, 6, 6, 6]),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 14),
                ("RIGHTPADDING", (0, 0), (-1, -1), 14),
                ("TOPPADDING", (0, 0), (-1, -1), 12),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
            ]
        )
    )
    return table


def _kpis(ctx: Ctx) -> list[Any]:
    k = ctx.req.analytics.kpis
    t = ctx.t
    docs = ctx.req.analytics.doctor_utilisation
    utilisation = sum(d.utilisation for d in docs) / len(docs) if docs else 0.0
    pp, mn = t["pp"], t["min"]

    def delta(value: float | None, unit: str, *, up_is_good: bool) -> tuple[str, Any]:
        if value is None:
            return "", MUTED
        if round(value, 1) == 0:
            return f"0 {unit}".strip(), MUTED
        sign = ctx.num(value, 1, True)
        good = (value > 0) == up_is_good
        text = f"{sign} %" if unit == "%" and ctx.locale == "fr" else f"{sign}{unit}"
        if unit != "%":
            text = f"{sign} {unit}"
        return text, (SUCCESS if good else ERROR)

    def pct_delta(value: float | None, good: bool) -> tuple[str, Any]:
        text, color = delta(value, "%", up_is_good=good)
        return text, color

    cards = [
        (t["kpi_volume"], ctx.num(k.volume, 0), pct_delta(k.volume_change_pct, True)),
        (
            t["kpi_noshow"],
            ctx.pct(k.no_show_rate),
            delta(k.no_show_rate_change, pp, up_is_good=False),
        ),
        (
            t["kpi_wait"],
            f"{ctx.num(k.avg_wait_minutes)} {mn}",
            delta(k.avg_wait_change, mn, up_is_good=False),
        ),
        (t["kpi_utilisation"], ctx.pct(utilisation), ("", MUTED)),
        (
            t["kpi_cancel"],
            ctx.pct(k.cancellation_rate),
            delta(k.cancellation_rate_change, pp, up_is_good=False),
        ),
    ]
    centre = TA_CENTER
    cells = []
    for label, value, (dtext, dcolor) in cards:
        cells.append(
            [
                Paragraph(
                    ctx.mk(value, True), ctx.style("kv", 15, bold=True, color=NAVY, align=centre)
                ),
                Paragraph(ctx.mk(label), ctx.style("kl", 7.5, color=MUTED, align=centre)),
                Paragraph(
                    ctx.mk(dtext, True) if dtext else "&nbsp;",
                    ctx.style("kd", 7.5, bold=True, color=dcolor, align=centre, before=2),
                ),
            ]
        )
    if ctx.rtl:
        cells.reverse()
    table = Table([cells], colWidths=[CONTENT_W / 5] * 5)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), SURFACE),
                ("INNERGRID", (0, 0), (-1, -1), 5, colors.white),
                ("BOX", (0, 0), (-1, -1), 0, colors.white),
                ("LINEABOVE", (0, 0), (-1, 0), 2.5, PRIMARY),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 9),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    caption = Paragraph(
        ctx.mk(f"{ctx.num(k.throughput_per_day)} {t['per_day']} · {t['vs_previous']}"),
        ctx.style("cap", 7, color=MUTED, before=4, after=10),
    )
    return [table, caption]


def _volume_chart(ctx: Ctx) -> list[Any]:
    days = ctx.req.analytics.volume_by_day
    if not days or not any(d.count for d in days):
        return _section(ctx, ctx.t["volume_by_day"], _empty(ctx))
    drawing = Drawing(CONTENT_W, 150)
    chart = VerticalBarChart()
    chart.x, chart.y, chart.width, chart.height = 28, 20, CONTENT_W - 34, 120
    values = [d.count for d in days]
    chart.data = [values]
    step = step_for(max(values))
    chart.valueAxis.valueMin = 0
    chart.valueAxis.valueMax = step * math.ceil(max(max(values), 1) / step)
    chart.valueAxis.valueStep = step
    chart.valueAxis.labels.fontName = LATIN
    chart.valueAxis.labels.fontSize = 6.5
    chart.valueAxis.labels.fillColor = MUTED
    chart.valueAxis.labelTextFormat = "%d"
    chart.valueAxis.strokeColor = BORDER
    chart.valueAxis.visibleGrid = 1
    chart.valueAxis.gridStrokeColor = BORDER
    chart.valueAxis.gridStrokeWidth = 0.5
    every = max(1, math.ceil(len(days) / 12))
    chart.categoryAxis.categoryNames = [
        short_date(d.date) if i % every == 0 else "" for i, d in enumerate(days)
    ]
    chart.categoryAxis.labels.fontName = LATIN
    chart.categoryAxis.labels.fontSize = 6.5
    chart.categoryAxis.labels.fillColor = MUTED
    chart.categoryAxis.visibleTicks = 0
    chart.categoryAxis.strokeColor = BORDER
    chart.bars[0].fillColor = PRIMARY
    chart.bars[0].strokeColor = None
    chart.groupSpacing = 0.6 if len(days) > 31 else 3
    chart.barSpacing = 0
    drawing.add(chart)
    return _section(ctx, ctx.t["volume_by_day"], drawing)


def _wait_chart(ctx: Ctx) -> list[Any]:
    days = ctx.req.analytics.wait_by_day
    if not days or not any(d.minutes for d in days):
        return _section(ctx, ctx.t["wait_trend"], _empty(ctx))
    drawing = Drawing(CONTENT_W, 140)
    chart = HorizontalLineChart()
    chart.x, chart.y, chart.width, chart.height = 28, 20, CONTENT_W - 40, 110
    values = [d.minutes for d in days]
    chart.data = [values]
    step = step_for(max(values))
    chart.valueAxis.valueMin = 0
    chart.valueAxis.valueMax = step * math.ceil(max(max(values), 1) / step)
    chart.valueAxis.valueStep = step
    chart.valueAxis.labels.fontName = LATIN
    chart.valueAxis.labels.fontSize = 6.5
    chart.valueAxis.labels.fillColor = MUTED
    chart.valueAxis.labelTextFormat = "%d"
    chart.valueAxis.strokeColor = BORDER
    chart.valueAxis.visibleGrid = 1
    chart.valueAxis.gridStrokeColor = BORDER
    chart.valueAxis.gridStrokeWidth = 0.5
    every = max(1, math.ceil(len(days) / 12))
    chart.categoryAxis.categoryNames = [
        short_date(d.date) if i % every == 0 else "" for i, d in enumerate(days)
    ]
    chart.categoryAxis.labels.fontName = LATIN
    chart.categoryAxis.labels.fontSize = 6.5
    chart.categoryAxis.labels.fillColor = MUTED
    chart.categoryAxis.visibleTicks = 0
    chart.categoryAxis.strokeColor = BORDER
    chart.joinedLines = 1
    chart.lines[0].strokeColor = colors.HexColor("#1d4ed8")
    chart.lines[0].strokeWidth = 1.6
    chart.lines[0].symbol = None
    drawing.add(chart)
    return _section(ctx, ctx.t["wait_trend"], drawing)


def _specialty_and_status(ctx: Ctx) -> list[Any]:
    a = ctx.req.analytics
    half = (CONTENT_W - 18) / 2
    spec_rows = sorted(a.by_specialty, key=lambda s: -s.count)[:10]
    if spec_rows and any(s.count for s in spec_rows):
        spec: Any = HBars(
            [(s.specialty, s.count, ctx.num(s.count, 0), PRIMARY) for s in spec_rows],
            half,
            ctx.rtl,
            label_w=92,
        )
    else:
        spec = _empty(ctx)
    total = sum(s.count for s in a.status_distribution)
    if total > 0:
        names = STATUS[ctx.locale]
        status: Any = HBars(
            [
                (
                    names.get(s.status, s.status),
                    s.count,
                    f"{ctx.num(s.count, 0)} · {ctx.pct(s.count / total * 100)}",
                    colors.HexColor(STATUS_COLORS.get(s.status, "#64748b")),
                )
                for s in a.status_distribution
                if s.count > 0
            ],
            half,
            ctx.rtl,
            label_w=70,
        )
    else:
        status = _empty(ctx)

    def block(title: str, body: Any) -> list[Any]:
        return [
            Paragraph(ctx.mk(title, True), ctx.style("h2", 11.5, bold=True, color=NAVY, after=2)),
            HRFlowable(width="100%", thickness=1.2, color=PRIMARY, spaceAfter=6),
            body,
        ]

    cells = [block(ctx.t["by_specialty"], spec), block(ctx.t["status"], status)]
    if ctx.rtl:
        cells.reverse()
    table = Table([[cells[0], "", cells[1]]], colWidths=[half, 18, half])
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return [KeepTogether([table]), Spacer(1, 12)]


class _Bar(Flowable):
    def __init__(self, ratio: float, width: float, rtl: bool, color: Any) -> None:
        super().__init__()
        self.ratio, self.width, self.rtl, self.color = min(max(ratio, 0), 1), width, rtl, color
        self.height = 8

    def wrap(self, *_: Any) -> tuple[float, float]:
        return self.width, self.height

    def draw(self) -> None:
        c = self.canv
        c.setFillColor(SURFACE)
        c.roundRect(0, 0, self.width, 7, 2, stroke=0, fill=1)
        c.setFillColor(self.color)
        length = self.width * self.ratio
        if length > 0:
            c.roundRect(self.width - length if self.rtl else 0, 0, length, 7, 2, stroke=0, fill=1)


def _simple_table(ctx: Ctx, header: list[str], rows: list[list[Any]], widths: list[float]) -> Table:
    head_style = ctx.style("th", 8, bold=True, color=colors.white)
    cell_style = ctx.style("td", 8.5)
    data = [[Paragraph(ctx.mk(h, True), head_style) for h in header]]
    for row in rows:
        data.append([Paragraph(ctx.mk(c), cell_style) if isinstance(c, str) else c for c in row])
    if ctx.rtl:
        data = [list(reversed(r)) for r in data]
        widths = list(reversed(widths))
    table = Table(data, colWidths=widths, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, SURFACE]),
                ("LINEBELOW", (0, 0), (-1, -1), 0.4, BORDER),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    return table


def _doctor_table(ctx: Ctx) -> list[Any]:
    docs = sorted(ctx.req.analytics.doctor_utilisation, key=lambda d: -d.utilisation)[:20]
    if not docs:
        return _section(ctx, ctx.t["doctor_util"], _empty(ctx))
    rows = []
    for d in docs:
        color = PRIMARY if d.utilisation >= 50 else colors.HexColor("#c2410c")
        rows.append(
            [
                d.name,
                ctx.pct(d.utilisation),
                _Bar(d.utilisation / 100, CONTENT_W * 0.4 - 14, ctx.rtl, color),
            ]
        )
    table = _simple_table(
        ctx,
        [ctx.t["doctor"], ctx.t["utilisation"], ""],
        rows,
        [CONTENT_W * 0.4, CONTENT_W * 0.2, CONTENT_W * 0.4],
    )
    return _section(ctx, ctx.t["doctor_util"], table, keep=len(rows) <= 12)


def _peak_hours(ctx: Ctx) -> list[Any]:
    by_hour = {p.hour: p.count for p in ctx.req.analytics.peak_hours}
    values = [float(by_hour.get(h, 0)) for h in range(24)]
    if not any(values):
        return _section(ctx, ctx.t["peak_hours"], _empty(ctx))
    top = sorted(range(24), key=lambda h: -values[h])[:3]
    chart = ColumnBars(
        values,
        [f"{h:02d}" for h in range(24)],
        CONTENT_W,
        ctx.rtl,
        highlight={h for h in top if values[h] > 0},
    )
    return _section(ctx, ctx.t["peak_hours"], chart)


def _recommendation_texts(ctx: Ctx) -> list[str]:
    ins = ctx.req.insights
    if ins is None:
        return []
    t, days = ctx.t, WEEKDAYS[ctx.locale]
    hour_sep = "h" if ctx.locale == "fr" else ":"
    out: list[str] = []

    def weekday(v: Any) -> str:
        return days[int(v) % 7]

    for rec in ins.recommendations:
        p = rec.params
        try:
            if rec.kind == "HIGH_NO_SHOW_SLOT":
                out.append(
                    t["rec_high_noshow"].format(
                        weekday=weekday(p.get("weekday", 0)),
                        hour=f"{int(p.get('hour', 0)):02d}".replace(":", hour_sep),
                        rate=ctx.num(float(p.get("rate", 0)) * 100),  # type: ignore[arg-type]
                        count=ctx.num(float(p.get("count", 0)), 0),  # type: ignore[arg-type]
                    )
                )
            elif rec.kind == "PEAK_HOURS":
                cells = list(p.get("cells", []))[:3]  # type: ignore[call-overload]
                text = ", ".join(
                    f"{weekday(c.get('weekday', 0))} {int(c.get('hour', 0)):02d}:00 "
                    f"({ctx.num(float(c.get('count', 0)), 0)})"
                    for c in cells
                    if isinstance(c, dict)
                )
                if text:
                    out.append(t["rec_peak"].format(cells=text))
            elif rec.kind == "UNDERUSED_DOCTOR":
                name = str(p.get("doctorName") or "").strip()
                key = "rec_underused" if name else "rec_underused_anon"
                out.append(
                    t[key].format(
                        name=name,
                        booked=ctx.num(float(p.get("bookedMinutes", 0)), 0),  # type: ignore[arg-type]
                        median=ctx.num(float(p.get("medianMinutes", 0)), 0),  # type: ignore[arg-type]
                    )
                )
        except (TypeError, ValueError, OverflowError):
            continue
    return out


def _insights(ctx: Ctx) -> list[Any]:
    ins = ctx.req.insights
    if ins is None:
        return []
    t = ctx.t
    story: list[Any] = [PageBreak()]
    story.append(
        Paragraph(ctx.mk(t["insights"], True), ctx.style("h1", 16, bold=True, color=NAVY, after=8))
    )
    totals = ins.totals
    summary = (
        f"{t['appointments']}: {ctx.num(totals.appointments, 0)} · "
        f"{t['noshow_short']}: {ctx.num(totals.no_shows, 0)} "
        f"({ctx.pct(rate_pct(totals.no_show_rate))})"
    )
    story.append(Paragraph(ctx.mk(summary), ctx.style("sum", 9, color=MUTED, after=10)))

    # Demand heatmap
    matrix = ins.demand.matrix
    if matrix and any(v for row in matrix for v in row):
        day_labels = [d if ctx.rtl else d[:3].capitalize() for d in WEEKDAYS[ctx.locale]]
        story += _section(
            ctx,
            t["heatmap"],
            Heatmap(matrix[:7] + [[]] * (7 - len(matrix)), day_labels, CONTENT_W, ctx.rtl),
        )
    else:
        story += _section(ctx, t["heatmap"], _empty(ctx))

    # No-show by lead time
    leads = ins.no_show.by_lead_time
    if leads:
        names = LEAD_TIME[ctx.locale]
        story += _section(
            ctx,
            t["leadtime"],
            HBars(
                [
                    (
                        names.get(r.key, r.key),
                        r.rate,
                        f"{ctx.pct(r.rate * 100)} · {ctx.num(r.count, 0)}",
                        colors.HexColor("#c2410c"),
                    )
                    for r in leads
                ],
                CONTENT_W,
                ctx.rtl,
                label_w=110,
            ),
        )

    # Forecast
    forecast = ins.forecast[:14]
    if forecast and any(f.expected for f in forecast):
        story += _section(
            ctx,
            t["forecast"],
            ColumnBars(
                [f.expected for f in forecast],
                [short_date(f.date) for f in forecast],
                CONTENT_W,
                ctx.rtl,
                value_texts=[ctx.num(f.expected, 1) for f in forecast],
            ),
        )

    # Doctor workload (names are staff, not patients)
    doctors = sorted(ins.doctors, key=lambda d: -d.appointments)[:10]
    if doctors:
        rows = [
            [
                d.doctor_name or "-",
                ctx.num(d.appointments, 0),
                ctx.pct(d.no_show_rate * 100 if d.no_show_rate <= 1 else d.no_show_rate),
            ]
            for d in doctors
        ]
        story += _section(
            ctx,
            t["doctors_insight"],
            _simple_table(
                ctx,
                [t["doctor"], t["appointments"], t["noshow_short"]],
                rows,
                [CONTENT_W * 0.5, CONTENT_W * 0.25, CONTENT_W * 0.25],
            ),
            keep=False,
        )

    # Recommendations
    texts = _recommendation_texts(ctx)
    text_w = CONTENT_W - 18
    body_style = ctx.style("rec", 9, after=0)
    bullet_style = ctx.style("bul", 9, bold=True, color=PRIMARY)
    if texts:
        rows = []
        for text in texts:
            if ctx.rtl:
                lines = wrap_lines(text, text_w - 4, 9)
                content = "<br/>".join(ctx.mk(line) for line in lines)
            else:
                content = ctx.mk(text)
            rows.append(
                [Paragraph("•", bullet_style), Paragraph(content, body_style)]
                if not ctx.rtl
                else [Paragraph(content, body_style), Paragraph("•", bullet_style)]
            )
        widths = [14, CONTENT_W - 14] if not ctx.rtl else [CONTENT_W - 14, 14]
        table = Table(rows, colWidths=widths)
        table.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LINEBELOW", (0, 0), (-1, -2), 0.4, BORDER),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                    ("LEFTPADDING", (0, 0), (-1, -1), 2),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                ]
            )
        )
        story += _section(ctx, t["recommendations"], table, keep=False)
    else:
        story += _section(
            ctx,
            t["recommendations"],
            Paragraph(ctx.mk(t["rec_none"]), ctx.style("none", 9, color=MUTED)),
        )
    return story


# ------------------------------------------------------------------ entry point


def render_analytics_report(req: ReportRequest) -> bytes:
    register_fonts()
    ctx = Ctx(req)
    title = f"RI'AYA - {ctx.t['title']} - {req.clinic.name} ({req.range.from_} / {req.range.to})"
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=MARGIN_X,
        rightMargin=MARGIN_X,
        topMargin=MARGIN_TOP,
        bottomMargin=MARGIN_BOTTOM,
        title=title,
        author=req.clinic.name,
        subject=ctx.t["subject"],
        creator="RI'AYA",
        producer="RI'AYA",
        lang=req.locale,
    )
    story: list[Any] = [_header(ctx), Spacer(1, 12)]
    story += _kpis(ctx)
    story += _volume_chart(ctx)
    story += _wait_chart(ctx)
    story += _specialty_and_status(ctx)
    story += _doctor_table(ctx)
    story += _peak_hours(ctx)
    story += _insights(ctx)
    doc.build(story, canvasmaker=canvas_factory(ctx))
    return buffer.getvalue()
