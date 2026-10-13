"""
seed_petroleum_demo.py — Llena el brand PETROLEUM con datos de demostración
para que el subsistema muestre información (estaciones, agenda, entregas,
pagos, normativas, expedientes, semáforo de cumplimiento, chat y avisos).

Todo lo insertado se registra (por tabla e id) en system_state con la llave
'demo_petroleum_seed', de modo que --undo elimina exactamente esos registros
y nada más. Antes de escribir se hace un respaldo de la BD en backups/.

Uso:
    python scripts/seed_petroleum_demo.py           # sembrar
    python scripts/seed_petroleum_demo.py --undo    # revertir lo sembrado
"""
from __future__ import annotations

import argparse
import json
import os
import random
import shutil
import sqlite3
from datetime import date, datetime, timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = Path(os.environ.get("COG_DB_PATH") or BASE_DIR / "data" / "cog_work_log.db")
BACKUP_DIR = DB_PATH.parent.parent / "backups" if not os.environ.get("COG_DB_PATH") else DB_PATH.parent
BRAND = "petroleum"
STATE_KEY = "demo_petroleum_seed"

STATIONS = [
    # code, name, group, state, city, address, lat, lng
    ("P-001", "Petroleum Pachuca Centro", "Corredor Hidalgo", "Hidalgo", "Pachuca", "Av. Juárez 1201", 20.1011, -98.7591),
    ("P-002", "Petroleum Tulancingo", "Corredor Hidalgo", "Hidalgo", "Tulancingo", "Carr. México-Tuxpan km 128", 20.0833, -98.3667),
    ("P-003", "Petroleum Querétaro Norte", "Corredor Bajío", "Querétaro", "Querétaro", "Blvd. Bernardo Quintana 4100", 20.6280, -100.3770),
    ("P-004", "Petroleum Celaya Oriente", "Corredor Bajío", "Guanajuato", "Celaya", "Av. Tecnológico 905", 20.5300, -100.8000),
]

PROFILES = {
    "P-001": ("PL/10234/EXP/ES/2019", "Combustibles Pachuca S.A. de C.V.", "CPA190312AB1", "Ing. Laura Méndez Ortiz", "Carlos Ramírez"),
    "P-002": ("PL/11872/EXP/ES/2020", "Servicios Energéticos Tulancingo S.A. de C.V.", "SET200715KL3", "Lic. Jorge Salinas Vega", "Ana Torres"),
    "P-003": ("PL/09541/EXP/ES/2018", "Gasolineras del Bajío S.A. de C.V.", "GBA180904QR7", "Ing. Ricardo Fuentes Lara", "Miguel Ángel Ruiz"),
    "P-004": ("PL/12650/EXP/ES/2021", "Energía Celaya S.A. de C.V.", "ECE210122MN5", "C.P. Patricia Herrera Solís", "Daniela Castro"),
}

ACTIVITIES = [
    # title, description, recurrence
    ("Bitácora de operación diaria", "Registro de lecturas de tanques, recepción de producto y novedades del turno.", "weekly"),
    ("Inspección de seguridad NOM-005", "Recorrido de seguridad: extintores, señalización, paros de emergencia y rutas de evacuación.", "monthly"),
    ("Verificación de dispensarios", "Revisión de mangueras, pistolas, breakaways y calibración de dispensarios.", "monthly"),
    ("Control volumétrico Anexo 30-31", "Conciliación de inventarios y envío de reportes de controles volumétricos.", "monthly"),
    ("Pruebas de hermeticidad", "Pruebas de hermeticidad a tanques y tuberías con proveedor acreditado.", "quarterly"),
    ("Simulacro de emergencia", "Simulacro de derrame/incendio con brigadas internas y registro fotográfico.", "quarterly"),
]

# Usuarios de campo exclusivos de petroleum: los usuarios existentes tienen su
# station_id en una estación consulting, y varias vistas de jefe/operador se
# basan solo en ese campo, por lo que no verían datos petroleum.
DEMO_PASSWORD = "PetroDemo2026!"
DEMO_USERS = [
    # username, role, station code
    ("jefe_petroleum", "jefe_estacion", "P-001"),
    ("op_petroleum", "operador", "P-001"),
]

SUBMISSION_NOTES = [
    "Actividad realizada sin observaciones.",
    "Se anexan evidencias fotográficas.",
    "Personal de turno capacitado y presente.",
    "Se detectó detalle menor, corregido en sitio.",
    "Lecturas dentro de rango.",
]


