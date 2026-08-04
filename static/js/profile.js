(async ()=>{
  let me; try{ me=(await api("/api/me")).me; }catch(e){return;}
  const ok  = qs("#profOk");
  const err = qs("#profErr");
  const form = qs("#profileForm");
  const stationWrap = qs("#profileStationWrap");
  const stationSel  = qs("#profileStation");
  const readOnly    = qs("#profReadOnly");

  const canSelectStation = ["admin","contador","auditor"].includes(me.role);
  const canEdit = me.role === "admin";

  /* ── Colores por rol para el avatar ───────────────────────────── */
  const roleColors = {
    admin:         "#6366f1",
    jefe_estacion: "#0ea5e9",
    operador:      "#22c55e",
    contador:      "#f59e0b",
    auditor:       "#8b5cf6"
  };
  const roleBadgeStyles = {
    admin:         "background:rgba(99,102,241,.12);color:#4338ca;",
    jefe_estacion: "background:rgba(14,165,233,.12);color:#0369a1;",
    operador:      "background:rgba(34,197,94,.12);color:#166534;",
    contador:      "background:rgba(245,158,11,.12);color:#92400e;",
    auditor:       "background:rgba(139,92,246,.12);color:#5b21b6;"
  };
  const roleLabels = {
    admin:"Administrador", jefe_estacion:"Jefe de Estación",
    operador:"Operador", contador:"Contador", auditor:"Auditor"
  };

  /* ── Llenar "Mi cuenta" ─────────────────────────────────────────── */
  function fillAccountCard(){
    const avatar = qs("#profAvatar");
    const uname  = qs("#profUsername");
    const email  = qs("#profEmail");
    const station= qs("#profStation");
    const badge  = qs("#profRoleBadge");

    const initials = (me.username||"?").substring(0,2).toUpperCase();
    if (avatar){
      avatar.textContent = initials;
      avatar.style.background = roleColors[me.role] || "#6366f1";
    }
    if (uname) uname.textContent = me.username || "—";
    if (email) email.textContent  = me.email || "Sin correo registrado";
    if (station){
      station.textContent = me.station_name
        ? `Estación: ${me.station_name}`
        : (canSelectStation ? "Acceso a múltiples estaciones" : "Sin estación asignada");
    }
    if (badge){
      badge.textContent = roleLabels[me.role] || me.role;
      badge.style.cssText = roleBadgeStyles[me.role] || "";
    }
  }

  /* ── Llenar estado FIEL ─────────────────────────────────────────── */
  function fillFielStatus(p){
    const statusBox  = qs("#fielStatus");
    const statusText = qs("#fielStatusText");
    const downloads  = qs("#fielDownloads");
    if (!statusBox) return;

    const hasCer = !!(p && p.fiel_cer_path);
    const hasKey = !!(p && p.fiel_key_path);
    const hasAll = hasCer && hasKey;
    const updated = p && p.fiel_updated_at ? (p.fiel_updated_at||"").slice(0,10) : null;

    const dot = statusBox.querySelector(".fiel-dot");
    const title = statusBox.querySelector("div[style*='font-weight:700']");
    if (dot)   dot.style.background = hasAll ? "#16a34a" : (hasCer||hasKey ? "#f59e0b" : "#94a3b8");
    if (title) title.textContent = hasAll ? "FIEL cargada" : (hasCer||hasKey ? "FIEL incompleta" : "Sin FIEL registrada");
    if (statusText) statusText.textContent = updated ? `Última actualización: ${updated}` : "No se han subido archivos aún.";

    if (downloads){
      const links = [];
      if (hasCer) links.push(`<a class="btn" href="/uploads/${p.fiel_cer_path}" target="_blank" rel="noopener">Descargar .cer</a>`);
      if (hasKey) links.push(`<a class="btn" href="/uploads/${p.fiel_key_path}" target="_blank" rel="noopener">Descargar .key</a>`);
      downloads.innerHTML = links.join("");
    }
  }

  /* ── Llenar campos de solo lectura ──────────────────────────────── */
  const RO_FIELDS = ["permit_number","legal_name","rfc","domicilio","representante_legal",
    "responsable_operativo","responsable_sasisopa","responsable_sgm","correo","telefono"];

  function fillReadOnly(p){
    RO_FIELDS.forEach(f=>{
      const el = qs(`#ro-${f}`);
      if (!el) return;
      const val = p && p[f];
      el.textContent = val || "—";
      el.classList.toggle("empty", !val);
    });
  }

  /* ── Llenar formulario de admin ─────────────────────────────────── */
  function fillForm(p){
    if (!p || !form) return;
    RO_FIELDS.forEach(f=>{
      const input = form.elements[f];
      if (input) input.value = p[f] || "";
    });
  }

  /* ── Selector de estaciones (admin/contador/auditor) ────────────── */
  if (canSelectStation && stationWrap && stationSel){
    stationWrap.hidden = false;
    try{
      const data = await api("/api/stations");
      const stations = data.stations || [];
      stationSel.innerHTML = `<option value="">Selecciona una estación…</option>` +
        stations.map(s=>`<option value="${s.id}">${s.code} · ${s.name}</option>`).join("");
      if (me.station_id) stationSel.value = String(me.station_id);
      if (!stationSel.value && stations.length===1) stationSel.value = String(stations[0].id);
      stationSel.addEventListener("change", ()=>load());
    }catch(_e){}
  }

  /* ── Configurar vista lectura vs editable ───────────────────────── */
  if (!canEdit){
    if (form)    form.hidden = true;
    if (readOnly) readOnly.hidden = false;
  }

  /* ── Cargar datos del perfil de estación ────────────────────────── */
  function selectedStationId(){
    if (stationSel && stationSel.value) return stationSel.value;
    return me.station_id || "";
  }

  async function load(){
    const sid = selectedStationId();
    const url = sid ? `/api/profile?station_id=${encodeURIComponent(sid)}` : "/api/profile";
    try{
      const r = await api(url);
      const p = r.profile;
      fillFielStatus(p);
      if (canEdit) {
        fillForm(p);
        /* sincronizar station_id oculto */
        if (form && form.elements.station_id) form.elements.station_id.value = sid || "";
      } else {
        fillReadOnly(p);
      }
    }catch(_e){
      fillFielStatus(null);
      if (!canEdit) fillReadOnly(null);
    }
  }

  /* ── Guardar (solo admin) ───────────────────────────────────────── */
  if (form){
    form.addEventListener("submit", async (ev)=>{
      ev.preventDefault();
      if (ok)  ok.hidden  = true;
      if (err) err.hidden = true;
      try{
        const fd = new FormData(form);
        const sid = selectedStationId();
        if (sid) fd.set("station_id", sid);
        await api("/api/profile",{method:"POST",body:fd,headers:{}});
        if (ok){ ok.textContent="Guardado correctamente."; ok.hidden=false; }
        /* limpiar inputs de archivo tras guardar */
        ["fiel_cer","fiel_key"].forEach(n=>{ const el=form.elements[n]; if(el) el.value=""; });
        await load();
      }catch(e){
        if (err){ err.textContent="Error: "+e.message; err.hidden=false; }
      }
    });
  }

  fillAccountCard();
  await load();
})();

