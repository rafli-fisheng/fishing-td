/* Well trajectory viewer: vertical section and plan view (SVG), and a 3D view (well3d.js, three.js).
   Model units: ft and degrees. Depth increases downward. */
(function (root) {
  'use strict';
  var DEG = Math.PI / 180;

  /* ---------- colour scales ---------- */
  var RAMPS = {
    dls: [[0, '#aab6be'], [0.35, '#e7c35f'], [0.7, '#e0772f'], [1, '#b5283c']],
    inc: [[0, '#cfe1f1'], [0.5, '#4f8fd8'], [1, '#183f7f']]
  };
  var HOLE = { cased: '#8696a2', open: '#c08a52', none: '#c4ccd2' };
  function hexRgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function ramp(stops, t) {
    t = Math.max(0, Math.min(1, t || 0));
    for (var i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        var a = stops[i - 1], b = stops[i], f = (t - a[0]) / (b[0] - a[0]), x = hexRgb(a[1]), y = hexRgb(b[1]);
        return [x[0] + (y[0] - x[0]) * f, x[1] + (y[1] - x[1]) * f, x[2] + (y[2] - x[2]) * f];
      }
    }
    return hexRgb(stops[stops.length - 1][1]);
  }
  function css(c) { return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')'; }
  function niceMax(v, step) { return Math.max(step, Math.ceil(v / step) * step); }

  function scale(mode, m) {
    if (mode === 'inc') {
      var mi = niceMax(m.maxInc, 10);
      return { max: mi, rgb: function (p) { return ramp(RAMPS.inc, p.inc / mi); }, legend: rampLegend(RAMPS.inc, '0°', mi + '°', 'Inclination') };
    }
    if (mode === 'hole') {
      return { rgb: function (p) { return hexRgb(HOLE[p.hole ? (p.hole.cased ? 'cased' : 'open') : 'none']); },
        legend: '<span class="sw"><i style="background:' + HOLE.cased + '"></i>Cased</span><span class="sw"><i style="background:' + HOLE.open + '"></i>Open hole</span>' };
    }
    var md = niceMax(m.maxDls, m.maxDls > 6 ? 2 : 1);
    return { max: md, rgb: function (p) { return ramp(RAMPS.dls, p.dls / md); }, legend: rampLegend(RAMPS.dls, '0', md + ' °/100 ft', 'Dogleg') };
  }
  function rampLegend(stops, lo, hi, name) {
    return '<span>' + name + '</span><span>' + lo + '</span><span class="ramp" style="background:linear-gradient(90deg,' + stops.map(function (s) { return s[1] + ' ' + (s[0] * 100) + '%'; }).join(',') + ')"></span><span>' + hi + '</span>';
  }

  /* ---------- helpers ---------- */
  function ticks(a, b, n) {
    if (!(b > a)) b = a + 1;
    var raw = (b - a) / Math.max(1, n), p = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), f = raw / p, st = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
    var out = []; for (var v = Math.ceil(a / st - 1e-9) * st; v <= b + st * 1e-6; v += st) out.push(Math.round(v / st) * st);
    return { list: out, step: st };
  }
  function n0(v) { return (Math.round(v) || 0).toLocaleString('en-US'); }
  function f1(v) { return (Math.round(v * 10) / 10).toFixed(1); }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function svgEl(tag, attrs) { var e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  function icon(d) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>'; }

  /* Model from the engine: sample the path evenly in MD and attach what the string and hole are at each point. */
  function buildModel(TD, R, S) {
    var tr = R && R.traj; if (!tr || !tr.st || tr.st.length < 2) return null;
    var D = R.D || 0, end = Math.max(tr.td, D), n = Math.min(1400, Math.max(160, Math.ceil(end / 12)));
    var secs = (R.secs || (S.secs || []).map(function (s) { return { name: s.name || 'Section', top: +s.top || 0, bottom: +s.bottom || 0, id: +s.id || 0, cased: s.cased !== 'open' }; }).filter(function (s) { return s.bottom > s.top; }))
      .slice().sort(function (a, b) { return a.top - b.top; });
    function holeAt(md) { var best = null; secs.forEach(function (s) { if (md >= s.top - 1e-6 && md <= s.bottom + 1e-6 && (!best || s.id < best.id)) best = s; }); return best; }
    var items = (R.spans || []).map(function (s) { return { top: s.top, bot: s.bot, name: (R.comps[s.i] || {}).name || '' }; });
    function itemAt(md) { for (var i = 0; i < items.length; i++) if (md >= items[i].top - 1e-6 && md <= items[i].bot + 1e-6) return items[i].name; return null; }
    var pts = [], maxDls = 0, maxInc = 0;
    for (var i = 0; i <= n; i++) {
      var md = end * i / n, p = TD.trajAt(tr, md), az = Math.atan2(p.t[1], p.t[0]) / DEG;
      if (az < 0) az += 360; if (p.inc < 0.01) az = 0;
      var q = { md: md, tvd: p.tvd, n: p.n, e: p.e, inc: p.inc, azi: az, dls: md > tr.td ? 0 : (p.dls || 0), hole: holeAt(md), item: md <= D + 1e-6 ? itemAt(md) : null };
      maxDls = Math.max(maxDls, q.dls); maxInc = Math.max(maxInc, q.inc); pts.push(q);
    }
    var last = pts[pts.length - 1], dep = Math.sqrt(last.n * last.n + last.e * last.e);
    var vsAz = dep > 1 ? ((Math.atan2(last.e, last.n) / DEG) + 360) % 360 : 0, ca = Math.cos(vsAz * DEG), sa = Math.sin(vsAz * DEG);
    pts.forEach(function (p) { p.vs = p.n * ca + p.e * sa; });
    var shoes = secs.filter(function (s) { return s.cased && s.bottom <= end + 1; }).map(function (s) { return { md: s.bottom, name: s.name, at: TD.trajAt(tr, s.bottom) }; });
    var bot = D ? TD.trajAt(tr, D) : null;
    return { pts: pts, end: end, D: D, td: tr.td, maxDls: maxDls, maxInc: maxInc, vsAz: vsAz, dep: dep, secs: secs, shoes: shoes,
      stations: tr.st.map(function (s) { return { md: s.md, tvd: s.tvd, n: s.n, e: s.e }; }), source: R.trajSource,
      bottom: bot ? { md: D, tvd: bot.tvd, n: bot.n, e: bot.e, vs: bot.n * ca + bot.e * sa, name: (items[0] || {}).name || '' } : null };
  }

  /* ---------- viewer ---------- */
  function create(host, opts) {
    opts = opts || {};
    var st = { mode: opts.mode || '3d', color: opts.color || 'dls', model: null, sc: null, view: { section: null, plan: null }, hover: -1, v3: null, active: false };
    try { var sv = JSON.parse(localStorage.getItem('tdfish.viewer') || 'null'); if (sv) { st.mode = sv.mode || st.mode; st.color = sv.color || st.color; } } catch (e) { /* ignore */ }

    host.innerHTML =
      '<div class="vhead"><h2>Trajectory</h2>' +
      '<div class="seg" role="group" aria-label="View" data-g="mode"><button data-v="3d">3D</button><button data-v="section">Section</button><button data-v="plan">Plan</button></div>' +
      '<div class="seg" role="group" aria-label="Colour by" data-g="color"><button data-v="dls">Dogleg</button><button data-v="inc">Inclination</button><button data-v="hole">Hole</button></div></div>' +
      '<div class="vbody">' +
      '<div class="pane v3d" data-p="3d"><div class="labels"></div></div>' +
      '<div class="pane v2d" data-p="2d"><svg role="img" aria-label="Well path"></svg></div>' +
      '<div class="vinfo" hidden></div><div class="vtools"></div><div class="vempty" hidden></div></div>' +
      '<div class="vfoot"><div class="vrow"><div class="vlegend"></div><div class="vnote"></div></div><p class="help" data-sum></p></div>';
    var $ = function (s) { return host.querySelector(s); };
    var svg = $('.v2d svg'), info = $('.vinfo'), legend = $('.vlegend'), tools = $('.vtools'), note = $('.vnote'), empty = $('.vempty');

    host.addEventListener('click', function (ev) {
      var b = ev.target.closest('.seg button'); if (b) { var g = b.parentNode.getAttribute('data-g'); if (g === 'mode') setMode(b.getAttribute('data-v')); else setColor(b.getAttribute('data-v')); return; }
      var t = ev.target.closest('.vtools button'); if (t) tool(t.getAttribute('data-t'));
    });
    function persist() { try { localStorage.setItem('tdfish.viewer', JSON.stringify({ mode: st.mode, color: st.color })); } catch (e) { /* ignore */ } }
    function syncSeg() {
      Array.prototype.forEach.call(host.querySelectorAll('.seg button'), function (b) {
        var g = b.parentNode.getAttribute('data-g'); b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === (g === 'mode' ? st.mode : st.color)));
      });
    }
    function setMode(m) { st.mode = m; persist(); syncSeg(); layout(); }
    function setColor(c) { st.color = c; persist(); syncSeg(); refresh(); }

    function tool(t) {
      if (st.mode === '3d') { if (st.v3) st.v3.view(t); return; }
      if (t === 'fit') { st.view[st.mode] = null; draw2d(); }
      if (t === 'in' || t === 'out') { var r = svg.getBoundingClientRect(); zoom2d(r.width / 2, r.height / 2, t === 'in' ? 1.4 : 1 / 1.4); }
    }
    var I = {
      fit: icon('<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/>'),
      iso: icon('<path d="M12 3 4 7.5v9L12 21l8-4.5v-9z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>'),
      top: icon('<rect x="5" y="5" width="14" height="14" rx="1.5"/><path d="M12 8v5M10 10l2-2 2 2"/>'),
      side: icon('<path d="M4 6h16M4 6v12h16V6"/><path d="M8 9c0 4 3 7 8 7"/>'),
      in: icon('<path d="M12 6v12M6 12h12"/>'), out: icon('<path d="M6 12h12"/>')
    };
    function layout() {
      var is3 = st.mode === '3d';
      $('.v3d').hidden = !is3; $('.v2d').hidden = is3;
      tools.innerHTML = (is3 ? [['fit', 'Fit (F)'], ['iso', '3D view'], ['top', 'Look down'], ['side', 'Look across the section']] : [['fit', 'Fit (F)'], ['in', 'Zoom in'], ['out', 'Zoom out']])
        .map(function (x) { return '<button data-t="' + x[0] + '" title="' + x[1] + '" aria-label="' + x[1] + '">' + I[x[0]] + '</button>'; }).join('');
      note.textContent = is3 ? 'Drag to rotate · right-drag to pan · scroll to zoom' : (st.mode === 'section' ? 'Vertical section at ' + (st.model ? f1(st.model.vsAz) : '0') + '° · true scale · drag to pan, scroll to zoom' : 'Plan view, north up · true scale · drag to pan, scroll to zoom');
      hideInfo();
      if (is3) ensure3d(); else if (st.v3) st.v3.setActive(false);
      refresh();
    }
    function ensure3d() {
      if (st.v3 || st.v3fail) { if (st.v3) st.v3.setActive(st.active); return; }
      if (!root.Well3D) { empty.hidden = false; empty.textContent = 'Loading 3D view…'; return; }
      try {
        st.v3 = root.Well3D.create($('.v3d'), { onHover: function (i) { if (i == null) hideInfo(); else showInfo(i); } });
        st.v3.setActive(st.active);
        empty.hidden = true;
      } catch (e) {
        st.v3fail = true; empty.hidden = false;
        empty.textContent = '3D view is not available on this computer (graphics acceleration is off). Use Section or Plan.';
      }
    }
    root.addEventListener('well3d-ready', function () { if (st.mode === '3d') { ensure3d(); refresh(); } });

    function refresh() {
      var m = st.model;
      if (!m) { empty.hidden = false; empty.textContent = 'Enter a survey or a planned profile to see the well path.'; legend.innerHTML = ''; svg.innerHTML = ''; return; }
      if (!(st.mode === '3d' && (st.v3fail || !st.v3))) empty.hidden = true;
      st.sc = scale(st.color, m);
      legend.innerHTML = st.sc.legend;
      if (st.mode === '3d') { if (st.v3) st.v3.update(m, st.sc.rgb, theme()); }
      else draw2d();
    }
    function theme() {
      var cs = getComputedStyle(document.documentElement);
      function v(n) { return cs.getPropertyValue(n).trim(); }
      return { ink: v('--ink'), muted: v('--muted'), line: v('--line'), strong: v('--line-strong'), surface: v('--surface'), accent: v('--accent'), dark: v('--surface').toLowerCase() !== '#ffffff' };
    }

    /* ---------- info panel ---------- */
    function showInfo(i) {
      var m = st.model, p = m && m.pts[i]; if (!p) return hideInfo();
      st.hover = i;
      var rows = [['MD', n0(p.md) + ' ft'], ['TVD', n0(p.tvd) + ' ft'], ['Inclination', f1(p.inc) + '°'], ['Azimuth', f1(p.azi) + '°'], ['Dogleg', f2(p.dls) + ' °/100 ft'],
        ['North', n0(p.n) + ' ft'], ['East', n0(p.e) + ' ft'], ['Vert. section', n0(p.vs) + ' ft']];
      info.innerHTML = '<h4>' + esc(p.hole ? p.hole.name : 'Below the hole sections') + '</h4><dl>' + rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join('') + '</dl>' +
        (p.item ? '<div style="margin-top:5px;color:var(--muted)">String: <span style="color:var(--ink)">' + esc(p.item) + '</span></div>' : (m.D && p.md > m.D ? '<div style="margin-top:5px;color:var(--muted)">Below the string</div>' : ''));
      info.hidden = false;
    }
    function hideInfo() { st.hover = -1; info.hidden = true; var h = svg.querySelector('.hov'); if (h) h.setAttribute('visibility', 'hidden'); }

    /* ---------- 2D ---------- */
    var M = { l: 70, r: 26, t: 24, b: 48 };
    function xy(p) { return st.mode === 'section' ? [p.vs, p.tvd] : [p.e, p.n]; }
    function fit2d(W, H) {
      var m = st.model, xs = [0], ys = [0];
      m.pts.forEach(function (p) { var q = xy(p); xs.push(q[0]); ys.push(q[1]); });
      var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
      var span = Math.max(x1 - x0, y1 - y0, 100), minSpan = span * 0.12;
      if (x1 - x0 < minSpan) { var cx = (x0 + x1) / 2; x0 = cx - minSpan / 2; x1 = cx + minSpan / 2; }
      if (y1 - y0 < minSpan) { var cy = (y0 + y1) / 2; y0 = cy - minSpan / 2; y1 = cy + minSpan / 2; }
      var pw = W - M.l - M.r, ph = H - M.t - M.b, k = Math.min(pw / (x1 - x0), ph / (y1 - y0)) * 0.9;
      var flip = st.mode === 'plan' ? -1 : 1;
      return { k: k, flip: flip, ox: M.l + pw / 2 - (x0 + x1) / 2 * k, oy: M.t + ph / 2 - flip * (y0 + y1) / 2 * k };
    }
    function vt() { var r = svg.getBoundingClientRect(); if (!st.view[st.mode]) st.view[st.mode] = fit2d(r.width, r.height); return st.view[st.mode]; }
    function draw2d() {
      var m = st.model; if (!m || st.mode === '3d') return;
      var r = svg.getBoundingClientRect(), W = r.width, H = r.height; if (W < 50 || H < 50) return;
      var v = vt(), T = theme();
      function X(x) { return v.ox + x * v.k; } function Y(y) { return v.oy + v.flip * y * v.k; }
      function inv(sx, sy) { return [(sx - v.ox) / v.k, (sy - v.oy) / (v.flip * v.k)]; }
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      svg.textContent = '';
      var defs = svgEl('defs', {}), cp = svgEl('clipPath', { id: 'tv-clip' }); cp.appendChild(svgEl('rect', { x: M.l, y: M.t, width: W - M.l - M.r, height: H - M.t - M.b })); defs.appendChild(cp); svg.appendChild(defs);
      var a = inv(M.l, M.t), b = inv(W - M.r, H - M.b), xa = Math.min(a[0], b[0]), xb = Math.max(a[0], b[0]), ya = Math.min(a[1], b[1]), yb = Math.max(a[1], b[1]);
      var tx = ticks(xa, xb, (W - M.l - M.r) / 95), step = tx.step, ty = ticks(ya, yb, (yb - ya) / step);
      if (ty.step !== step) { ty = { list: [], step: step }; for (var yv = Math.ceil(ya / step) * step; yv <= yb; yv += step) ty.list.push(Math.round(yv / step) * step); }
      var g = svgEl('g', { 'clip-path': 'url(#tv-clip)' }); svg.appendChild(g);
      tx.list.forEach(function (x) { g.appendChild(svgEl('line', { class: x === 0 ? 'ax' : 'gl', x1: X(x), x2: X(x), y1: M.t, y2: H - M.b })); });
      ty.list.forEach(function (y) { g.appendChild(svgEl('line', { class: y === 0 ? 'ax' : 'gl', x1: M.l, x2: W - M.r, y1: Y(y), y2: Y(y) })); });
      var lab = svgEl('g', {}); svg.appendChild(lab);
      tx.list.forEach(function (x) { var t = svgEl('text', { x: X(x), y: H - M.b + 16, 'text-anchor': 'middle' }); t.textContent = n0(x); lab.appendChild(t); });
      ty.list.forEach(function (y) { var t = svgEl('text', { x: M.l - 8, y: Y(y) + 4, 'text-anchor': 'end' }); t.textContent = n0(y); lab.appendChild(t); });
      var xt = svgEl('text', { class: 'ttl', x: M.l + (W - M.l - M.r) / 2, y: H - 10, 'text-anchor': 'middle' }); xt.textContent = st.mode === 'section' ? 'Vertical section (ft) along ' + f1(m.vsAz) + '°' : 'East (ft)'; lab.appendChild(xt);
      var yt = svgEl('text', { class: 'ttl', transform: 'translate(16,' + (M.t + (H - M.t - M.b) / 2) + ') rotate(-90)', 'text-anchor': 'middle' }); yt.textContent = st.mode === 'section' ? 'True vertical depth (ft)' : 'North (ft)'; lab.appendChild(yt);

      /* path, in runs of one colour */
      var rgb = st.sc.rgb, pts = m.pts, run = null, key = null;
      function flush() { if (run && run.pts.length > 1) g.appendChild(svgEl('polyline', { points: run.pts.join(' '), fill: 'none', stroke: run.c, 'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })); }
      pts.forEach(function (p, i) {
        var c = css(rgb(p)), q = xy(p), s = X(q[0]).toFixed(1) + ',' + Y(q[1]).toFixed(1);
        if (c !== key) { var prev = run && run.pts[run.pts.length - 1]; flush(); run = { c: c, pts: prev ? [prev] : [] }; key = c; }
        run.pts.push(s);
      });
      flush();
      /* the string in the hole */
      if (m.D) {
        var sp = pts.filter(function (p) { return p.md <= m.D + 1e-6; }).map(function (p) { var q = xy(p); return X(q[0]).toFixed(1) + ',' + Y(q[1]).toFixed(1); });
        var bq = xy(m.bottom); sp.push(X(bq[0]).toFixed(1) + ',' + Y(bq[1]).toFixed(1));
        g.appendChild(svgEl('polyline', { points: sp.join(' '), fill: 'none', stroke: T.ink, 'stroke-width': 1.5, 'stroke-opacity': 0.7, 'stroke-linejoin': 'round' }));
      }
      /* survey stations */
      var spacing = m.stations.length > 1 ? (m.end / m.stations.length) * v.k : 0;
      if (m.source === 'survey' && spacing > 14) m.stations.forEach(function (s) { var q = st.mode === 'section' ? [s.n * Math.cos(m.vsAz * DEG) + s.e * Math.sin(m.vsAz * DEG), s.tvd] : [s.e, s.n]; g.appendChild(svgEl('circle', { cx: X(q[0]), cy: Y(q[1]), r: 1.6, fill: T.ink, 'fill-opacity': 0.55 })); });
      /* markers */
      var mk = svgEl('g', {}); svg.appendChild(mk);
      var placed = [];
      function label(x, y, txt, dx) {
        dx = dx || 10;
        var t = svgEl('text', { class: 'lbl', x: x + dx, y: y + 4, 'text-anchor': dx < 0 ? 'end' : 'start' }); t.textContent = txt; mk.appendChild(t);
        var bb = t.getBBox();
        if (bb.x + bb.width > W - M.r - 4) { dx = -Math.abs(dx); t.setAttribute('x', x + dx); t.setAttribute('text-anchor', 'end'); bb = t.getBBox(); }
        if (bb.x < M.l + 4) { dx = Math.abs(dx); t.setAttribute('x', x + dx); t.setAttribute('text-anchor', 'start'); bb = t.getBBox(); }
        var tries = [0, 15, -15, 30, -30, 45];
        for (var i = 0; i < tries.length; i++) {
          var r = { x: bb.x - 2, y: bb.y + tries[i] - 1, w: bb.width + 4, h: bb.height + 2 };
          if (!placed.some(function (q) { return r.x < q.x + q.w && q.x < r.x + r.w && r.y < q.y + q.h && q.y < r.y + r.h; })) {
            if (tries[i]) t.setAttribute('y', y + 4 + tries[i]); placed.push(r); return;
          }
        }
        placed.push({ x: bb.x, y: bb.y, w: bb.width, h: bb.height });
      }
      function inside(x, y) { return x >= M.l && x <= W - M.r && y >= M.t && y <= H - M.b; }
      if (m.bottom) {
        var bq2 = xy(m.bottom), bx = X(bq2[0]), by = Y(bq2[1]);
        if (inside(bx, by)) {
          mk.appendChild(svgEl('circle', { cx: bx, cy: by, r: 6.5, fill: T.surface, stroke: T.accent, 'stroke-width': 2.5 }));
          label(bx, by, 'String bottom ' + n0(m.D) + ' ft MD', 12);
        }
      }
      m.shoes.forEach(function (s) {
        var p = { vs: s.at.n * Math.cos(m.vsAz * DEG) + s.at.e * Math.sin(m.vsAz * DEG), tvd: s.at.tvd, n: s.at.n, e: s.at.e }, q = xy(p), x = X(q[0]), y = Y(q[1]);
        if (!inside(x, y)) return;
        mk.appendChild(svgEl('path', { d: 'M' + (x - 9) + ',' + (y - 9) + 'L' + (x - 3) + ',' + y + 'L' + (x - 9) + ',' + y + 'Z', fill: T.ink }));
        mk.appendChild(svgEl('path', { d: 'M' + (x + 9) + ',' + (y - 9) + 'L' + (x + 3) + ',' + y + 'L' + (x + 9) + ',' + y + 'Z', fill: T.ink }));
        label(x, y - 2, (s.name ? s.name.replace(/ casing.*| liner.*/i, '') + ' shoe ' : 'Shoe ') + n0(s.md) + ' ft', -14);
      });
      var e = pts[pts.length - 1], eq = xy(e), ex = X(eq[0]), ey = Y(eq[1]);
      if (inside(ex, ey) && (!m.D || Math.abs(m.end - m.D) > m.end * 0.03)) label(ex, ey + 14, 'TD ' + n0(m.end) + ' ft MD', 10);
      if (st.mode === 'plan') {
        var na = svgEl('g', { transform: 'translate(' + (M.l + 22) + ',' + (M.t + 28) + ')' });
        na.appendChild(svgEl('path', { d: 'M0,-14 L6,6 L0,2 L-6,6 Z', fill: T.ink }));
        var nt = svgEl('text', { x: 0, y: 20, 'text-anchor': 'middle', class: 'ttl' }); nt.textContent = 'N'; na.appendChild(nt); svg.appendChild(na);
        var wh = xy(pts[0]); mk.appendChild(svgEl('circle', { cx: X(wh[0]), cy: Y(wh[1]), r: 4, fill: 'none', stroke: T.ink, 'stroke-width': 1.5 }));
      }
      var hov = svgEl('circle', { class: 'hov', r: 6, fill: T.accent, stroke: T.surface, 'stroke-width': 2.5, visibility: 'hidden' }); svg.appendChild(hov);
      st.proj = function (p) { var q = xy(p); return [X(q[0]), Y(q[1])]; };
    }
    function zoom2d(sx, sy, f) {
      var v = vt(), k2 = Math.max(1e-4, Math.min(v.k * f, 400));
      f = k2 / v.k; v.ox = sx - (sx - v.ox) * f; v.oy = sy - (sy - v.oy) * f; v.k = k2;
      raf2d();
    }
    var pend = false; function raf2d() { if (pend) return; pend = true; requestAnimationFrame(function () { pend = false; draw2d(); }); }
    svg.addEventListener('wheel', function (ev) {
      if (!st.model) return; ev.preventDefault();
      var r = svg.getBoundingClientRect(); zoom2d(ev.clientX - r.left, ev.clientY - r.top, Math.exp(-ev.deltaY * 0.0015));
    }, { passive: false });
    var drag = null;
    svg.addEventListener('pointerdown', function (ev) { if (!st.model || ev.button !== 0) return; drag = { x: ev.clientX, y: ev.clientY }; svg.setPointerCapture(ev.pointerId); svg.classList.add('drag'); hideInfo(); });
    svg.addEventListener('pointermove', function (ev) {
      if (!st.model) return;
      if (drag) { var v = vt(); v.ox += ev.clientX - drag.x; v.oy += ev.clientY - drag.y; drag = { x: ev.clientX, y: ev.clientY }; raf2d(); return; }
      if (!st.proj) return;
      var r = svg.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top, best = -1, bd = 22 * 22;
      st.model.pts.forEach(function (p, i) { var s = st.proj(p), d = (s[0] - mx) * (s[0] - mx) + (s[1] - my) * (s[1] - my); if (d < bd) { bd = d; best = i; } });
      var h = svg.querySelector('.hov');
      if (best < 0) { hideInfo(); return; }
      var s = st.proj(st.model.pts[best]); h.setAttribute('cx', s[0]); h.setAttribute('cy', s[1]); h.setAttribute('visibility', 'visible'); showInfo(best);
    });
    function endDrag(ev) { if (drag) { drag = null; svg.classList.remove('drag'); try { svg.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ } } }
    svg.addEventListener('pointerup', endDrag); svg.addEventListener('pointercancel', endDrag);
    svg.addEventListener('pointerleave', function () { if (!drag) hideInfo(); });
    svg.addEventListener('dblclick', function () { st.view[st.mode] = null; draw2d(); });
    host.addEventListener('keydown', function (ev) { if ((ev.key === 'f' || ev.key === 'F') && !/INPUT|TEXTAREA|SELECT/.test(ev.target.tagName)) tool('fit'); });

    if (root.ResizeObserver) new ResizeObserver(function () { st.view.section = null; st.view.plan = null; if (st.mode !== '3d') raf2d(); }).observe($('.vbody'));

    syncSeg(); layout();
    return {
      update: function (model, sum) {
        var first = !st.model, changed = !st.model || !model || st.model.end !== model.end || st.model.pts.length !== model.pts.length || st.model.vsAz !== model.vsAz;
        st.model = model;
        if (changed && !first) { st.view.section = null; st.view.plan = null; }
        $('[data-sum]').textContent = sum || '';
        if (st.mode !== '3d') note.textContent = st.mode === 'section' ? 'Vertical section at ' + (model ? f1(model.vsAz) : '0') + '° · true scale · drag to pan, scroll to zoom' : 'Plan view, north up · true scale · drag to pan, scroll to zoom';
        refresh();
      },
      setActive: function (on) { st.active = on; if (st.v3) st.v3.setActive(on && st.mode === '3d'); if (on && st.mode !== '3d') raf2d(); },
      retheme: function () { refresh(); }
    };
  }

  root.TrajView = { create: create, buildModel: buildModel, scale: scale };
})(window);
