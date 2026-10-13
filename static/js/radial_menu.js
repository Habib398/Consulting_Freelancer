/* =============================================================
   radial_menu.js
   Menú radial de bienvenida — posicionamiento trigonométrico
   de pétalos SVG + animaciones + fallback mobile.
   Sin dependencias externas.
   ============================================================= */

(function () {
  'use strict';

  /* ── Biblioteca de íconos SVG (paths internos) ───────────── */
  const ICONS = {
    'shield':
      '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',

    'file-text':
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
      '<polyline points="14 2 14 8 20 8"/>' +
      '<line x1="16" y1="13" x2="8" y2="13"/>' +
      '<line x1="16" y1="17" x2="8" y2="17"/>' +
      '<line x1="10" y1="9" x2="8" y2="9"/>',

    'building':
      '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18z"/>' +
      '<path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>' +
      '<path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/>' +
      '<line x1="10" y1="6" x2="10" y2="6.01"/>' +
      '<line x1="14" y1="6" x2="14" y2="6.01"/>' +
      '<line x1="10" y1="10" x2="10" y2="10.01"/>' +
      '<line x1="14" y1="10" x2="14" y2="10.01"/>' +
      '<line x1="10" y1="14" x2="10" y2="14.01"/>' +
      '<line x1="14" y1="14" x2="14" y2="14.01"/>',

    'inbox':
      '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>' +
      '<path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6' +
      'l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',

    'calendar':
      '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>' +
      '<line x1="16" y1="2" x2="16" y2="6"/>' +
      '<line x1="8"  y1="2" x2="8"  y2="6"/>' +
      '<line x1="3"  y1="10" x2="21" y2="10"/>',

    'bar-chart':
      '<line x1="18" y1="20" x2="18" y2="10"/>' +
      '<line x1="12" y1="20" x2="12" y2="4"/>' +
      '<line x1="6"  y1="20" x2="6"  y2="14"/>',

    'bell':
      '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>' +
      '<path d="M13.73 21a2 2 0 0 1-3.46 0"/>',

    'grid':
      '<rect x="3"  y="3"  width="7" height="7"/>' +
      '<rect x="14" y="3"  width="7" height="7"/>' +
      '<rect x="14" y="14" width="7" height="7"/>' +
      '<rect x="3"  y="14" width="7" height="7"/>',

    'credit-card':
      '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>' +
      '<line x1="1" y1="10" x2="23" y2="10"/>',

    'alert-circle':
      '<circle cx="12" cy="12" r="10"/>' +
      '<line x1="12" y1="8"  x2="12"   y2="12"/>' +
      '<line x1="12" y1="16" x2="12.01" y2="16"/>',

    'eye':
      '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>' +
      '<circle cx="12" cy="12" r="3"/>',

    'layers':
      '<polygon points="12 2 2 7 12 12 22 7 12 2"/>' +
      '<polyline points="2 17 12 22 22 17"/>' +
      '<polyline points="2 12 12 17 22 12"/>',
  };

  function iconSvg(key) {
    const inner = ICONS[key] || ICONS['grid'];
    return `<svg viewBox="0 0 24 24" fill="none" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  }

  /* ── Elementos DOM ───────────────────────────────────────── */
  const nodesEl = document.getElementById('rm-nodes');
  if (!nodesEl) return;

  const nodes  = JSON.parse(nodesEl.textContent || '[]');
  const n      = nodes.length;
  if (n === 0) return;

  const stage    = document.getElementById('rmStage');
  const svgEl    = document.getElementById('rmSvg');
  const hubEl    = document.getElementById('rmHub');
  const labelsEl = document.getElementById('rmLabels');
  const mobileEl = document.getElementById('rmMobile');

  /* ── Utilidades ──────────────────────────────────────────── */
  const NS = 'http://www.w3.org/2000/svg';

  function polar(cx, cy, r, angle) {
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  }

  /* Convierte grados a radianes */
  function rad(deg) { return (deg * Math.PI) / 180; }

  /* Formatea número con 3 decimales para el path SVG */
  function f(v) { return v.toFixed(3); }

  /* ── Path SVG de un pétalo (sector circular) ─────────────
     El pétalo es un sector del anillo [rInner, rOuter] entre
     startAngle y endAngle (en radianes, medidos desde el eje X).
     Los arcos se calculan con el comando SVG "A".
  ─────────────────────────────────────────────────────────── */
  function petalPath(cx, cy, rInner, rOuter, startAngle, endAngle) {
    const p1 = polar(cx, cy, rInner, startAngle);   // inner-start
    const p2 = polar(cx, cy, rInner, endAngle);     // inner-end
    const p3 = polar(cx, cy, rOuter, endAngle);     // outer-end
    const p4 = polar(cx, cy, rOuter, startAngle);   // outer-start

    const span    = endAngle - startAngle;
    const large   = span > Math.PI ? 1 : 0;

    return [
      `M ${f(p1.x)} ${f(p1.y)}`,
      // Arco interior (sentido horario = sweep 1)
      `A ${f(rInner)} ${f(rInner)} 0 ${large} 1 ${f(p2.x)} ${f(p2.y)}`,
      // Línea al borde exterior
      `L ${f(p3.x)} ${f(p3.y)}`,
      // Arco exterior (sentido antihorario = sweep 0)
      `A ${f(rOuter)} ${f(rOuter)} 0 ${large} 0 ${f(p4.x)} ${f(p4.y)}`,
      'Z',
    ].join(' ');
  }

  /* ── Estado de pétalo activo (hover sync pétalo ↔ label) ── */
  let petalEls = [];
  let labelEls = [];

  function setHover(i, on) {
    if (petalEls[i]) petalEls[i].classList.toggle('rm-petal--hovered', on);
    if (labelEls[i]) labelEls[i].classList.toggle('rm-label--hovered',  on);
  }

  /* ── Construcción del radial ─────────────────────────────── */
  function build() {
    const W  = stage.offsetWidth;
    const H  = stage.offsetHeight;
    const cx = W / 2;
    const cy = H / 2;
    const dim = Math.min(W, H);

    /* Radios proporcionales al contenedor */
    const rHub   = dim * 0.150;                   // radio del círculo hub
    const rInner = rHub + dim * 0.042;            // gap hub → pétalo
    const rOuter = dim * 0.440;                   // borde exterior del pétalo

    /* Gap angular entre pétalos (menor gap para más nodos) */
    const gapDeg = n > 6 ? 5.5 : (n > 4 ? 7 : 9);
    const gapRad = rad(gapDeg);

    const angleStep = (2 * Math.PI) / n;          // arco total por pétalo

    /* Actualizar tamaño del hub central */
    const hubDiam = rHub * 2;
    hubEl.style.width  = `${hubDiam}px`;
    hubEl.style.height = `${hubDiam}px`;

    /* Limpiar SVG y contenedor de labels */
    svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svgEl.innerHTML = '';
    labelsEl.innerHTML = '';
    petalEls = [];
    labelEls = [];

    nodes.forEach(function (node, i) {
      /* ── Ángulos del pétalo ────────────────────────────── */
      // Comenzamos desde arriba (-90°) y giramos en sentido horario
      const base  = angleStep * i - Math.PI / 2;
      const start = base + gapRad / 2;
      const end   = base + angleStep - gapRad / 2;
      const mid   = (start + end) / 2;            // ángulo central del pétalo

      /* ── Pétalo SVG path ───────────────────────────────── */
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', petalPath(cx, cy, rInner, rOuter, start, end));
      path.classList.add('rm-petal');
      path.style.animationDelay = `${0.28 + i * 0.07}s`;
      path.dataset.index = i;

      /* Clic en el pétalo */
      path.addEventListener('click', function () {
        window.location.href = node.href;
      });
      /* Hover sincronizado */
      path.addEventListener('mouseenter', function () { setHover(i, true);  });
      path.addEventListener('mouseleave', function () { setHover(i, false); });

      svgEl.appendChild(path);
      petalEls.push(path);

      /* ── Label HTML posicionado en el centroide ─────────── */
      // Radio del centroide: punto medio entre rInner y rOuter,
      // ligeramente desplazado hacia el exterior para mejor lectura
      const labelR = rInner + (rOuter - rInner) * 0.52;
      const lx = cx + labelR * Math.cos(mid);
      const ly = cy + labelR * Math.sin(mid);

      const a = document.createElement('a');
      a.href      = node.href;
      a.className = 'rm-label';
      a.style.left = `${lx}px`;
      a.style.top  = `${ly}px`;
      a.style.animationDelay = `${0.38 + i * 0.07}s`;
      a.dataset.index = i;
      a.setAttribute('aria-label', node.label);

      /* Ícono */
      const iconDiv = document.createElement('div');
      iconDiv.className   = 'rm-label-icon';
      iconDiv.innerHTML   = iconSvg(node.icon);

      /* Texto */
      const textSpan = document.createElement('span');
      textSpan.className   = 'rm-label-text';
      textSpan.textContent = node.label;

      a.appendChild(iconDiv);
      a.appendChild(textSpan);

      /* Hover sincronizado */
      a.addEventListener('mouseenter', function () { setHover(i, true);  });
      a.addEventListener('mouseleave', function () { setHover(i, false); });

      labelsEl.appendChild(a);
      labelEls.push(a);
    });

    /* ── Mobile list ────────────────────────────────────────── */
    buildMobile();
  }

  /* ── Lista vertical para mobile ─────────────────────────── */
  function buildMobile() {
    if (!mobileEl) return;
    mobileEl.innerHTML = '';

    nodes.forEach(function (node, i) {
      const a = document.createElement('a');
      a.href      = node.href;
      a.className = 'rm-mobile-card';
      a.style.animationDelay = `${0.10 + i * 0.055}s`;
      a.setAttribute('aria-label', node.label);

      const iconDiv = document.createElement('div');
      iconDiv.className = 'rm-mobile-card-icon';
      iconDiv.innerHTML = iconSvg(node.icon);

      const label = document.createElement('span');
      label.className   = 'rm-mobile-card-label';
      label.textContent = node.label;

      const arrow = document.createElementNS(NS, 'svg');
      arrow.setAttribute('viewBox', '0 0 24 24');
      arrow.setAttribute('fill', 'none');
      arrow.setAttribute('stroke', 'currentColor');
      arrow.setAttribute('stroke-width', '2');
      arrow.setAttribute('stroke-linecap', 'round');
      arrow.setAttribute('stroke-linejoin', 'round');
      arrow.setAttribute('width', '16');
      arrow.setAttribute('height', '16');
      arrow.setAttribute('aria-hidden', 'true');
      arrow.classList.add('rm-mobile-card-arrow');
      const arrowPath = document.createElementNS(NS, 'path');
      arrowPath.setAttribute('d', 'M9 18l6-6-6-6');
      arrow.appendChild(arrowPath);

      a.appendChild(iconDiv);
      a.appendChild(label);
      a.appendChild(arrow);
      mobileEl.appendChild(a);
    });
  }

  /* ── Redibujado en resize ─────────────────────────────────── */
  let resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(build, 140);
  });

  /* ── Inicialización ──────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }

})();
