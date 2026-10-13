# modules/messaging/__init__.py
# Dominio: Comunicacion segmentada entre administradores y jefes de estacion.
# Incluye: chat operativo (admin <-> jefe de estacion, por sala/estacion) y
#          chat interno (admin <-> admin).

from modules.messaging.chat import register as register_chat


def register(app):
    register_chat(app)
