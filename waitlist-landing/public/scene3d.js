// Grabsty waitlist — 3D layer.
//  1. A WebGL scene of brand objects (G badge, Buyer Protection shield, bag,
//     price tag, hanger, escrow padlock) floating around the hero. Loaded only
//     after the page has finished loading, so the form never waits on it.
//  2. CSS 3D tilt on the hero title and the content cards (no WebGL needed).
// Everything degrades to the plain page: no WebGL, reduced motion, or a failed
// download just means no 3D.

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(pointer: fine)').matches;

// ── CSS 3D tilt ────────────────────────────────────────────────────────────
function initTilt() {
  if (reduceMotion || !finePointer) return;

  const cards = document.querySelectorAll('.lineage-card, .card-metrics, .lahore-architecture-card, .cta-banner-box');
  cards.forEach((el) => {
    el.classList.add('tilt-3d');
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `perspective(1000px) rotateX(${(-py * 7).toFixed(2)}deg) rotateY(${(px * 9).toFixed(2)}deg) translateZ(0)`;
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  });

  const title = document.querySelector('.hero-title');
  if (title) {
    title.classList.add('tilt-3d-title');
    window.addEventListener('pointermove', (e) => {
      const px = e.clientX / window.innerWidth - 0.5;
      const py = e.clientY / window.innerHeight - 0.5;
      title.style.transform = `perspective(900px) rotateX(${(-py * 10).toFixed(2)}deg) rotateY(${(px * 14).toFixed(2)}deg)`;
    }, { passive: true });
  }
}

// ── WebGL scene ────────────────────────────────────────────────────────────
const PURPLE = 0x6C47FF;
const SHIELD = 0x5356EE;
const INK = 0x0F0F0F;
const PAPER = 0xFFFFFF;

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}

