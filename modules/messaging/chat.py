from __future__ import annotations

import json
from datetime import datetime, timezone

from flask import Blueprint, jsonify, render_template, request, session

from db import get_conn, db_conn
from services.brand import get_brand


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _utcnow() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _get_session_user():
    """Devuelve (user_id, role, station_id) del usuario activo.

    station_id se lee de la tabla users porque el login no lo guarda en sesion.
    """
    uid = session.get("user_id")
    station_id = None
    if uid:
        with db_conn() as conn:
            row = conn.execute("SELECT station_id FROM users WHERE id=?", (uid,)).fetchone()
        if row:
            station_id = row["station_id"]
    return uid, session.get("role"), station_id


def _user_can_access_room(room: dict, user_id: int, role: str, station_id) -> bool:
    """Reglas de acceso por sala.

    - internal: solo admins.
    - operative: admin (todas) o jefe_estacion (solo su estacion).
    """
    if role == "admin":
        return True
    if role == "jefe_estacion":
        return room["kind"] == "operative" and str(room.get("station_id")) == str(station_id)
    return False


def _rooms_for_user(conn, brand: str, user_id: int, role: str, station_id) -> list[dict]:
    cur = conn.cursor()
    if role == "admin":
        cur.execute(
            "SELECT r.*, "
            "(SELECT COUNT(*) FROM chat_messages m WHERE m.room_id=r.id AND m.is_read=0 AND m.sender_user_id!=?) AS unread "
            "FROM chat_rooms r WHERE r.brand=? ORDER BY r.kind DESC, r.name ASC",
            (user_id, brand),
        )
    else:
        cur.execute(
            "SELECT r.*, "
            "(SELECT COUNT(*) FROM chat_messages m WHERE m.room_id=r.id AND m.is_read=0 AND m.sender_user_id!=?) AS unread "
            "FROM chat_rooms r WHERE r.brand=? AND r.kind='operative' AND r.station_id=? ORDER BY r.name ASC",
            (user_id, brand, station_id),
        )
    return [dict(r) for r in cur.fetchall()]


def ensure_station_room(conn, brand: str, station_id: int, station_name: str) -> None:
    """Crea la sala operativa de una estacion si aun no existe. No hace commit."""
    exists = conn.execute(
        "SELECT 1 FROM chat_rooms WHERE brand=? AND kind='operative' AND station_id=? LIMIT 1",
        (brand, station_id),
    ).fetchone()
    if not exists:
        conn.execute(
            "INSERT INTO chat_rooms (brand, kind, station_id, name) VALUES (?,?,?,?)",
            (brand, "operative", station_id, f"Estación: {station_name}"),
        )


def _backfill_station_rooms() -> None:
    """Crea salas para estaciones dadas de alta antes de que el alta creara la sala."""
    with db_conn() as conn:
        rows = conn.execute(
            "SELECT s.id, s.brand, s.name FROM stations s "
            "WHERE NOT EXISTS (SELECT 1 FROM chat_rooms r "
            "  WHERE r.kind='operative' AND r.station_id=s.id AND r.brand=s.brand)"
        ).fetchall()
        for r in rows:
            ensure_station_room(conn, r["brand"], r["id"], r["name"])
        if rows:
            conn.commit()


def _messages_for_room(conn, room_id: int, limit: int = 80, since: str | None = None) -> list[dict]:
    cur = conn.cursor()
    sql = (
        "SELECT m.id, m.room_id, m.sender_user_id, u.username AS sender_name, "
        "m.body, m.is_read, m.created_at "
        "FROM chat_messages m "
        "LEFT JOIN users u ON u.id = m.sender_user_id "
        "WHERE m.room_id=?"
    )
    params: list = [room_id]
    if since:
        sql += " AND m.created_at > ?"
        params.append(since)
    sql += " ORDER BY m.created_at ASC"
    if not since:
        sql += f" LIMIT {int(limit)}"
    cur.execute(sql, params)
    return [dict(r) for r in cur.fetchall()]


def _ensure_room_access(conn, room_id: int, user_id: int, role: str, station_id, brand: str):
    """Devuelve el dict de la sala o None si el usuario no tiene acceso."""
    cur = conn.cursor()
    cur.execute("SELECT * FROM chat_rooms WHERE id=? AND brand=?", (room_id, brand))
    row = cur.fetchone()
    if not row:
        return None
    room = dict(row)
    if not _user_can_access_room(room, user_id, role, station_id):
        return None
    return room


