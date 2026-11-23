/* 3D well path (three.js). Scene axes: x = East, y = up (−TVD), z = South (−North). Units: ft. */
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const P = (p) => new THREE.Vector3(p.e, -p.tvd, -p.n);
const n0 = (v) => Math.round(v).toLocaleString('en-US');

/* A polyline used as a tube path; parameter t is arc length / total length. */
class Poly extends THREE.Curve {
  constructor(pts) {
    super(); this.pts = pts; this.cum = [0];
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    this.len = this.cum[this.cum.length - 1] || 1;
  }
  getPoint(t, out = new THREE.Vector3()) {
    const s = Math.max(0, Math.min(1, t)) * this.len, c = this.cum;
    let lo = 0, hi = c.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; }
    const f = c[hi] > c[lo] ? (s - c[lo]) / (c[hi] - c[lo]) : 0;
    return out.copy(this.pts[lo]).lerp(this.pts[hi], f);
  }
  getPointAt(u, out) { return this.getPoint(u, out); }
}

function create(host, cb = {}) {
  const canvas = document.createElement('canvas');
  canvas.tabIndex = 0;
  host.insertBefore(canvas, host.firstChild);
  const labelsEl = host.querySelector('.labels');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 1, 1e6);
  scene.add(camera);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a96a0, 1.6); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(0.4, 0.8, 1); camera.add(key);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.09; controls.rotateSpeed = 0.7; controls.zoomSpeed = 0.9; controls.screenSpacePanning = true;

  const content = new THREE.Group(); scene.add(content);
  const hoverDot = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
  hoverDot.renderOrder = 10; hoverDot.visible = false; scene.add(hoverDot);
  const hoverRing = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0x0b6177, depthTest: false, transparent: true, opacity: 0.9 }));
  hoverRing.renderOrder = 9; hoverRing.visible = false; scene.add(hoverRing);

  let model = null, tube = null, samples = [], labels = [], box = null, radius = 10, active = false, dirty = true, anim = null, raf = 0, W = 0, H = 0;
  let mouse = null, lastHover = -1, homeSet = false;
  const ray = new THREE.Raycaster();

  function clear() {
    content.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach((m) => m.dispose()); });
    content.clear();
    labels.forEach((l) => l.el.remove()); labels = [];
  }
  function label(pos, text, cls) {
    const el = document.createElement('span'); el.textContent = text; if (cls) el.className = cls;
    labelsEl.appendChild(el); labels.push({ pos, el });
  }
  function line(points, color, opacity = 1, dashed = false) {
    const g = new THREE.BufferGeometry().setFromPoints(points);
    const m = dashed ? new THREE.LineDashedMaterial({ color, transparent: opacity < 1, opacity, dashSize: radius * 6, gapSize: radius * 4 }) : new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
    const l = new THREE.Line(g, m); if (dashed) l.computeLineDistances(); content.add(l); return l;
  }
  function nice(span, n) { const raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p; }

  function update(m, rgb, T) {
    const first = !model;
    const geomChanged = !model || model.end !== m.end || model.pts.length !== m.pts.length || model.pts[model.pts.length - 1].tvd !== m.pts[m.pts.length - 1].tvd || model.D !== m.D;
    model = m; clear();
    samples = m.pts.map(P);
    box = new THREE.Box3().setFromPoints(samples.concat([new THREE.Vector3(0, 0, 0)]));
    const size = box.getSize(new THREE.Vector3()), ext = Math.max(size.x, size.y, size.z, 200);
    radius = Math.max(ext * 0.0058, 2);
    const ink = new THREE.Color(T.ink), muted = new THREE.Color(T.muted), lineC = new THREE.Color(T.strong || T.line), accent = new THREE.Color(T.accent);
    hemi.groundColor.set(T.dark ? 0x30383e : 0x8a96a0);

    /* well path, coloured per ring */
    const curve = new Poly(samples), segs = samples.length - 1, radial = 14;
    const geo = new THREE.TubeGeometry(curve, segs, radius, radial, false);
    const col = new Float32Array(geo.attributes.position.count * 3), c = new THREE.Color();
    for (let i = 0; i <= segs; i++) {
      const v = rgb(m.pts[i]); c.setRGB(v[0] / 255, v[1] / 255, v[2] / 255, THREE.SRGBColorSpace);
      for (let j = 0; j <= radial; j++) { const k = (i * (radial + 1) + j) * 3; col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b; }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    tube = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.05 }));
    content.add(tube);

    /* casing shells and shoes */
    const mdAt = (md) => { const f = md / m.end * segs, i = Math.max(0, Math.min(segs - 1, Math.floor(f))); return samples[i].clone().lerp(samples[i + 1], f - i); };
    m.secs.filter((s) => s.cased).forEach((s) => {
      const a = Math.max(0, s.top), b = Math.min(m.end, s.bottom); if (b - a < 1) return;
      const pts = [mdAt(a)]; m.pts.forEach((p, i) => { if (p.md > a && p.md < b) pts.push(samples[i]); }); pts.push(mdAt(b));
      if (pts.length < 2) return;
      const sh = new THREE.Mesh(new THREE.TubeGeometry(new Poly(pts), Math.max(2, pts.length - 1), radius * 2.6, 20, false),
        new THREE.MeshStandardMaterial({ color: T.dark ? 0x8aa0ae : 0x7d909c, transparent: true, opacity: 0.16, roughness: 0.3, depthWrite: false, side: THREE.DoubleSide }));
      sh.renderOrder = 2; content.add(sh);
      if (s.bottom <= m.end + 1) {
        const at = mdAt(b), nxt = mdAt(Math.max(0, b - 10)), dir = at.clone().sub(nxt).normalize();
        const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 2.7, radius * 0.45, 10, 36), new THREE.MeshStandardMaterial({ color: ink, roughness: 0.5 }));
        ring.position.copy(at); ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir); content.add(ring);
        label(at, (s.name ? s.name.replace(/ casing.*| liner.*/i, '') + ' shoe ' : 'Shoe ') + n0(s.bottom) + ' ft', 'k');
      }
    });

    /* string bottom */
    if (m.bottom) {
      const at = P(m.bottom);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(radius * 2.4, 28, 18), new THREE.MeshStandardMaterial({ color: accent, roughness: 0.35, emissive: accent, emissiveIntensity: 0.25 }));
      ball.position.copy(at); content.add(ball);
      label(at, 'String bottom ' + n0(m.D) + ' ft MD', 'k');
    }
    const end = samples[samples.length - 1];
    if (!m.D || Math.abs(m.end - m.D) > m.end * 0.03) label(end, 'TD ' + n0(m.end) + ' ft', 'k');

    /* surface grid, plan shadow of the path, and a depth scale */
    const step = nice(Math.max(size.x, size.z, ext * 0.25), 6);
    const gx0 = Math.floor(Math.min(box.min.x, 0) / step - 1) * step, gx1 = Math.ceil(Math.max(box.max.x, 0) / step + 1) * step;
    const gz0 = Math.floor(Math.min(box.min.z, 0) / step - 1) * step, gz1 = Math.ceil(Math.max(box.max.z, 0) / step + 1) * step;
    const gp = [];
    for (let x = gx0; x <= gx1 + 1e-6; x += step) gp.push(new THREE.Vector3(x, 0, gz0), new THREE.Vector3(x, 0, gz1));
    for (let z = gz0; z <= gz1 + 1e-6; z += step) gp.push(new THREE.Vector3(gx0, 0, z), new THREE.Vector3(gx1, 0, z));
    content.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gp), new THREE.LineBasicMaterial({ color: lineC, transparent: true, opacity: 0.85 })));
    line(samples.map((p) => new THREE.Vector3(p.x, 0, p.z)), muted, 0.75);
    line([end, new THREE.Vector3(end.x, 0, end.z)], muted, 0.6, true);
    const wh = new THREE.Mesh(new THREE.CylinderGeometry(radius * 3, radius * 3, radius * 1.2, 24), new THREE.MeshStandardMaterial({ color: ink, roughness: 0.6 }));
    wh.position.set(0, radius * 0.6, 0); content.add(wh);
    label(new THREE.Vector3(0, radius * 3, 0), 'Wellhead', '');
    label(new THREE.Vector3((gx0 + gx1) / 2, 0, gz0), 'N', 'ax');
    label(new THREE.Vector3(gx1, 0, (gz0 + gz1) / 2), 'E', 'ax');
    const dz = nice(size.y, 6), ax = new THREE.Vector3(gx0, 0, gz1), maxD = Math.ceil(-box.min.y / dz) * dz;
    line([ax, new THREE.Vector3(ax.x, -maxD, ax.z)], muted, 0.9);
    const tk = [];
    for (let d = 0; d <= maxD + 1e-6; d += dz) {
      tk.push(new THREE.Vector3(ax.x, -d, ax.z), new THREE.Vector3(ax.x + step * 0.25, -d, ax.z));
      label(new THREE.Vector3(ax.x, -d, ax.z), n0(d) + (d === 0 ? ' ft TVD' : ''), 'dl');
    }
    content.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(tk), new THREE.LineBasicMaterial({ color: muted })));
    box.expandByPoint(new THREE.Vector3(gx0, 0, gz0)).expandByPoint(new THREE.Vector3(gx1, -maxD, gz1));

    hoverDot.scale.setScalar(radius * 1.5); hoverRing.scale.setScalar(radius * 2.4); hoverRing.material.color.copy(accent);
    camera.near = ext / 2000; camera.far = ext * 40; camera.updateProjectionMatrix();
    if (first || geomChanged || !homeSet) { view('iso', !first); homeSet = true; }
    dirty = true;
  }

  function center() { return box ? box.getCenter(new THREE.Vector3()) : new THREE.Vector3(); }
  function dist() {
    const s = box.getSize(new THREE.Vector3()), r = s.length() / 2, f = camera.fov * Math.PI / 360;
    const fitH = r / Math.sin(f), fitW = r / Math.sin(Math.atan(Math.tan(f) * camera.aspect));
    return Math.max(fitH, fitW) * 0.84;
  }
  function view(kind, animate = true) {
    if (!model) return;
    const c = center(); let dir;
    const th = (model.vsAz || 0) * Math.PI / 180;
    if (kind === 'top') dir = new THREE.Vector3(0, 1, 0.0008);
    else if (kind === 'side') dir = new THREE.Vector3(Math.cos(th), 0.0001, Math.sin(th));
    else if (kind === 'fit') dir = camera.position.clone().sub(controls.target).normalize();
    else dir = new THREE.Vector3(Math.cos(th) + 0.9 * Math.sin(th), 0.62, Math.sin(th) - 0.9 * Math.cos(th)).normalize();
    const to = c.clone().add(dir.multiplyScalar(dist()));
    if (!animate) { camera.position.copy(to); controls.target.copy(c); controls.update(); dirty = true; return; }
    anim = { t0: performance.now(), p0: camera.position.clone(), q0: controls.target.clone(), p1: to, q1: c };
    kick();
  }

  function resize() {
    const r = host.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
    renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix(); dirty = true; kick();
  }
  const ro = new ResizeObserver(resize); ro.observe(host);

  function pick() {
    if (!mouse || !tube) return;
    ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObject(tube, false)[0];
    let idx = -1;
    if (hit) { let bd = Infinity; for (let i = 0; i < samples.length; i++) { const d = samples[i].distanceToSquared(hit.point); if (d < bd) { bd = d; idx = i; } } }
    if (idx !== lastHover) {
      lastHover = idx;
      hoverDot.visible = hoverRing.visible = idx >= 0;
      if (idx >= 0) { hoverDot.position.copy(samples[idx]); hoverRing.position.copy(samples[idx]); }
      if (cb.onHover) cb.onHover(idx >= 0 ? idx : null);
      dirty = true;
    }
    mouse.moved = false;
  }
  canvas.addEventListener('pointermove', (e) => { const r = canvas.getBoundingClientRect(); mouse = new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); mouse.moved = true; kick(); });
  canvas.addEventListener('pointerleave', () => { mouse = null; if (lastHover >= 0) { lastHover = -1; hoverDot.visible = hoverRing.visible = false; if (cb.onHover) cb.onHover(null); dirty = true; kick(); } });
  canvas.addEventListener('pointerdown', () => { anim = null; });
  canvas.addEventListener('keydown', (e) => { if (e.key === 'f' || e.key === 'F') view('fit'); });
  controls.addEventListener('change', () => { dirty = true; });
  controls.addEventListener('start', kick);

  const v = new THREE.Vector3();
  /* Labels follow their 3D points; key labels are placed first and others shift or hide to avoid overlaps. */
  const order = () => labels.slice().sort((a, b) => (b.el.className === 'k') - (a.el.className === 'k'));
  function placeLabels() {
    const placed = [];
    for (const l of order()) {
      v.copy(l.pos).project(camera);
      if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) { l.el.style.visibility = 'hidden'; continue; }
      const w = l.w || (l.w = l.el.offsetWidth), h = 15, isK = l.el.className === 'k';
      let x = (v.x + 1) / 2 * W + 10, y = (1 - v.y) / 2 * H - 8;
      if (l.el.className === 'dl') x -= w + 22;
      else if (x + w > W - 8) x -= w + 20;
      let spot = null;
      for (const dy of [0, 15, -15, 30, -30]) {
        const r = { x: x - 2, y: y + dy, w: w + 4, h };
        if (!placed.some((q) => r.x < q.x + q.w && q.x < r.x + r.w && r.y < q.y + q.h && q.y < r.y + r.h)) { spot = r; y += dy; break; }
        if (!isK) break;
      }
      if (!spot) { l.el.style.visibility = 'hidden'; continue; }
      placed.push(spot);
      l.el.style.visibility = '';
      l.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
    }
  }
  function frame(now) {
    raf = 0;
    if (!active) return;
    let busy = false;
    if (anim) {
      const t = Math.min(1, (now - anim.t0) / 650), k = ease(t);
      camera.position.lerpVectors(anim.p0, anim.p1, k); controls.target.lerpVectors(anim.q0, anim.q1, k);
      if (t >= 1) anim = null; busy = true; dirty = true;
    }
    if (controls.update()) { busy = true; dirty = true; }
    if (mouse && mouse.moved) pick();
    if (dirty) { renderer.render(scene, camera); placeLabels(); dirty = false; }
    if (busy) kick(); else setTimeout(kick, 250); // idle: check again shortly (damping, hover)
  }
  function kick() { if (active && !raf) raf = requestAnimationFrame(frame); }

  return {
    update,
    view: (k) => view(k),
    setActive(on) { active = !!on; if (active) { resize(); kick(); } },
    dispose() { active = false; ro.disconnect(); clear(); renderer.dispose(); canvas.remove(); }
  };
}

window.Well3D = { create };
window.dispatchEvent(new Event('well3d-ready'));