def open_conn() -> sqlite3.Connection:
    if not DB_PATH.exists():
        raise SystemExit(f"BD no encontrada en {DB_PATH}")
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def backup_db() -> Path:
    BACKUP_DIR.mkdir(exist_ok=True)
    dst = BACKUP_DIR / f"cog_work_log_pre_petroleum_seed_{datetime.now():%Y%m%d_%H%M%S}.db"
    shutil.copy2(DB_PATH, dst)
    return dst


def load_state(conn) -> dict | None:
    r = conn.execute("SELECT value FROM system_state WHERE key=?", (STATE_KEY,)).fetchone()
    return json.loads(r["value"]) if r and r["value"] else None


def month_starts(year: int, months: range):
    return [date(year, m, 1) for m in months]


def seed() -> dict:
    conn = open_conn()
    if load_state(conn):
        conn.close()
        raise SystemExit("Ya existe un sembrado demo de petroleum. Ejecuta --undo primero.")

    rng = random.Random(2026)
    today = date.today()
    ids: dict[str, list] = {}

    def track(table, value):
        ids.setdefault(table, []).append(value)

    users = {r["username"]: dict(r) for r in conn.execute("SELECT id, username, role FROM users WHERE is_active=1")}
    admin_id = next((u["id"] for u in users.values() if u["role"] == "admin"), None)
    field_users = [u for u in users.values() if u["role"] in ("jefe_estacion", "operador")]
    operators = [u for u in field_users if u["role"] == "operador"] or field_users

    cur = conn.cursor()

    # 1. Estaciones + perfiles
    station_ids = []
    for code, name, group, state, city, addr, lat, lng in STATIONS:
        if conn.execute("SELECT 1 FROM stations WHERE code=?", (code,)).fetchone():
            conn.close()
            raise SystemExit(f"Ya existe una estación con código {code}; aborta para no duplicar.")
        cur.execute(
            "INSERT INTO stations (brand, name, code, station_number, group_name, state, city, address, lat, lng, monthly_status, monthly_end) "
            "VALUES (?,?,?,?,?,?,?,?,?,?, 'active', ?)",
            (BRAND, name, code, code.replace("P-", ""), group, state, city, addr, lat, lng, f"{today.year}-12-31"),
        )
        sid = cur.lastrowid
        station_ids.append(sid)
        track("stations", sid)
        permit, legal, rfc, rep, resp = PROFILES[code]
        cur.execute(
            "INSERT INTO station_profiles (brand, station_id, permit_number, legal_name, rfc, domicilio, permiso_cre, "
            "representante_legal, responsable_operativo, correo, telefono, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)",
            (BRAND, sid, permit, legal, rfc, f"{addr}, {city}, {state}", permit, rep, resp,
             f"estacion.{code.lower()}@petroleum-demo.mx", f"55 {rng.randint(1000,9999)} {rng.randint(1000,9999)}"),
        )
        track("station_profiles", sid)

    # 2. Usuarios demo de petroleum + acceso de jefes/operadores a las estaciones
    from werkzeug.security import generate_password_hash
    code_to_sid = {st[0]: sid for st, sid in zip(STATIONS, station_ids)}
    demo_users = []
    for username, role, scode in DEMO_USERS:
        if username in users:
            conn.close()
            raise SystemExit(f"Ya existe el usuario {username}; aborta para no duplicar.")
        cur.execute(
            "INSERT INTO users (brand, username, password_hash, role, primary_brand, allowed_brands, station_id, email, password_updated_at) "
            "VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)",
            (BRAND, username, generate_password_hash(DEMO_PASSWORD), role, BRAND, BRAND, code_to_sid[scode],
             f"{username}@petroleum-demo.mx"),
        )
        track("users", cur.lastrowid)
        demo_users.append({"id": cur.lastrowid, "username": username, "role": role})
    field_users += demo_users
    operators = [u for u in demo_users if u["role"] == "operador"] or operators

    for u in field_users:
        for sid in station_ids:
            cur.execute("INSERT OR IGNORE INTO user_station_access (user_id, station_id, brand) VALUES (?,?,?)", (u["id"], sid, BRAND))
            if cur.rowcount:
                track("user_station_access", [u["id"], sid])

    # 3. Actividades + eventos de calendario (materializados como en consulting)
    events = []  # (event_id, activity_id, station_id, date)
    for title, desc, rec in ACTIVITIES:
        cur.execute(
            "INSERT INTO activities (brand, title, description, evidence_required, is_active, created_by, created_at, recurrence) "
            "VALUES (?,?,?,1,1,?,?,?)",
            (BRAND, title, desc, admin_id, f"{today.year}-01-01T09:00:00", rec),
        )
        aid = cur.lastrowid
        track("activities", aid)
        if rec == "weekly":
            start = today - timedelta(days=today.weekday()) - timedelta(weeks=14)
            dates = [start + timedelta(weeks=i) for i in range(22)]
        elif rec == "monthly":
            dates = month_starts(today.year, range(1, 13))
        else:  # quarterly
            dates = month_starts(today.year, range(1, 13, 3))
        for d in dates:
            for sid in station_ids:
                cur.execute(
                    "INSERT INTO calendar_events (brand, activity_id, title, start_date, repeat_kind, station_id, created_by) VALUES (?,?,?,?,?,?,?)",
                    (BRAND, aid, title, d.isoformat(), rec, sid, admin_id),
                )
                track("calendar_events", cur.lastrowid)
                events.append((cur.lastrowid, aid, sid, d))

    # 4. Entregas de actividades pasadas
    for ev_id, aid, sid, d in events:
        if d > today:
            continue
        roll = rng.random()
        if roll < 0.12:
            continue  # sin entregar -> aparece como vencida
        if roll < 0.70:
            status, review = "approved", "Aprobado"
        elif roll < 0.85:
            status, review = "reviewed", "Revisado, pendiente de firma"
        elif roll < 0.95:
            status, review = "submitted", None
        else:
            status, review = "rejected", "Evidencia incompleta, favor de reenviar"
        created = datetime.combine(d, datetime.min.time()) + timedelta(hours=rng.randint(8, 17))
        reviewed = (created + timedelta(hours=rng.randint(2, 30))).isoformat(timespec="seconds") if status != "submitted" else None
        user = rng.choice(operators)["id"] if operators else None
        cur.execute(
            "INSERT INTO submissions (brand, event_id, activity_id, station_id, user_id, notes, status, score, review_notes, reviewed_by, created_at, reviewed_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (BRAND, ev_id, aid, sid, user, rng.choice(SUBMISSION_NOTES), status,
             rng.randint(70, 100) if status != "rejected" else rng.randint(40, 65),
             review, admin_id if status != "submitted" else None,
             created.isoformat(timespec="seconds"), reviewed),
        )
        track("submissions", cur.lastrowid)

    # 5. Pagos mensuales
    for sid in station_ids:
        for m in range(1, today.month + 1):
            ps = date(today.year, m, 1)
            if m == today.month:
                status = "pending"
            elif m == today.month - 1:
                status = rng.choice(["pending", "validated"])
            else:
                status = "rejected" if rng.random() < 0.08 else "validated"
            cur.execute(
                "INSERT INTO payments (brand, station_id, period_start, period_end, status, reviewed_by, reviewed_at, created_at) VALUES (?,?,?,?,?,?,?,?)",
                (BRAND, sid, ps.isoformat(), ps.isoformat(), status,
                 admin_id if status != "pending" else None,
                 (ps + timedelta(days=6)).isoformat() + "T12:00:00" if status != "pending" else None,
                 (ps + timedelta(days=3)).isoformat() + "T10:00:00"),
            )
            track("payments", cur.lastrowid)

    # 6. Normativas por estación (desde el catálogo petroleum)
    catalog = [dict(r) for r in conn.execute("SELECT * FROM normative_catalog WHERE brand=? AND is_active=1 ORDER BY sort_order", (BRAND,))]
    period_days = {"mensual": 30, "bimestral": 60, "trimestral": 90, "semestral": 180, "anual": 365}
    resp_ids = [u["id"] for u in field_users] or [admin_id]
    for sid in station_ids:
        for c in catalog:
            days = period_days.get(c["periodicity"], 90)
            offset = rng.choice([-20, -5, 4, 12, 25, 45, 80, 150])
            next_due = today + timedelta(days=offset)
            if offset < 0:
                status, obs = "vencido", "Pendiente de renovar; se solicitó cotización al proveedor."
            elif offset <= 30:
                status, obs = "proximo_a_vencer", "Programar renovación con anticipación."
            else:
                status, obs = rng.choice([("cumple", "Documentación vigente y archivada."),
                                          ("cumple", "Sin observaciones."),
                                          ("en_revision", "En revisión por la unidad verificadora.")])
            cur.execute(
                "INSERT INTO normativas (brand, station_id, catalog_id, norma_title, category, description, periodicity, compliance_date, next_due_date, "
                "responsible_user_id, status, observations, risk_level, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (BRAND, sid, c["id"], c["title"], c["category"], c["description"], c["periodicity"],
                 (next_due - timedelta(days=days)).isoformat(), next_due.isoformat(),
                 rng.choice(resp_ids), status, obs, c["default_risk"], admin_id),
            )
            track("normativas", cur.lastrowid)

    # 7. Expedientes normativos (plantillas petroleum)
    templates = [dict(r) for r in conn.execute("SELECT * FROM expediente_templates WHERE brand=? AND area='normativas' AND is_active=1 ORDER BY sort_order", (BRAND,))]
    for sid in station_ids:
        for t in templates:
            validity = int(t["default_validity_days"] or 365)
            roll = rng.random()
            if roll < 0.12:
                status, issue, expiry = "faltante", None, None
            else:
                issue_d = today - timedelta(days=rng.randint(10, validity))
                expiry_d = issue_d + timedelta(days=validity)
                left = (expiry_d - today).days
                status = "vencido" if left < 0 else "proximo_a_vencer" if left <= 30 else ("en_revision" if roll > 0.9 else "vigente")
                issue, expiry = issue_d.isoformat(), expiry_d.isoformat()
            cur.execute(
                "INSERT INTO expediente_records (brand, area, station_id, template_id, title, status, issue_date, expiry_date, notes, created_by, updated_by) "
                "VALUES (?, 'normativas', ?,?,?,?,?,?,?,?,?)",
                (BRAND, sid, t["id"], t["title"], status, issue, expiry,
                 "Registro de demostración" if status != "faltante" else "Documento por cargar", admin_id, admin_id),
            )
            track("expediente_records", cur.lastrowid)

    # 8. Semáforo de cumplimiento (compliance_records)
    item_codes = ["station_info", "nom_005", "nom_016", "anexo_30_31", "muestreos", "auditoria_sasisopa", "dictaminacion_sasisopa"]
    existing_codes = {r["code"] for r in conn.execute("SELECT code FROM compliance_items")}
    for sid in station_ids:
        for code in item_codes:
            if code not in existing_codes:
                continue
            expiry = today + timedelta(days=rng.choice([-10, 7, 18, 28, 60, 120, 240]))
            status = rng.choice(["approved", "approved", "approved", "in_review", "pending"])
            cur.execute(
                "INSERT INTO compliance_records (brand, station_id, item_code, status, status_note, updated_by, issue_date, expiry_date) VALUES (?,?,?,?,?,?,?,?)",
                (BRAND, sid, code, status, None, admin_id, (expiry - timedelta(days=365)).isoformat(), expiry.isoformat()),
            )
            track("compliance_records", [sid, code])

    # 9. Salas de chat
    cur.execute("INSERT INTO chat_rooms (brand, kind, station_id, name) VALUES (?, 'internal', NULL, ?)", (BRAND, "Chat Interno · Administradores"))
    track("chat_rooms", cur.lastrowid)
    for sid, st in zip(station_ids, STATIONS):
        cur.execute("INSERT INTO chat_rooms (brand, kind, station_id, name) VALUES (?, 'operative', ?, ?)", (BRAND, sid, f"Estación: {st[1]}"))
        track("chat_rooms", cur.lastrowid)

    # 10. Notificaciones para admin y usuarios demo
    for u in demo_users:
        for typ, title, body, url in [
            ("reminder", "Actividad programada hoy", "Bitácora de operación diaria — Petroleum Pachuca Centro.", "/staff/menu"),
            ("activity_assigned", "Nueva actividad asignada", "Verificación de dispensarios del mes.", "/staff/menu"),
        ]:
            cur.execute(
                "INSERT INTO notifications (brand, user_id, station_id, type, title, body, url, is_read) VALUES (?,?,?,?,?,?,?,0)",
                (BRAND, u["id"], station_ids[0], typ, title, body, url),
            )
            track("notifications", cur.lastrowid)
    if admin_id:
        notes = [
            ("doc_due", "Normativa próxima a vencer", "NOM-016 vence en 12 días en Petroleum Tulancingo.", "/admin/document-center", station_ids[1]),
            ("payment", "Pago pendiente de validar", "Petroleum Querétaro Norte cargó el comprobante del mes.", "/admin/payments", station_ids[2]),
            ("submission", "Nueva entrega de actividad", "Verificación de dispensarios — Petroleum Pachuca Centro.", "/admin/inbox", station_ids[0]),
            ("due", "Actividad vencida", "Control volumétrico Anexo 30-31 sin entrega en Petroleum Celaya Oriente.", "/admin/inbox", station_ids[3]),
            ("doc_due", "Expediente faltante", "Falta cargar la póliza de seguro vigente en Petroleum Celaya Oriente.", "/admin/document-center", station_ids[3]),
        ]
        for i, (typ, title, body, url, sid) in enumerate(notes):
            cur.execute(
                "INSERT INTO notifications (brand, user_id, station_id, type, title, body, url, is_read, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
                (BRAND, admin_id, sid, typ, title, body, url, 1 if i > 2 else 0,
                 (datetime.now() - timedelta(hours=3 * i)).isoformat(timespec="seconds")),
            )
            track("notifications", cur.lastrowid)

    cur.execute(
        "INSERT INTO system_state (brand, key, value, updated_at) VALUES (?,?,?,CURRENT_TIMESTAMP)",
        (BRAND, STATE_KEY, json.dumps(ids)),
    )
    conn.commit()
    conn.close()
    return ids


