/**
 * chat.js — Cliente del chat segmentado
 *
 * Soporta dos modos:
 *   1. Tiempo real via Socket.IO (si el servidor corre con gevent/socketio)
 *   2. Fallback a polling HTTP cada 5 s cuando Socket.IO no esta disponible
 */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* Estado                                                               */
  /* ------------------------------------------------------------------ */
  const ME         = window.CHAT_USER_ID;
  const CSRF       = window.CSRF_TOKEN;

  let activeRoomId    = null;
  let lastMessageTime = null;   // para polling incremental
  let pollingTimer    = null;
  let socket          = null;
  let socketConnected = false;

  /* ------------------------------------------------------------------ */
  /* Helpers HTTP                                                         */
  /* ------------------------------------------------------------------ */
  async function apiFetch(url, opts = {}) {
    const res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": CSRF,
        ...(opts.headers || {}),
      },
      ...opts,
    });
    return res.json();
  }

  /* ------------------------------------------------------------------ */
  /* Formateo de fecha/hora                                               */
  /* ------------------------------------------------------------------ */
  function fmtTime(isoStr) {
    if (!isoStr) return "";
    const d = new Date(isoStr.endsWith("Z") ? isoStr : isoStr + "Z");
    return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  }

  function fmtDate(isoStr) {
    if (!isoStr) return "";
    const d   = new Date(isoStr.endsWith("Z") ? isoStr : isoStr + "Z");
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return "Hoy";
    const yest = new Date(now);
    yest.setDate(yest.getDate() - 1);
    if (d.toDateString() === yest.toDateString()) return "Ayer";
    return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
  }

  /* ------------------------------------------------------------------ */
  /* Render de lista de salas                                             */
  /* ------------------------------------------------------------------ */
  async function loadRooms() {
    const data = await apiFetch("/api/chat/rooms");
    if (!data.ok) return;

    const list = document.getElementById("roomsList");
    list.innerHTML = "";

    if (!data.rooms.length) {
      list.innerHTML = '<div class="chat-loading">Sin salas disponibles.</div>';
      return;
    }

    data.rooms.forEach(room => {
      const isInternal = room.kind === "internal";
      const initials   = room.name.substring(0, 2).toUpperCase();
      const unread     = room.unread || 0;

      const item = document.createElement("div");
      item.className = "chat-room-item" + (room.id === activeRoomId ? " active" : "");
      item.dataset.roomId = room.id;
      item.innerHTML = `
        <div class="chat-room-avatar ${isInternal ? "internal" : ""}">${initials}</div>
        <div class="chat-room-info">
          <div class="chat-room-name">${escHtml(room.name)}</div>
          <div class="chat-room-sub">${isInternal ? "Solo administradores" : "Canal operativo"}</div>
        </div>
        ${unread > 0 ? `<span class="chat-room-badge">${unread}</span>` : ""}
      `;
      item.addEventListener("click", () => openRoom(room));
      list.appendChild(item);
    });

    // Actualizar badge global del sidebar
    updateSidebarBadge(data.rooms);
  }

  function updateSidebarBadge(rooms) {
    const total = rooms.reduce((s, r) => s + (r.unread || 0), 0);
    const badge = document.getElementById("chatNavBadge");
    if (!badge) return;
    badge.textContent = total;
    badge.style.display = total > 0 ? "inline" : "none";
  }

  /* ------------------------------------------------------------------ */
  /* Abrir sala                                                           */
  /* ------------------------------------------------------------------ */
  async function openRoom(room) {
    // Si habia una sala abierta, salir de su Socket.IO room
    if (activeRoomId && socket && socketConnected) {
      socket.emit("leave", { room_id: activeRoomId });
    }
    activeRoomId    = room.id;
    lastMessageTime = null;

    // Marcar item activo en sidebar
    document.querySelectorAll(".chat-room-item").forEach(el => {
      el.classList.toggle("active", parseInt(el.dataset.roomId) === room.id);
    });

    // Mostrar cabecera y área de mensajes
    document.getElementById("chatEmptyState").hidden  = true;
    document.getElementById("chatHeader").hidden      = false;
    document.getElementById("chatMessagesWrap").hidden = false;
    document.getElementById("chatInputBar").hidden    = false;
    document.getElementById("chatHeaderName").textContent = room.name;
    document.getElementById("chatHeaderSub").textContent  =
      room.kind === "internal" ? "Solo administradores" : "Canal operativo";

    // Limpiar mensajes anteriores
    document.getElementById("chatMessages").innerHTML = "";

    // Cargar mensajes
    await loadMessages();

    // Unirse a la sala via Socket.IO
    if (socket && socketConnected) {
      socket.emit("join", { room_id: room.id });
    }

    // Marcar leidos
    await apiFetch(`/api/chat/rooms/${room.id}/read`, { method: "POST" });

    // Arrancar/reiniciar polling si no hay Socket.IO
    if (!socketConnected) {
      startPolling();
    }

    // Actualizar lista de salas (limpiar badge)
    loadRooms();

    // Focus en el input
    document.getElementById("chatInput").focus();
  }

  /* ------------------------------------------------------------------ */
  /* Cargar mensajes                                                      */
  /* ------------------------------------------------------------------ */
  async function loadMessages(since = null) {
    if (!activeRoomId) return;
    const url = `/api/chat/rooms/${activeRoomId}/messages` +
      (since ? `?since=${encodeURIComponent(since)}` : "");
    const data = await apiFetch(url);
    if (!data.ok) return;

    if (data.messages.length > 0) {
      renderMessages(data.messages, since !== null);
      lastMessageTime = data.messages[data.messages.length - 1].created_at;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Renderizar mensajes                                                  */
  /* ------------------------------------------------------------------ */
  function renderMessages(msgs, append = false) {
    const container = document.getElementById("chatMessages");
    if (!append) container.innerHTML = "";

    // Al anexar, continuar desde el ultimo divisor ya pintado para no repetir la fecha
    const dividers = container.querySelectorAll(".chat-date-divider");
    let lastDate = append && dividers.length ? dividers[dividers.length - 1].textContent : null;

    msgs.forEach(msg => {
      const msgDate = fmtDate(msg.created_at);
      if (msgDate !== lastDate) {
        const div = document.createElement("div");
        div.className = "chat-date-divider";
        div.textContent = msgDate;
        container.appendChild(div);
        lastDate = msgDate;
      }

      const isMine = parseInt(msg.sender_user_id) === parseInt(ME);
      const row    = document.createElement("div");
      row.className = "chat-bubble-row " + (isMine ? "mine" : "theirs");
      row.innerHTML = `
        <div class="chat-bubble-col">
          ${!isMine ? `<div class="chat-bubble-sender">${escHtml(msg.sender_name || "")}</div>` : ""}
          <div class="chat-bubble ${isMine ? "mine" : "theirs"}">${escHtml(msg.body)}</div>
        </div>
        <div class="chat-bubble-meta">${fmtTime(msg.created_at)}</div>
      `;
      container.appendChild(row);
    });

    // Scroll al último mensaje
    const wrap = document.getElementById("chatMessagesWrap");
    wrap.scrollTop = wrap.scrollHeight;
  }

  /* ------------------------------------------------------------------ */
  /* Enviar mensaje                                                       */
  /* ------------------------------------------------------------------ */
  async function sendMessage(body) {
    if (!activeRoomId || !body.trim()) return;

    if (socket && socketConnected) {
      // Via Socket.IO (el servidor hace el broadcast, nosotros lo recibiremos por "new_message")
      socket.emit("send_message", { room_id: activeRoomId, body });
    } else {
      // Fallback HTTP
      const data = await apiFetch(`/api/chat/rooms/${activeRoomId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      if (data.ok) {
        renderMessages([data.message], true);
        lastMessageTime = data.message.created_at;
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Polling (fallback sin Socket.IO)                                     */
  /* ------------------------------------------------------------------ */
  function startPolling() {
    stopPolling();
    pollingTimer = setInterval(async () => {
      if (!activeRoomId) return;
      await loadMessages(lastMessageTime);
    }, 5000);
  }

  function stopPolling() {
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Socket.IO                                                            */
  /* ------------------------------------------------------------------ */
  function initSocketIO() {
    try {
      if (typeof io === "undefined") return;
      socket = io("/chat", { transports: ["websocket", "polling"] });

      socket.on("connect", () => {
        socketConnected = true;
        stopPolling();
        // Unirse a la sala activa si ya habia una
        if (activeRoomId) {
          socket.emit("join", { room_id: activeRoomId });
        }
      });

      socket.on("disconnect", () => {
        socketConnected = false;
        // Caer en polling como fallback
        if (activeRoomId) startPolling();
      });

      socket.on("new_message", (msg) => {
        if (parseInt(msg.room_id) === activeRoomId) {
          renderMessages([msg], true);
          lastMessageTime = msg.created_at;
          // Marcar como leido automaticamente si la sala esta abierta
          apiFetch(`/api/chat/rooms/${activeRoomId}/read`, { method: "POST" });
        } else {
          // Mensaje en otra sala: actualizar badge
          loadRooms();
        }
      });
    } catch (e) {
      // Socket.IO no disponible, el polling se activara al abrir una sala
    }
  }

  /* ------------------------------------------------------------------ */
  /* Escape HTML                                                           */
  /* ------------------------------------------------------------------ */
  function escHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* ------------------------------------------------------------------ */
  /* Eventos DOM                                                          */
  /* ------------------------------------------------------------------ */
  function bindEvents() {
    const form  = document.getElementById("chatInputBar");
    const input = document.getElementById("chatInput");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = input.value.trim();
      if (!body) return;
      input.value = "";
      input.style.height = "auto";
      await sendMessage(body);
    });

    // Auto-resize del textarea
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 120) + "px";
    });

    // Ctrl+Enter o Cmd+Enter para enviar
    input.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        form.dispatchEvent(new Event("submit"));
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Init                                                                 */
  /* ------------------------------------------------------------------ */
  document.addEventListener("DOMContentLoaded", () => {
    bindEvents();
    loadRooms();
    initSocketIO();

    // Actualizar badge de salas cada 30 s (aunque no haya sala abierta)
    setInterval(loadRooms, 30000);
  });
})();