async function initScene() {
  if (!webglAvailable()) return;

  let THREE;
  try {
    THREE = await import('./vendor/three.module.min.js');
  } catch { return; }

  const canvas = document.createElement('canvas');
  canvas.id = 'scene-3d';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch { canvas.remove(); return; }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 14);

  scene.add(new THREE.AmbientLight(PAPER, 0.75));
  const key = new THREE.DirectionalLight(PAPER, 2.2);
  key.position.set(4, 6, 8);
  scene.add(key);
  const rim = new THREE.PointLight(PURPLE, 40, 30);
  rim.position.set(-6, -3, 4);
  scene.add(rim);

  // Materials: flat brand colours + hard white/purple outlines (the page's
  // neo-brutalist look, in 3D).
  const mat = {
    purple: new THREE.MeshStandardMaterial({ color: PURPLE, roughness: 0.35, metalness: 0.15 }),
    shield: new THREE.MeshStandardMaterial({ color: SHIELD, roughness: 0.3, metalness: 0.2 }),
    ink: new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.55, metalness: 0.3 }),
    paper: new THREE.MeshStandardMaterial({ color: PAPER, roughness: 0.4, metalness: 0.05 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.18, metalness: 0.85 }),
  };
  const lineWhite = new THREE.LineBasicMaterial({ color: PAPER, transparent: true, opacity: 0.85 });
  const linePurple = new THREE.LineBasicMaterial({ color: PURPLE });
  const lineInk = new THREE.LineBasicMaterial({ color: INK });

  function mesh(geometry, material, lines) {
    const m = new THREE.Mesh(geometry, material);
    if (lines) m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 28), lines));
    return m;
  }

  function roundedRect(w, h, r) {
    const s = new THREE.Shape();
    const x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }

  const bevel = (depth, size) => ({ depth, bevelEnabled: true, bevelThickness: size, bevelSize: size, bevelSegments: 3, curveSegments: 18 });

  // Grabsty "G" from assets/images/logo.svg (48×48 box, absolute M/L/C/Z).
  function gShape() {
    const d = 'M 35.2 14.8 C 32.2 10.6 27.6 8.4 23.2 8.4 C 14.8 8.4 8.4 15.2 8.4 24 C 8.4 32.8 14.8 39.6 23.2 39.6 C 30.6 39.6 36.4 34.4 37.2 27 L 23.2 27 L 23.2 21 L 43.2 21 L 43.2 27.2 C 42.2 37.6 33.8 45.6 23.2 45.6 C 11.6 45.6 2.4 36 2.4 24 C 2.4 12 11.6 2.4 23.2 2.4 C 29.6 2.4 35.6 5.6 39.6 11.2 L 35.2 14.8 Z';
    const tok = d.match(/[MLCZ]|-?\d*\.?\d+/g);
    const P = (i) => [(parseFloat(tok[i]) - 24) / 24, -(parseFloat(tok[i + 1]) - 24) / 24];
    const s = new THREE.Shape();
    for (let i = 0; i < tok.length;) {
      const c = tok[i++];
      if (c === 'M') { s.moveTo(...P(i)); i += 2; }
      else if (c === 'L') { s.lineTo(...P(i)); i += 2; }
      else if (c === 'C') { s.bezierCurveTo(...P(i), ...P(i + 2), ...P(i + 4)); i += 6; }
      else if (c === 'Z') { s.closePath(); }
    }
    return s;
  }

  function makeBadge() {
    const g = new THREE.Group();
    const bodyGeo = new THREE.ExtrudeGeometry(roundedRect(2, 2, 0.5), bevel(0.32, 0.06));
    bodyGeo.translate(0, 0, -0.16);
    const body = mesh(bodyGeo, mat.purple, lineWhite);
    const letterGeo = new THREE.ExtrudeGeometry(gShape(), bevel(0.12, 0.02));
    const letter = mesh(letterGeo, mat.paper, null);
    letter.scale.setScalar(0.92);
    letter.position.z = 0.2;
    const back = letter.clone();
    back.rotation.y = Math.PI;
    back.position.z = -0.2;
    g.add(body, letter, back);
    return g;
  }

  function makeShield() {
    const g = new THREE.Group();
    const s = new THREE.Shape();
    s.moveTo(0, 1.05);
    s.bezierCurveTo(0.4, 0.86, 0.8, 0.8, 0.92, 0.78);
    s.lineTo(0.92, 0.12);
    s.bezierCurveTo(0.92, -0.5, 0.5, -0.92, 0, -1.15);
    s.bezierCurveTo(-0.5, -0.92, -0.92, -0.5, -0.92, 0.12);
    s.lineTo(-0.92, 0.78);
    s.bezierCurveTo(-0.8, 0.8, -0.4, 0.86, 0, 1.05);
    const geo = new THREE.ExtrudeGeometry(s, bevel(0.3, 0.06));
    geo.translate(0, 0, -0.15);
    g.add(mesh(geo, mat.shield, lineWhite));
    const tick = new THREE.CurvePath();
    tick.add(new THREE.LineCurve3(new THREE.Vector3(-0.4, 0.02, 0), new THREE.Vector3(-0.1, -0.3, 0)));
    tick.add(new THREE.LineCurve3(new THREE.Vector3(-0.1, -0.3, 0), new THREE.Vector3(0.44, 0.34, 0)));
    const front = new THREE.Mesh(new THREE.TubeGeometry(tick, 40, 0.085, 10), mat.paper);
    front.position.z = 0.24;
    const back = front.clone();
    back.position.z = -0.24;
    g.add(front, back);
    return g;
  }

  function makeBag() {
    const g = new THREE.Group();
    const body = mesh(new THREE.BoxGeometry(1.5, 1.6, 0.6), mat.purple, lineWhite);
    const handleGeo = new THREE.TorusGeometry(0.34, 0.055, 12, 36, Math.PI);
    [-0.2, 0.2].forEach((z) => {
      const h = new THREE.Mesh(handleGeo, mat.paper);
      h.position.set(0, 0.8, z);
      g.add(h);
    });
    const label = mesh(new THREE.BoxGeometry(0.62, 0.62, 0.02), mat.paper, null);
    label.position.set(0, 0.05, 0.31);
    const mark = mesh(new THREE.ExtrudeGeometry(gShape(), bevel(0.04, 0.005)), mat.purple, null);
    mark.scale.setScalar(0.24);
    mark.position.set(0, 0.05, 0.32);
    g.add(body, label, mark);
    return g;
  }

  function priceTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 512;
    const x = c.getContext('2d');
    x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, 256, 512);
    x.translate(128, 300); x.rotate(-Math.PI / 2);
    x.fillStyle = '#0F0F0F';
    x.font = '800 74px Inter, "Plus Jakarta Sans", Arial, sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('Rs 6,500', 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function makeTag() {
    const g = new THREE.Group();
    const s = new THREE.Shape();
    s.moveTo(-0.55, -1.0); s.lineTo(0.55, -1.0); s.lineTo(0.55, 0.55); s.lineTo(0, 1.05); s.lineTo(-0.55, 0.55); s.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, 0.62, 0.13, 0, Math.PI * 2, true);
    s.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(s, bevel(0.1, 0.03));
    geo.translate(0, 0, -0.05);
    g.add(mesh(geo, mat.paper, lineInk));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.4), new THREE.MeshBasicMaterial({ map: priceTexture() }));
    face.position.set(0, -0.28, 0.085);
    g.add(face);
    const string = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.03, 8, 40), mat.purple);
    string.position.set(0, 0.95, 0);
    string.rotation.y = Math.PI / 2;
    g.add(string);
    return g;
  }

  function makeHanger() {
    const path = new THREE.CurvePath();
    const V = (x, y) => new THREE.Vector3(x, y, 0);
    path.add(new THREE.LineCurve3(V(-1.2, -0.45), V(1.2, -0.45)));
    path.add(new THREE.LineCurve3(V(1.2, -0.45), V(0.08, 0.3)));
    path.add(new THREE.QuadraticBezierCurve3(V(0.08, 0.3), V(0, 0.36), V(0, 0.5)));
    path.add(new THREE.CubicBezierCurve3(V(0, 0.5), V(0, 0.95), V(0.42, 0.9), V(0.36, 0.62)));
    const left = new THREE.LineCurve3(V(-1.2, -0.45), V(-0.08, 0.3));
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.TubeGeometry(path, 160, 0.06, 10), mat.chrome));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(left, 30, 0.06, 10), mat.chrome));
    return g;
  }

  function makeLock() {
    const g = new THREE.Group();
    const bodyGeo = new THREE.ExtrudeGeometry(roundedRect(1.3, 1.05, 0.18), bevel(0.42, 0.05));
    bodyGeo.translate(0, 0, -0.21);
    const body = mesh(bodyGeo, mat.ink, linePurple);
    const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.09, 14, 40, Math.PI), mat.purple);
    shackle.position.y = 0.52;
    const legGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.3, 14);
    [-0.4, 0.4].forEach((x) => {
      const leg = new THREE.Mesh(legGeo, mat.purple);
      leg.position.set(x, 0.42, 0);
      g.add(leg);
    });
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 20), mat.paper);
    hole.rotation.x = Math.PI / 2;
    hole.position.set(0, 0.05, 0.27);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.24, 0.05), mat.paper);
    slot.position.set(0, -0.12, 0.27);
    g.add(body, shackle, hole, slot);
    return g;
  }

  function makeFiller(i) {
    if (i % 3 === 0) return mesh(new THREE.TorusGeometry(0.28, 0.07, 12, 32), mat.purple, null);
    if (i % 3 === 1) return mesh(new THREE.OctahedronGeometry(0.3), mat.ink, linePurple);
    return mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), mat.purple, lineWhite);
  }

  // Layout: (fx, fy) are fractions of the visible half-width/height at z = 0.
  const DESKTOP = [
    { make: makeBadge,  fx: -0.80, fy: 0.46,  z: 0.5,  s: 1.0 },
    { make: makeShield, fx: 0.75,  fy: 0.36,  z: 0.8,  s: 1.0 },
    { make: makeLock,   fx: 0.66,  fy: -0.08, z: -1.5, s: 0.95 },
    { make: makeBag,    fx: 0.80,  fy: -0.55, z: 0.2,  s: 0.95 },
    { make: makeTag,    fx: -0.80, fy: -0.42, z: 0.4,  s: 0.95 },
    { make: makeHanger, fx: -0.70, fy: -0.06, z: -2.2, s: 0.9 },
  ];
  const MOBILE = [
    // Peek in from the screen edges so the full-width form stays clear.
    { make: makeBadge,  fx: -1.0,  fy: 0.42,  z: 0,    s: 0.8 },
    { make: makeShield, fx: 1.0,   fy: 0.18,  z: 0,    s: 0.7 },
    { make: makeTag,    fx: -1.02, fy: -0.38, z: 0,    s: 0.65 },
    { make: makeBag,    fx: 1.02,  fy: -0.62, z: 0,    s: 0.65 },
  ];
  const FILLERS_DESKTOP = 7;
  const FILLERS_MOBILE = 0;

  const items = [];
  let isMobile = null;

  function build() {
    const mobile = window.innerWidth < 760;
    if (mobile === isMobile) return;
    isMobile = mobile;
    items.forEach((it) => scene.remove(it.obj));
    items.length = 0;
    const layout = mobile ? MOBILE : DESKTOP;
    layout.forEach((cfg, i) => items.push(makeItem(cfg.make(), cfg, i)));
    const fillers = mobile ? FILLERS_MOBILE : FILLERS_DESKTOP;
    for (let i = 0; i < fillers; i++) {
      // Deterministic scatter, kept away from the centre column.
      const side = i % 2 ? 1 : -1;
      const cfg = { fx: side * (0.55 + ((i * 37) % 40) / 100), fy: 0.9 - (i / fillers) * 1.8, z: -4 - (i % 3) * 1.5, s: 0.8 };
      items.push(makeItem(makeFiller(i), cfg, layout.length + i));
    }
    layoutItems();
  }

  function makeItem(obj, cfg, i) {
    scene.add(obj);
    return {
      obj, cfg,
      phase: i * 1.7,
      spin: 0.18 + (i % 4) * 0.06,
      boost: 0,
      born: performance.now() + i * 110,
      base: new THREE.Vector3(),
    };
  }

  function layoutItems() {
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const halfW = halfH * camera.aspect;
    items.forEach(({ cfg, base }) => {
      // Push deeper objects outward so they still read at the same screen spot.
      const depthScale = (camera.position.z - cfg.z) / camera.position.z;
      base.set(cfg.fx * halfW * depthScale, cfg.fy * halfH * depthScale, cfg.z);
    });
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    build();
    layoutItems();
    if (reduceMotion) render(performance.now());
  }

  // Input
  const mouse = new THREE.Vector2();
  const camTarget = new THREE.Vector2();
  window.addEventListener('pointermove', (e) => {
    mouse.set(e.clientX / window.innerWidth - 0.5, e.clientY / window.innerHeight - 0.5);
  }, { passive: true });

  const raycaster = new THREE.Raycaster();
  window.addEventListener('pointerdown', (e) => {
    if (e.target.closest('a, button, input, select, textarea, label, summary, .form-wrapper, .success-card')) return;
    const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(items.map((it) => it.obj), true)[0];
    if (!hit) return;
    const item = items.find((it) => it.obj === hit.object || it.obj.getObjectById(hit.object.id));
    if (item) item.boost += 9;
  });

  window.grabsty3d = {
    celebrate() { items.forEach((it, i) => { it.boost += 10 + (i % 3) * 3; }); },
  };

  const easeOutBack = (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

  function render(now) {
    const t = now / 1000;
    const scroll = window.scrollY / Math.max(window.innerHeight, 1);

    camTarget.set(mouse.x * 1.4, -mouse.y * 0.9);
    camera.position.x += (camTarget.x - camera.position.x) * 0.05;
    camera.position.y += (camTarget.y - camera.position.y) * 0.05;
    camera.lookAt(0, 0, 0);

    items.forEach((it) => {
      const { obj, base, phase } = it;
      const age = reduceMotion ? 1 : Math.min(Math.max((now - it.born) / 900, 0), 1);
      obj.scale.setScalar(it.cfg.s * (age > 0 ? easeOutBack(age) : 0));
      const depth = 1 + (it.cfg.z < 0 ? -it.cfg.z * 0.25 : 0);
      obj.position.set(
        base.x * (1 + scroll * 0.15),
        base.y + Math.sin(t * 0.8 + phase) * 0.15 + scroll * 2.2 * depth,
        base.z
      );
      it.boost *= 0.96;
      obj.rotation.y += (it.spin + it.boost) * 0.016;
      obj.rotation.x = Math.sin(t * 0.5 + phase) * 0.3 + scroll * 0.6;
      obj.rotation.z = Math.cos(t * 0.4 + phase) * 0.12;
    });

    // Full strength over the hero, dimmed behind the rest of the page.
    const base = window.innerWidth < 1180 ? 0.55 : 1;
    canvas.style.opacity = String(base * (1 - Math.min(Math.max(scroll - 0.6, 0), 1) * 0.65));

    renderer.render(scene, camera);
  }

  // Adaptive quality: if the first ~90 frames average under ~30 fps, drop to
  // 1x resolution and remove the background fillers.
  let frames = 0, firstFrame = 0, degraded = false;
  function checkPerf(now) {
    if (degraded) return;
    if (!firstFrame) firstFrame = now;
    if (++frames < 90) return;
    const fps = frames / ((now - firstFrame) / 1000);
    degraded = true;
    if (fps < 30) {
      renderer.setPixelRatio(1);
      for (let i = items.length - 1; i >= 0; i--) {
        if (items[i].cfg.make === undefined) { scene.remove(items[i].obj); items.splice(i, 1); }
      }
      resize();
    }
  }

  let running = false;
  function loop(now) {
    if (!running) return;
    render(now);
    checkPerf(now);
    requestAnimationFrame(loop);
  }
  function start() {
    if (running || reduceMotion) return;
    running = true;
    requestAnimationFrame(loop);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) running = false; else start();
  });

  window.addEventListener('resize', resize);
  resize();
  document.body.classList.add('has-3d');
  if (reduceMotion) render(performance.now());
  else start();
}

initTilt();
const boot = () => {
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
  idle(() => { initScene().catch(() => {}); });
};
if (document.readyState === 'complete') boot();
else window.addEventListener('load', boot);
