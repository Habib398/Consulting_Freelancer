# modules/petroleum/petroleum.py
# Módulo Petroleum: rutas alias/redirect para el brand petroleum.
#
# NOTA: Las rutas /petroleum/normativas-control y /petroleum/expedientes
# ya están definidas en modules/compliance/tramites_normativas.py con
# la lógica completa — no se duplican aquí.
#
# Este módulo define las rutas restantes que no tienen home en otro módulo.

from __future__ import annotations

from flask import redirect, session
from modules.auth.auth import login_required, role_required


def register(app):

    @app.get("/petroleum/normativas")
    @login_required
    def petroleum_normativas():
        """Normativas por estación Petroleum → Inbox admin."""
        session.setdefault("brand", "petroleum")
        return redirect("/admin/inbox")

    @app.get("/petroleum/cumplimiento")
    @login_required
    def petroleum_cumplimiento():
        """Cumplimiento normativo Petroleum → módulo compliance."""
        session.setdefault("brand", "petroleum")
        return redirect("/mod/compliance")

    @app.get("/petroleum")
    @login_required
    def petroleum_index():
        """Raíz Petroleum → Admin menu (con brand=petroleum en sesión)."""
        session.setdefault("brand", "petroleum")
        return redirect("/admin/menu")
