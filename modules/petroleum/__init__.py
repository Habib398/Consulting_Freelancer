# modules/petroleum/__init__.py
# Módulo Petroleum: rutas alias/redirect que mapean /petroleum/* a las rutas
# existentes en otros módulos (compliance, operations, admin, etc.).

from modules.petroleum.petroleum import register

__all__ = ["register"]
