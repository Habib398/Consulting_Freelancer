"""
run_socketio.py
---------------
Servidor de produccion con soporte WebSockets (gevent + flask-socketio).
Usar este archivo en lugar de run_waitress.py cuando se requiera el chat
en tiempo real.

Comando:
    python run_socketio.py

Variables de entorno relevantes:
    HOST            (default: 127.0.0.1)
    PORT            (default: 5000)
    COG_WS_ORIGINS  (default: same-origin — para produccion usar el dominio real)
"""
from __future__ import annotations

import os
import sys

# Monkey-patch ANTES de cualquier otro import para que gevent funcione
# correctamente con sockets y threading del sistema operativo.
try:
    from gevent import monkey
    monkey.patch_all()
except ImportError:
    print("[ERROR] gevent no esta instalado. Ejecuta: pip install gevent gevent-websocket flask-socketio", flush=True)
    sys.exit(1)

from app import create_app
from flask_socketio import SocketIO

# Origenes permitidos para WebSocket (misma politica que la app)
_origins = os.environ.get("COG_WS_ORIGINS", "same-origin")

app    = create_app()
host   = os.environ.get("HOST", "127.0.0.1")
port   = int(os.environ.get("PORT", "5000"))
debug  = os.environ.get("APP_DEBUG", "0") == "1"

socketio: SocketIO = app.extensions["socketio"]

if __name__ == "__main__":
    print(f"[COG] Servidor WebSocket listo en http://{host}:{port}  (gevent)", flush=True)
    print(f"[COG] Presiona Ctrl+C para detener", flush=True)
    socketio.run(
        app,
        host=host,
        port=port,
        debug=debug,
        use_reloader=False,   # No compatible con gevent monkey-patch
        log_output=True,
    )