# Orden de borrado: hijos antes que padres
UNDO_ORDER = ["notifications", "chat_rooms", "compliance_records", "expediente_records", "normativas",
              "payments", "submissions", "calendar_events", "activities", "user_station_access",
              "users", "station_profiles", "stations"]


def undo() -> dict:
    conn = open_conn()
    ids = load_state(conn)
    if not ids:
        conn.close()
        raise SystemExit("No hay sembrado demo de petroleum registrado.")
    cur = conn.cursor()
    counts = {}

    # Registros que la app deriva sola de los datos sembrados mientras corre:
    # vencimientos sincronizados (services/deadlines.py) y avisos por estación.
    n = 0
    for src in ("normativas", "expediente_records"):
        for sid in ids.get(src) or []:
            cur.execute("DELETE FROM document_deadlines WHERE brand=? AND source_table=? AND source_id=?", (BRAND, src, sid))
            n += cur.rowcount
    counts["document_deadlines"] = n
    n = 0
    for sid in ids.get("stations") or []:
        cur.execute("DELETE FROM notifications WHERE brand=? AND station_id=?", (BRAND, sid))
        n += cur.rowcount
    counts["notifications (generadas)"] = n

    for table in UNDO_ORDER:
        vals = ids.get(table) or []
        n = 0
        for v in vals:
            if table == "user_station_access":
                cur.execute("DELETE FROM user_station_access WHERE user_id=? AND station_id=? AND brand=?", (v[0], v[1], BRAND))
            elif table == "compliance_records":
                cur.execute("DELETE FROM compliance_records WHERE brand=? AND station_id=? AND item_code=?", (BRAND, v[0], v[1]))
            elif table == "station_profiles":
                cur.execute("DELETE FROM station_profiles WHERE station_id=?", (v,))
            else:
                cur.execute(f"DELETE FROM {table} WHERE id=?", (v,))
            n += cur.rowcount
        counts[table] = n
    cur.execute("DELETE FROM system_state WHERE key=?", (STATE_KEY,))
    conn.commit()
    conn.close()
    return counts


def main():
    ap = argparse.ArgumentParser(description="Datos demo para el brand Petroleum.")
    ap.add_argument("--undo", action="store_true", help="Eliminar todo lo sembrado por este script.")
    args = ap.parse_args()

    bkp = backup_db()
    print(f"Respaldo creado: {bkp}")
    if args.undo:
        for t, n in undo().items():
            print(f"  {t:22s} eliminados: {n}")
        return
    for t, v in seed().items():
        print(f"  {t:22s} insertados: {len(v)}")
    print(f"\nUsuarios demo: {', '.join(u[0] for u in DEMO_USERS)}  (contraseña: {DEMO_PASSWORD})")
    print("\nPara revertir:  python scripts/seed_petroleum_demo.py --undo")


if __name__ == "__main__":
    main()
