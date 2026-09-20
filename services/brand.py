from __future__ import annotations

from flask import has_request_context, session

VALID_BRANDS = ("consulting",)

def get_brand(default: str = "consulting") -> str:
    if not has_request_context():
        return "consulting"
    b = (session.get("brand") or "consulting").strip().lower()
    return b if b in VALID_BRANDS else "consulting"

def set_brand(brand: str) -> str:
    session["brand"] = "consulting"
    return "consulting"

def parse_allowed_brands(value: str | None) -> set[str]:
    return {"consulting"}

def user_allows_brand(user: dict | None, brand: str) -> bool:
    return brand == "consulting"
