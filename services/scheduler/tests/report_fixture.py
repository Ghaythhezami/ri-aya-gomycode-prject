"""Realistic aggregate payload for the analytics report tests and sample renders."""

from __future__ import annotations

import math
from datetime import date, timedelta
from typing import Any

SPECIALTIES = [
    ("General Medicine", 412),
    ("Cardiology", 268),
    ("Pediatrics", 233),
    ("Dermatology", 171),
    ("Orthopedics", 126),
    ("Gynecology", 118),
    ("ENT", 74),
]
DOCTORS = [
    ("Dr. Amira Hassan", 86),
    ("Dr. Karim Nasser", 78),
    ("Dr. Salma Idris", 71),
    ("Dr. Youssef Mansour", 64),
    ("Dr. Leila Fares", 52),
    ("Dr. Omar Tarek", 38),
]
HOUR_WEIGHTS = [4, 9, 12, 11, 7, 5, 8, 10, 9, 6, 3]


def build_payload(
    locale: str = "en",
    *,
    days: int = 90,
    insights: bool = True,
    empty: bool = False,
) -> dict[str, Any]:
    end = date(2026, 11, 5)
    start = end - timedelta(days=days - 1)
    dates = [start + timedelta(days=i) for i in range(days)]

    def volume(i: int, d: date) -> int:
        if empty or d.weekday() == 4:
            return 0
        return int(round(24 + 9 * math.sin(i / 6) + (6 if d.weekday() in (0, 1) else 0)))

    def wait(i: int) -> float:
        return 0.0 if empty else round(17 + 5 * math.sin(i / 9) + (i % 5) * 0.6, 1)

    vol = [{"date": d.isoformat(), "count": volume(i, d)} for i, d in enumerate(dates)]
    total = sum(v["count"] for v in vol)
    hours = [0.0] * 24
    for h, w in zip(range(8, 19), HOUR_WEIGHTS, strict=True):
        hours[h] = 0 if empty else w * 11
    rng = {"from": dates[0].isoformat(), "to": dates[-1].isoformat()}
    statuses = [
        ("COMPLETED", 1210),
        ("CONFIRMED", 160),
        ("SCHEDULED", 95),
        ("CANCELLED", 190),
        ("NO_SHOW", 140),
        ("CHECKED_IN", 12),
        ("IN_PROGRESS", 6),
    ]
    analytics: dict[str, Any] = {
        "range": rng,
        "previous": {"from": "2026-05-09", "to": "2026-08-06"},
        "scope": "clinic",
        "kpis": {
            "volume": total,
            "volumeChangePct": 0 if empty else 8.4,
            "noShowRate": 0 if empty else 6.8,
            "noShowRateChange": 0 if empty else -1.2,
            "cancellationRate": 0 if empty else 9.3,
            "cancellationRateChange": 0 if empty else 0.7,
            "avgWaitMinutes": 0 if empty else 18.4,
            "avgWaitChange": 0 if empty else -2.1,
            "throughputPerDay": round(total / days, 1),
            "throughputChangePct": 0 if empty else 3.2,
            "avgDurationMinutes": 0 if empty else 24.5,
        },
        "volumeByDay": vol,
        "waitByDay": [{"date": d.isoformat(), "minutes": wait(i)} for i, d in enumerate(dates)],
        "bySpecialty": [] if empty else [{"specialty": s, "count": c} for s, c in SPECIALTIES],
        "statusDistribution": [{"status": s, "count": 0 if empty else c} for s, c in statuses],
        "doctorUtilisation": []
        if empty
        else [
            {"doctorId": f"d{i}", "name": n, "utilisation": u} for i, (n, u) in enumerate(DOCTORS)
        ],
        "peakHours": [{"hour": h, "count": c} for h, c in enumerate(hours)],
    }
    payload: dict[str, Any] = {
        "locale": locale,
        "clinic": {"name": "Al Noor Medical Center", "timeZone": "Africa/Cairo", "currency": "EGP"},
        "range": rng,
        "scope": "clinic",
        "generatedAt": "2026-11-06T10:42:00Z",
        "analytics": analytics,
        "insights": None,
    }
    if insights:
        matrix = [[0.0] * 24 for _ in range(7)]
        for wd in range(7):
            for h, w in zip(range(8, 19), HOUR_WEIGHTS, strict=True):
                matrix[wd][h] = (
                    0 if (empty or wd in (4, 5)) else float(int(w * (1.3 if wd < 2 else 1)))
                )
        payload["insights"] = {
            "range": {**rng, "timeZone": "Africa/Cairo"},
            "totals": {
                "appointments": total,
                "completed": 1210,
                "noShows": 140,
                "cancelled": 190,
                "noShowRate": 0.068,
            },
            "demand": {"matrix": matrix, "peak": []},
            "noShow": {
                "byLeadTime": [
                    {"key": "0-1d", "rate": 0.031, "count": 410},
                    {"key": "2-7d", "rate": 0.052, "count": 760},
                    {"key": "8-30d", "rate": 0.088, "count": 520},
                    {"key": "31d+", "rate": 0.134, "count": 140},
                ]
            },
            "doctors": [
                {
                    "doctorId": f"d{i}",
                    "doctorName": n,
                    "appointments": u * 3,
                    "noShowRate": 0.05 + i * 0.01,
                }
                for i, (n, u) in enumerate(DOCTORS)
            ],
            "forecast": [
                {"date": (end + timedelta(days=i + 1)).isoformat(), "expected": 22 + (i % 7) * 1.6}
                for i in range(14)
            ],
            "recommendations": [
                {
                    "kind": "HIGH_NO_SHOW_SLOT",
                    "params": {"weekday": 0, "hour": 9, "rate": 0.19, "count": 48},
                },
                {
                    "kind": "PEAK_HOURS",
                    "params": {
                        "cells": [
                            {"weekday": 1, "hour": 10, "count": 64},
                            {"weekday": 0, "hour": 11, "count": 59},
                            {"weekday": 2, "hour": 10, "count": 55},
                        ]
                    },
                },
                {
                    "kind": "UNDERUSED_DOCTOR",
                    "params": {
                        "doctorId": "d5",
                        "doctorName": "Dr. Omar Tarek",
                        "bookedMinutes": 3100,
                        "medianMinutes": 5200,
                    },
                },
            ],
            "meta": {"rowsScanned": total, "chunks": 1, "durationMs": 12, "engine": "numpy"},
        }
    return payload


def arabic_payload(days: int = 90, **kw: Any) -> dict[str, Any]:
    payload = build_payload("ar", days=days, **kw)
    payload["clinic"]["name"] = "مركز النور الطبي"
    specialties = [
        "الطب العام",
        "القلب",
        "الأطفال",
        "الجلدية",
        "العظام",
        "النساء والتوليد",
        "الأنف والأذن",
    ]
    for row, name in zip(payload["analytics"]["bySpecialty"], specialties, strict=False):
        row["specialty"] = name
    doctors = [
        "د. أميرة حسن",
        "د. كريم ناصر",
        "د. سلمى إدريس",
        "د. يوسف منصور",
        "د. ليلى فارس",
        "د. عمر طارق",
    ]
    for row, name in zip(payload["analytics"]["doctorUtilisation"], doctors, strict=False):
        row["name"] = name
    if payload["insights"]:
        for row, name in zip(payload["insights"]["doctors"], doctors, strict=False):
            row["doctorName"] = name
        payload["insights"]["recommendations"][2]["params"]["doctorName"] = doctors[5]
    return payload
