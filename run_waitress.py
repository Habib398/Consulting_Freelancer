import os
import sys
from waitress import serve
from app import create_app

app = create_app()
host = os.environ.get("HOST", "127.0.0.1")
port = int(os.environ.get("PORT", "5000"))
threads = int(os.environ.get("COG_WAITRESS_THREADS", "4"))

print(f"[COG] Servidor listo en http://{host}:{port}  (threads={threads})", flush=True)
print(f"[COG] Presiona Ctrl+C para detener", flush=True)

serve(app, host=host, port=port, threads=threads)
