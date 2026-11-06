"""Vercel FastAPI entrypoint: the platform looks for an `app` exposed from `index.py`."""

from app.main import app

__all__ = ["app"]