# ---------------------------------------------------------------------------
# register() — blueprint + eventos Socket.IO
# ---------------------------------------------------------------------------

def register(app):
    chat_bp = Blueprint("chat", __name__)
    ctx = app.extensions["ctx"]
    login_required = ctx.login_required
    role_required  = ctx.role_required

    # ------------------------------------------------------------------
    # Pagina principal del chat
    # ------------------------------------------------------------------

    @chat_bp.get("/mod/chat")
    @login_required
    @role_required("admin", "jefe_estacion")
    def page_chat():
        return render_template("messaging/chat.html")

    # ------------------------------------------------------------------
    # REST API — salas
    # ------------------------------------------------------------------

    @chat_bp.get("/api/chat/rooms")
    @login_required
    @role_required("admin", "jefe_estacion")
    def api_rooms():
        uid, role, station_id = _get_session_user()
        brand = get_brand()
        with db_conn() as conn:
            rooms = _rooms_for_user(conn, brand, uid, role, station_id)
        return jsonify({"ok": True, "rooms": rooms})

    # ------------------------------------------------------------------
    # REST API — mensajes de una sala
    # ------------------------------------------------------------------

    @chat_bp.get("/api/chat/rooms/<int:room_id>/messages")
    @login_required
    @role_required("admin", "jefe_estacion")
    def api_messages(room_id: int):
        uid, role, station_id = _get_session_user()
        brand = get_brand()
        since = request.args.get("since") or None
        limit = min(int(request.args.get("limit") or 80), 200)
        with db_conn() as conn:
            room = _ensure_room_access(conn, room_id, uid, role, station_id, brand)
            if not room:
                return jsonify({"ok": False, "error": "forbidden"}), 403
            msgs = _messages_for_room(conn, room_id, limit=limit, since=since)
        return jsonify({"ok": True, "messages": msgs})

    # ------------------------------------------------------------------
    # REST API — enviar mensaje (fallback HTTP, tambien usado por WS)
    # ------------------------------------------------------------------

    @chat_bp.post("/api/chat/rooms/<int:room_id>/messages")
    @login_required
    @role_required("admin", "jefe_estacion")
    def api_send_message(room_id: int):
        uid, role, station_id = _get_session_user()
        brand = get_brand()
        body = (request.get_json(silent=True) or {}).get("body", "").strip()
        if not body:
            return jsonify({"ok": False, "error": "empty_message"}), 400
        if len(body) > 4000:
            return jsonify({"ok": False, "error": "message_too_long"}), 400

        with db_conn() as conn:
            room = _ensure_room_access(conn, room_id, uid, role, station_id, brand)
            if not room:
                return jsonify({"ok": False, "error": "forbidden"}), 403
            now = _utcnow()
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO chat_messages (brand, room_id, sender_user_id, body, created_at) VALUES (?,?,?,?,?)",
                (brand, room_id, uid, body, now),
            )
            msg_id = cur.lastrowid
            conn.commit()
            # Recuperar el mensaje con nombre del remitente
            cur.execute(
                "SELECT m.id, m.room_id, m.sender_user_id, u.username AS sender_name, "
                "m.body, m.is_read, m.created_at "
                "FROM chat_messages m LEFT JOIN users u ON u.id=m.sender_user_id "
                "WHERE m.id=?",
                (msg_id,),
            )
            msg = dict(cur.fetchone())

        # Emitir por Socket.IO si esta disponible (graceful degradation)
        try:
            socketio = app.extensions.get("socketio")
            if socketio:
                socketio.emit(
                    "new_message",
                    msg,
                    room=f"chat_{room_id}",
                    namespace="/chat",
                )
        except Exception:
            pass

        return jsonify({"ok": True, "message": msg}), 201

    # ------------------------------------------------------------------
    # REST API — marcar mensajes como leidos
    # ------------------------------------------------------------------

    @chat_bp.post("/api/chat/rooms/<int:room_id>/read")
    @login_required
    @role_required("admin", "jefe_estacion")
    def api_mark_read(room_id: int):
        uid, role, station_id = _get_session_user()
        brand = get_brand()
        with db_conn() as conn:
            room = _ensure_room_access(conn, room_id, uid, role, station_id, brand)
            if not room:
                return jsonify({"ok": False, "error": "forbidden"}), 403
            conn.execute(
                "UPDATE chat_messages SET is_read=1 "
                "WHERE room_id=? AND sender_user_id!=? AND is_read=0",
                (room_id, uid),
            )
            conn.commit()
        return jsonify({"ok": True})

    # ------------------------------------------------------------------
    # REST API — total de mensajes no leidos (para el badge del sidebar)
    # ------------------------------------------------------------------

    @chat_bp.get("/api/chat/unread-count")
    @login_required
    @role_required("admin", "jefe_estacion")
    def api_unread_count():
        uid, role, station_id = _get_session_user()
        brand = get_brand()
        with db_conn() as conn:
            rooms = _rooms_for_user(conn, brand, uid, role, station_id)
        total = sum(r.get("unread") or 0 for r in rooms)
        return jsonify({"ok": True, "unread": total})

    # ------------------------------------------------------------------
    # Socket.IO — eventos en tiempo real
    # ------------------------------------------------------------------

    def _setup_socketio_events(socketio):
        from flask_socketio import join_room, leave_room, emit

        @socketio.on("join", namespace="/chat")
        def on_join(data):
            uid, role, station_id = _get_session_user()
            if not uid or role not in ("admin", "jefe_estacion"):
                return
            room_id = int(data.get("room_id", 0))
            if not room_id:
                return
            brand = get_brand()
            with db_conn() as conn:
                room = _ensure_room_access(conn, room_id, uid, role, station_id, brand)
            if room:
                join_room(f"chat_{room_id}")

        @socketio.on("leave", namespace="/chat")
        def on_leave(data):
            room_id = int(data.get("room_id", 0))
            if room_id:
                leave_room(f"chat_{room_id}")

        @socketio.on("send_message", namespace="/chat")
        def on_send_message(data):
            uid, role, station_id = _get_session_user()
            if not uid or role not in ("admin", "jefe_estacion"):
                return
            room_id = int(data.get("room_id", 0))
            body = (data.get("body") or "").strip()
            if not room_id or not body or len(body) > 4000:
                return
            brand = get_brand()
            with db_conn() as conn:
                room = _ensure_room_access(conn, room_id, uid, role, station_id, brand)
                if not room:
                    return
                now = _utcnow()
                cur = conn.cursor()
                cur.execute(
                    "INSERT INTO chat_messages (brand, room_id, sender_user_id, body, created_at) VALUES (?,?,?,?,?)",
                    (brand, room_id, uid, body, now),
                )
                msg_id = cur.lastrowid
                conn.commit()
                cur.execute(
                    "SELECT m.id, m.room_id, m.sender_user_id, u.username AS sender_name, "
                    "m.body, m.is_read, m.created_at "
                    "FROM chat_messages m LEFT JOIN users u ON u.id=m.sender_user_id "
                    "WHERE m.id=?",
                    (msg_id,),
                )
                msg = dict(cur.fetchone())
            emit("new_message", msg, room=f"chat_{room_id}", namespace="/chat")

        @socketio.on("mark_read", namespace="/chat")
        def on_mark_read(data):
            uid, role, station_id = _get_session_user()
            if not uid or role not in ("admin", "jefe_estacion"):
                return
            room_id = int(data.get("room_id", 0))
            if not room_id:
                return
            brand = get_brand()
            with db_conn() as conn:
                room = _ensure_room_access(conn, room_id, uid, role, station_id, brand)
                if room:
                    conn.execute(
                        "UPDATE chat_messages SET is_read=1 "
                        "WHERE room_id=? AND sender_user_id!=? AND is_read=0",
                        (room_id, uid),
                    )
                    conn.commit()

    # Reparar estaciones existentes sin sala (creadas antes de este ajuste)
    try:
        _backfill_station_rooms()
    except Exception:
        app.logger.exception("No se pudieron crear las salas de chat faltantes")

    # Registrar eventos solo si SocketIO esta activo
    try:
        socketio = app.extensions.get("socketio")
        if socketio:
            _setup_socketio_events(socketio)
    except Exception:
        pass

    app.register_blueprint(chat_bp)
