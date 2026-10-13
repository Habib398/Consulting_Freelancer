from __future__ import annotations

from flask import has_request_context, session

VALID_BRANDS = ("consulting", "petroleum")


def get_brand(default: str = "consulting") -> str:
    if not has_request_context():
        return default if default in VALID_BRANDS else "consulting"
    b = (session.get("brand") or default or "consulting").strip().lower()
    return b if b in VALID_BRANDS else "consulting"


def set_brand(brand: str) -> str:
    b = (brand or "consulting").strip().lower()
    if b not in VALID_BRANDS:
        b = "consulting"
    session["brand"] = b
    return b


def parse_allowed_brands(value: str | None) -> set[str]:
    """Parsea el campo allowed_brands de un usuario (CSV) y devuelve solo brands válidos."""
    if not value:
        return {"consulting"}
    parsed = {b.strip().lower() for b in str(value).split(",") if b.strip()}
    valid = parsed & set(VALID_BRANDS)
    return valid if valid else {"consulting"}


def user_allows_brand(user: dict | None, brand: str) -> bool:
    """Devuelve True si el usuario tiene permiso de acceder al brand indicado."""
    allowed = parse_allowed_brands((user or {}).get("allowed_brands"))
    return brand in allowed
