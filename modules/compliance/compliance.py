from __future__ import annotations

import os
import datetime
import secrets
from pathlib import Path

from flask import jsonify, request, session, render_template, redirect
from werkzeug.utils import secure_filename

from db import get_conn, get_user
from services.branding import NORMATIVE_DEFAULTS, get_normative_config, get_normative_items
from modules.auth.auth import login_required, role_required


ALLOWED_EXTS = {".pdf", ".png", ".jpg", ".jpeg"}


def _brand() -> str:
    return "consulting"


def _is_allowed(filename: str) -> bool:
    ext = os.path.splitext(filename.lower())[1]
    return ext in ALLOWED_EXTS


def _detect_kind(data: bytes) -> str | None:
    # Magic bytes detection (lightweight)
    if data.startswith(b"%PDF"):
        return "pdf"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    return None


def register(app):
    pass
