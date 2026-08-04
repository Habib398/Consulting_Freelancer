(async ()=>{
  let me; try{ me=(await api("/api/me")).me; }catch(e){return;}
  const tb       = qs("#payT");
  const err      = qs("#payErr");
  const dlg      = qs("#dlgInvoice");
  const invoiceConfirm = qs("#invoiceConfirm");
  const invoiceFile    = qs("#invoiceFile");
  const invoiceCancel  = qs("#invoiceCancel");
  const invoiceErr     = qs("#invoiceErr");

  const CAN_EDIT_PERIOD   = me && (me.role === "admin" || me.role === "contador");
  const CAN_REVIEW        = me && (me.role === "admin" || me.role === "contador");
  const CAN_UPLOAD        = me && ["operador","jefe_estacion"].includes(me.role);

  /* ── Si el rol no puede subir comprobante, el grid pasa a 1 columna ── */
  if (!CAN_UPLOAD){
    const grid = qs(".grid.cols-2");
    if (grid) { grid.classList.remove("cols-2"); grid.classList.add("cols-1"); }
  }

  /* ── Fechas de periodo: admin/contador pueden editar, demás ven mes actual ── */
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2,"0");
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  const defaultStart = `${y}-${m}-01`;
  const defaultEnd   = `${y}-${m}-${String(lastDay).padStart(2,"0")}`;

  const periodInputs = [qs("#payPeriodStart"), qs("#payPeriodEnd")];
  const [startIn, endIn] = periodInputs;
  if (startIn) startIn.value = defaultStart;
  if (endIn)   endIn.value   = defaultEnd;

  periodInputs.forEach(input => {
    if (!input) return;
    if (CAN_EDIT_PERIOD) {
      input.removeAttribute("readonly");
      input.style.removeProperty("background");
      input.style.removeProperty("color");
      input.style.removeProperty("cursor");
      input.style.removeProperty("pointer-events");
      input.title = "";
    } else {
      input.title = "Solo el administrador o contador puede modificar las fechas de periodo.";
    }
  });

  /* ── Helpers ─────────────────────────────────────────────────────── */
  function fileLink(rel, label){
    if (!rel) return '<span style="color:var(--hme-text-soft,#94a3b8);">—</span>';
    return `<a href="/uploads/${rel}" target="_blank" rel="noopener">${label||"Ver"}</a>`;
  }

  function statusPill(status){
    const map = {
      pending:   ["Pendiente",  "pending"],
      validated: ["Validado",   "validated"],
      rejected:  ["Rechazado",  "rejected"]
    };
    const [label, cls] = map[status] || ["—",""];
    return `<span class="pay-pill ${cls}">${label}</span>`;
  }

  /* ── Card de estado del periodo actual ───────────────────────────── */
  function renderStatusCard(rows){
    const card    = qs("#payStatusCard");
    const label   = qs("#payStatusLabel");
    const meta    = qs("#payStatusMeta");
    const badge   = qs("#payStatusBadge");
    const icon    = qs("#payStatusIcon");
    if (!card || !label || !badge) return;

    const latest  = rows[0]; // ya viene ordenado por fecha desc
    if (!latest){
      label.textContent = "Sin comprobantes registrados";
      meta.textContent  = "Sube tu primer comprobante usando el formulario.";
      return;
    }
    const statusMap = {
      pending:   { text:"Revisión en proceso", badgeCls:"pending",   iconColor:"rgba(245,158,11,.12)", strokeColor:"#d97706" },
      validated: { text:"Pago validado",        badgeCls:"validated", iconColor:"rgba(22,163,74,.10)", strokeColor:"#16a34a" },
      rejected:  { text:"Comprobante rechazado",badgeCls:"rejected",  iconColor:"rgba(239,68,68,.10)", strokeColor:"#dc2626" }
    };
    const s = statusMap[latest.status] || { text:"—", badgeCls:"none", iconColor:"rgba(100,116,139,.09)", strokeColor:"#64748b" };

    label.textContent = s.text;
    badge.textContent = latest.status === "pending" ? "Pendiente" : latest.status === "validated" ? "Validado" : "Rechazado";
    badge.className   = `pay-status-badge ${s.badgeCls}`;
    icon.style.background = s.iconColor;
    icon.querySelector("svg").setAttribute("stroke", s.strokeColor);

    const period = (latest.period_start||"").slice(0,7).replace("-","/");
    const reviewed = latest.reviewed_at ? ` · Revisado: ${(latest.reviewed_at||"").slice(0,10)}` : "";
    meta.textContent = `Periodo: ${period || "—"}${reviewed}`;
  }

  /* ── Modal para adjuntar factura ─────────────────────────────────── */
  let _pendingId = null;
  let _pendingStation = "";

  function openInvoiceModal(paymentId, stationName){
    _pendingId = paymentId;
    _pendingStation = stationName;
    if (invoiceErr) { invoiceErr.hidden = true; invoiceErr.textContent = ""; }
    if (invoiceFile) invoiceFile.value = "";
    if (invoiceConfirm) invoiceConfirm.disabled = true;
    const nameEl = qs("#invoiceStationName");
    if (nameEl) nameEl.textContent = stationName || "—";
    if (dlg) dlg.showModal();
  }

  if (invoiceFile){
    invoiceFile.addEventListener("change", ()=>{
      if (invoiceConfirm) invoiceConfirm.disabled = !invoiceFile.files.length;
    });
  }
  if (invoiceCancel && dlg){
    invoiceCancel.addEventListener("click", ()=>{ dlg.close(); });
  }

  /* ── Rechazar directamente (sin modal) ───────────────────────────── */
  async function rejectPayment(id){
    try{
      const fd = new FormData();
      fd.set("status","rejected");
      await api(`/api/payments/${id}/review`, {method:"POST", body:fd, headers:{}});
      toast("Rechazado", "El comprobante fue rechazado.");
      await refresh();
    }catch(e){
      toast("Error", e.message);
    }
  }

  /* ── Confirmar validación con factura ────────────────────────────── */
  if (dlg){
    dlg.addEventListener("close", async ()=>{
      if (!_pendingId) return;
      if (!invoiceFile || !invoiceFile.files.length) return; // canceló
      try{
        if (invoiceErr) invoiceErr.hidden = true;
        const fd = new FormData();
        fd.set("status","validated");
        fd.append("invoice", invoiceFile.files[0]);
        await api(`/api/payments/${_pendingId}/review`, {method:"POST", body:fd, headers:{}});
        toast("Validado", "Comprobante validado y factura adjuntada.");
        _pendingId = null;
        await refresh();
      }catch(e){
        if (invoiceErr){ invoiceErr.textContent = "Error: "+e.message; invoiceErr.hidden = false; }
        _pendingId = null;
      }
    });
  }

  /* ── Render de tabla ─────────────────────────────────────────────── */
  async function refresh(){
    const rows = (await api("/api/payments")).payments || [];
    renderStatusCard(rows);

    if (!rows.length){
      tb.innerHTML = '<tr><td colspan="8" class="pay-empty">Sin registros de pagos aún.</td></tr>';
      return;
    }

    tb.innerHTML = rows.map(r => {
      const period = (r.period_start||"").slice(0,7).replace("-","/") || "—";
      let actionsCell = "";
      if (CAN_REVIEW && r.status === "pending"){
        actionsCell = `
          <button class="pay-action-btn validate" data-id="${r.id}" data-station="${(r.station_name||"").replace(/"/g,"&quot;")}" title="Validar este comprobante adjuntando la factura">
            <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            Validar
          </button>
          <button class="pay-action-btn reject" data-id="${r.id}" title="Rechazar comprobante" style="margin-left:6px;">
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Rechazar
          </button>`;
      } else {
        actionsCell = '<span style="color:var(--hme-text-soft,#94a3b8);font-size:12px;">—</span>';
      }
      return `
        <tr>
          <td>${r.id}</td>
          <td>${(r.created_at||"").slice(0,10)}</td>
          <td>${r.station_name||"—"}</td>
          <td>${period}</td>
          <td>${statusPill(r.status)}</td>
          <td>${fileLink(r.proof_path,"Ver comprobante")}</td>
          <td>${fileLink(r.invoice_path,"Ver factura")}</td>
          <td data-admin-contador-only>${actionsCell}</td>
        </tr>`;
    }).join("");

    /* Eventos de botones inline */
    tb.querySelectorAll(".pay-action-btn.validate").forEach(btn=>{
      btn.addEventListener("click", ()=>{ openInvoiceModal(btn.dataset.id, btn.dataset.station); });
    });
    tb.querySelectorAll(".pay-action-btn.reject").forEach(btn=>{
      btn.addEventListener("click", ()=>{ rejectPayment(btn.dataset.id); });
    });
  }

  /* ── Enviar comprobante ──────────────────────────────────────────── */
  qs("#payProof").addEventListener("submit", async (ev)=>{
    ev.preventDefault();
    err.hidden = true;
    try{
      const fd = new FormData(ev.target);
      await api("/api/payments/proof", {method:"POST", body:fd, headers:{}});
      toast("Enviado", "Comprobante enviado para revisión.");
      ev.target.reset();
      if (startIn) startIn.value = defaultStart;
      if (endIn)   endIn.value   = defaultEnd;
      await refresh();
    }catch(e){
      err.textContent = "Error: "+e.message;
      err.hidden = false;
    }
  });

  await refresh();
})();

