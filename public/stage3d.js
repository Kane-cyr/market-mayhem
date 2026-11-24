// 3D cutscenes. Draws each cutscene's set and characters with three.js (bundled as three.min.js) behind the
// existing text, speech and buttons. If WebGL is unavailable or three.js fails to load, the 2D art stays.
// Loan sharks and collectors wear trench coats and fedoras, reporters and agents wear suits, and the
// president keeps his look (swept blond hair, long red tie), now in 3D.
(() => {
  'use strict';
  let T = null, loading = null;
  const webgl = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } })();
  function load() {
    if (T) return Promise.resolve(T); if (!webgl) return Promise.reject(new Error('no webgl'));
    return loading ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'three.min.js'; s.async = true; s.onload = () => { T = window.THREE; if (!T) return rej(); if (T.ColorManagement) T.ColorManagement.legacyMode = false; res(T); }; s.onerror = () => { loading = null; rej(); }; document.head.append(s); });
  }
  if (webgl) setTimeout(() => (window.requestIdleCallback || setTimeout)(() => load().catch(() => {})), 2500); // fetch three.js quietly once the game is up

  const css = `
  .mm3d-cv{position:absolute;inset:0;width:100%!important;height:100%!important;z-index:-1;display:block;pointer-events:none;opacity:0;transition:opacity .45s ease}
  .mm3d-cv.on{opacity:1}
  #mmfx.has3d{isolation:isolate}
  #mmfx.has3d .stage,#mmfx.has3d .mmfx-shark-wrap,#mmfx.has3d .mmfx-room,#mmfx.has3d .mmfx-god,#mmfx.has3d .mmfx-cloud,#mmfx.has3d .mmfx-bolt,#mmfx.has3d .mmfx-flash{display:none}
  .scn.has3d{isolation:isolate}.scn.has3d .art>:not(.cover):not(.frame){display:none}
  .scn.live .frame.has3d{isolation:isolate}.scn.live .frame.has3d .host{display:none}
  .scn.mag.has3d{background:#0b0904}
  #mm3d-cut{position:fixed;inset:0;z-index:79;pointer-events:none;background:#0b1220}
  html.mm3d-cut-on .bc.cut{background:transparent}html.mm3d-cut-on .bc.cut .bc-scene{visibility:hidden}
  `;
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));

  // ---------- helpers ----------
  const mats = new Map();
  function M(color, o = {}) {
    const k = color + JSON.stringify(o); if (mats.has(k)) return mats.get(k);
    const m = new T.MeshStandardMaterial({ color, roughness: o.r ?? 0.62, metalness: o.m ?? 0, emissive: o.e || '#000000', emissiveIntensity: o.ei ?? 1, side: o.ds ? T.DoubleSide : T.FrontSide, transparent: o.op != null, opacity: o.op ?? 1, flatShading: !!o.flat });
    mats.set(k, m); return m;
  }
  function mesh(geo, mat, x = 0, y = 0, z = 0) { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; }
  const box = (w, h, d, mat, x, y, z) => mesh(new T.BoxGeometry(w, h, d), mat, x, y, z);
  const cyl = (rt, rb, h, mat, x, y, z, seg = 18, open = false) => mesh(new T.CylinderGeometry(rt, rb, h, seg, 1, open), mat, x, y, z);
  const ball = (r, mat, x, y, z, seg = 18) => mesh(new T.SphereGeometry(r, seg, Math.max(8, seg * 0.7 | 0)), mat, x, y, z);
  function tex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 4; return t; }
  const rnd = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(42);
  const lerp = (a, b, k) => a + (b - a) * k, ease = k => k < 0 ? 0 : k > 1 ? 1 : 1 - Math.pow(1 - k, 3);

  // ---------- people ----------
  const SKIN = ['#f6d7b8', '#e8b896', '#c68e63', '#a06a42', '#6f4528', '#4a2e1b'], HAIRC = ['#1d1a17', '#5b3a22', '#d9b25f', '#a8412a', '#b9bcc4', '#3a6df0', '#ff7eb6', '#2fbf71'];
  const SHIRT = ['#2962ff', '#089981', '#f23645', '#f7a600', '#7e57c2', '#e5e7eb', '#22252e', '#ff6fb1', '#00bcd4', '#795548'], PANTS = ['#2b3142', '#3b2a1a', '#1f3b73', '#556b2f', '#7a7a7a', '#e5e7eb'];
  function playerLook() {
    let a = {}; try { a = JSON.parse(localStorage.getItem('mm.avatar') || 'null') || {}; } catch {}
    a = { skin: 1, hair: 1, hairCol: 0, shirt: 0, eyes: 0, beard: 0, hat: 0, acc: 0, pants: 0, ...a };
    return { skin: SKIN[a.skin] || SKIN[1], hair: ['bald', 'short', 'long', 'cap', 'mohawk', 'bun', 'afro', 'spiky'][a.hair] || 'short', hairColor: HAIRC[a.hairCol] || HAIRC[0],
      outfit: 'tee', jacket: SHIRT[a.shirt] || SHIRT[0], pants: PANTS[a.pants] || PANTS[0], eyes: ['', 'glasses', 'shades'][a.eyes] || '', beard: ['', 'stubble', 'beard', 'moustache'][a.beard] || '',
      hat: ['', 'top', 'crown', 'cowboy', 'beanie'][a.hat] || (a.hair === 3 ? 'cap' : ''), acc: ['', 'chain', 'bowtie', 'earrings', 'cigar'][a.acc] || '' };
  }
  const LOOKS = {
    president: { skin: '#eaa35e', hair: 'swoop', hairColor: '#f1c453', outfit: 'suit', jacket: '#101a3d', pants: '#101a3d', shirt: '#f5f5f5', tie: '#c4162a', longTie: true, pin: true, wide: 1.28, brows: '#c78a2f', mouth: 'pursed' },
    reporter: (k) => ({ skin: SKIN[k % 6], hair: ['short', 'long', 'bun', 'short', 'bald'][k % 5], hairColor: HAIRC[k % 4], outfit: 'suit', jacket: ['#22252e', '#3a3f4b', '#1d2b55', '#4a3a2a', '#2f3a2f'][k % 5], pants: '#1e2028', shirt: '#eef1f5', tie: ['#7a1f2b', '#1f4f7a', '#2b2b2b', '#6a4c1f'][k % 4] }),
    vinnie: { skin: '#e2b48e', hair: 'short', hairColor: '#9ea3a8', outfit: 'trench', jacket: '#8a8f98', pants: '#3b3f46', hat: 'fedora', hatColor: '#3b3f46', eyes: 'glasses', wide: 0.95, angry: true, prop: 'calc' },
    tony: { skin: '#d9a073', hair: 'short', hairColor: '#141414', outfit: 'trench', jacket: '#2b2b33', pants: '#1a1a1f', hat: 'fedora', hatColor: '#141414', acc: 'cigar', chain: true, wide: 1.3, angry: true },
    knuckles: { skin: '#c98d64', hair: 'bald', outfit: 'trench', jacket: '#5a4632', pants: '#2a2018', hat: 'fedora', hatColor: '#2a2018', scar: true, eyes: 'shades', wide: 1.2, angry: true, prop: 'knuckles' },
    broker: { skin: '#efc9a6', hair: 'short', hairColor: '#6b4a2b', outfit: 'suit', jacket: '#18234a', pants: '#18234a', shirt: '#ffffff', tie: '#b3122b', wide: 1, prop: 'case', angry: true },
    agent: { skin: '#d9a073', hair: 'short', hairColor: '#1d1a17', outfit: 'suit', jacket: '#151a2e', pants: '#151a2e', shirt: '#ffffff', tie: '#111111', eyes: 'shades', badge: 'SEC', wide: 1.1 },
    rival: { skin: '#c68e63', hair: 'slick', hairColor: '#1d1a17', outfit: 'suit', jacket: '#2a2d36', pants: '#2a2d36', shirt: '#ffffff', tie: '#7a5a00', eyes: 'shades', wide: 1.1, angry: true, acc: 'chain' },
    influencer: { skin: '#e8b896', hair: 'long', hairColor: '#ff7eb6', outfit: 'hoodie', jacket: '#7e57c2', pants: '#22252e', headphones: true, wide: 0.95 },
    god: { skin: '#f3d9bf', hair: 'long', hairColor: '#ffffff', outfit: 'robe', jacket: '#e9e6ff', beard: 'god', glow: true, wide: 1.25, halo: true },
  };
  function person(o) {
    const w = o.wide || 1, g = new T.Group(), P = {};
    const skin = M(o.skin || '#e8b896', { r: 0.55 }), pants = M(o.pants || '#22252e'), top = M(o.jacket || '#22252e', { r: 0.72 }), shoe = M('#121212', { r: 0.35 });
    if (o.outfit === 'robe') {
      g.add(cyl(0.26 * w, 0.52 * w, 1.5, top, 0, 0.75, 0, 28));
      g.add(cyl(0.27 * w, 0.27 * w, 0.06, M('#d9b54a', { m: 0.6, r: 0.3 }), 0, 1.0, 0, 28));
    } else {
      for (const s of [-1, 1]) { g.add(cyl(0.075, 0.064, 0.86, pants, s * 0.105, 0.47, 0, 12)); g.add(box(0.13, 0.08, 0.27, shoe, s * 0.105, 0.04, 0.045)); }
      const pel = cyl(0.2 * w, 0.19 * w, 0.16, pants, 0, 0.9, 0); pel.scale.z = 0.7; g.add(pel);
    }
    const tor = cyl(0.25 * w, 0.2 * w, 0.64, top, 0, 1.28, 0, 22); tor.scale.z = 0.66; g.add(tor); P.body = tor;
    const front = 0.168 * w + 0.004;
    if (o.outfit === 'suit' || o.outfit === 'trench') {
      const sh = new T.Shape(); sh.moveTo(-0.075, 0); sh.lineTo(0.075, 0); sh.lineTo(0, -0.24); sh.lineTo(-0.075, 0);
      const v = new T.Mesh(new T.ShapeGeometry(sh), M(o.shirt || '#f2f2f2')); v.position.set(0, 1.6, front + 0.004); g.add(v);
      if (o.tie || o.outfit === 'suit') { const tie = box(0.05, o.longTie ? 0.5 : 0.3, 0.012, M(o.tie || '#7a1f2b', { r: 0.45 }), 0, o.longTie ? 1.33 : 1.43, front + 0.012); tie.rotation.x = -0.06; g.add(tie); g.add(box(0.06, 0.045, 0.02, M(o.tie || '#7a1f2b'), 0, 1.585, front + 0.012)); }
      for (const s of [-1, 1]) { const lap = box(0.07, 0.26, 0.012, M(shade(o.jacket || '#222', -0.25)), s * 0.065, 1.5, front + 0.01); lap.rotation.z = s * 0.38; g.add(lap); }
      if (o.pin) g.add(box(0.03, 0.02, 0.01, M('#ffffff'), 0.16 * w, 1.47, front + 0.01));
      if (o.badge) { const t = tex(128, 64, (c, W, H) => { c.fillStyle = '#f7c948'; c.fillRect(0, 0, W, H); c.fillStyle = '#111'; c.font = '900 40px system-ui'; c.textAlign = 'center'; c.fillText(o.badge, W / 2, 47); }); const b = new T.Mesh(new T.PlaneGeometry(0.16, 0.08), new T.MeshStandardMaterial({ map: t, roughness: 0.5 })); b.position.set(-0.12 * w, 1.42, front + 0.015); g.add(b); }
    }
    if (o.outfit === 'trench') { // long coat: skirt, belt, popped collar, buttons
      const coat = cyl(0.205 * w, 0.33 * w, 0.66, top, 0, 0.76, 0, 22, true); coat.scale.z = 0.72; coat.material = M(o.jacket, { r: 0.75, ds: true }); g.add(coat);
      const belt = cyl(0.214 * w, 0.214 * w, 0.06, M(shade(o.jacket, -0.35)), 0, 1.06, 0, 22); belt.scale.z = 0.69; g.add(belt);
      g.add(box(0.06, 0.05, 0.02, M('#c9a227', { m: 0.7, r: 0.3 }), 0, 1.06, 0.15 * w));
      for (const s of [-1, 1]) { const col = box(0.13, 0.15, 0.03, top, s * 0.11, 1.64, 0.05); col.rotation.set(-0.3, 0, s * 0.35); g.add(col); for (const y of [1.2, 1.32]) g.add(ball(0.013, M('#1a1a1a'), s * 0.09 * w, y, front + 0.004, 8)); }
    }
    if (o.outfit === 'hoodie') { const hood = new T.Mesh(new T.TorusGeometry(0.15, 0.06, 10, 20), top); hood.position.set(0, 1.64, -0.04); hood.rotation.x = Math.PI / 2.4; g.add(hood); g.add(box(0.2 * w, 0.12, 0.02, M(shade(o.jacket, -0.2)), 0, 1.13, front + 0.008)); for (const s of [-1, 1]) g.add(cyl(0.006, 0.006, 0.18, M('#ffffff'), s * 0.04, 1.5, front + 0.012, 6)); }
    if (o.outfit === 'tee' && o.acc === 'bowtie') g.add(box(0.1, 0.045, 0.03, M('#c4162a'), 0, 1.59, front + 0.01));
    if (o.chain || o.acc === 'chain') { const ch = new T.Mesh(new T.TorusGeometry(0.11, 0.012, 8, 30, Math.PI), M('#f2c14e', { m: 0.9, r: 0.25 })); ch.position.set(0, 1.58, front - 0.02); ch.rotation.z = Math.PI; g.add(ch); }
    // arms on shoulder pivots so they can swing, wave and punch
    for (const s of [-1, 1]) {
      const piv = new T.Group(); piv.position.set(s * 0.28 * w, 1.55, 0); piv.rotation.z = s * 0.1;
      const sleeve = o.outfit === 'tee' ? M(o.jacket) : top;
      piv.add(cyl(0.07, 0.06, 0.62, sleeve, 0, -0.31, 0, 12));
      const hand = ball(0.068, skin, 0, -0.66, 0, 12); piv.add(hand);
      if (s === 1 && o.prop === 'calc') piv.add(box(0.1, 0.15, 0.03, M('#2b2b2b'), 0, -0.72, 0.07));
      if (s === 1 && o.prop === 'knuckles') { const k = new T.Mesh(new T.TorusGeometry(0.05, 0.015, 8, 16), M('#d0d0d0', { m: 0.9, r: 0.2 })); k.position.set(0, -0.66, 0.06); piv.add(k); }
      if (s === -1 && o.prop === 'case') piv.add(box(0.36, 0.26, 0.08, M('#4a2f1a', { r: 0.5 }), 0, -0.82, 0));
      g.add(piv); P[s < 0 ? 'armL' : 'armR'] = piv;
    }
    g.add(cyl(0.065, 0.07, 0.14, skin, 0, 1.66, 0, 12));
    // head
    const hd = new T.Group(); hd.position.y = 1.86; g.add(hd); P.head = hd;
    const skull = ball(0.155, skin, 0, 0, 0, 24); skull.scale.set(o.wide > 1.2 ? 1.08 : 1, 1.12, 1.03); hd.add(skull);
    if (o.wide > 1.2) { const jowl = ball(0.12, skin, 0, -0.1, 0.03, 18); jowl.scale.set(1.15, 0.65, 0.95); hd.add(jowl); }
    for (const s of [-1, 1]) {
      hd.add(ball(0.035, skin, s * 0.156, 0, 0, 10));
      const eyeMat = o.glow ? M('#7fe9ff', { e: '#7fe9ff', ei: 2 }) : M('#ffffff', { r: 0.3 });
      hd.add(ball(0.026, eyeMat, s * 0.055, 0.025, 0.133, 12)); if (!o.glow) hd.add(ball(0.014, M('#1b2a4a', { r: 0.2 }), s * 0.055, 0.025, 0.155, 10));
      const br = box(0.06, 0.014, 0.014, M(o.brows || shade(o.hairColor || '#2a1a12', -0.1)), s * 0.056, 0.075, 0.142); br.rotation.z = o.angry ? s * 0.32 : -s * 0.06; hd.add(br);
    }
    const nose = ball(0.028, M(shade(o.skin || '#e8b896', -0.08), { r: 0.55 }), 0, -0.012, 0.158, 12); nose.scale.set(1, 1.25, 1.15); hd.add(nose);
    const mouth = o.mouth === 'pursed' ? ball(0.026, M('#a3362f'), 0, -0.078, 0.146, 12) : box(0.07, 0.016, 0.016, M('#6b2a24'), 0, -0.078, 0.145);
    if (o.mouth === 'pursed') mouth.scale.set(1.5, 0.7, 0.6); hd.add(mouth); P.mouth = mouth;
    hair(hd, o);
    if (o.beard === 'stubble') { const st = ball(0.158, M(shade(o.skin, -0.28), { op: 0.55 }), 0, -0.02, 0.006, 20); st.scale.set(1, 1.1, 1.03); st.geometry = new T.SphereGeometry(0.158, 20, 12, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.4); hd.add(st); }
    if (o.beard === 'beard') { const b = ball(0.13, M(o.hairColor || '#2a1a12', { r: 0.9 }), 0, -0.1, 0.06, 16); b.scale.set(1.05, 0.8, 0.85); hd.add(b); }
    if (o.beard === 'moustache') hd.add(box(0.09, 0.025, 0.03, M(o.hairColor || '#2a1a12'), 0, -0.048, 0.155));
    if (o.beard === 'god') { const b = new T.Mesh(new T.ConeGeometry(0.15, 0.62, 20), M('#ffffff', { r: 0.9 })); b.position.set(0, -0.34, 0.07); b.rotation.x = Math.PI; b.castShadow = true; hd.add(b); }
    if (o.scar) { const sc = box(0.012, 0.11, 0.01, M('#8a3b2e'), 0.085, 0.02, 0.135); sc.rotation.z = 0.35; hd.add(sc); }
    if (o.eyes === 'shades') { for (const s of [-1, 1]) hd.add(box(0.075, 0.042, 0.012, M('#0a0a0a', { r: 0.15, m: 0.4 }), s * 0.055, 0.025, 0.16)); hd.add(box(0.04, 0.01, 0.01, M('#0a0a0a'), 0, 0.035, 0.162)); }
    if (o.eyes === 'glasses') for (const s of [-1, 1]) { const r = new T.Mesh(new T.TorusGeometry(0.03, 0.006, 6, 20), M('#222')); r.position.set(s * 0.055, 0.025, 0.158); hd.add(r); }
    if (o.acc === 'earrings') for (const s of [-1, 1]) hd.add(ball(0.014, M('#f2c14e', { m: 0.9, r: 0.2 }), s * 0.16, -0.04, 0.01, 8));
    if (o.acc === 'cigar') { const c = cyl(0.014, 0.014, 0.15, M('#7a4a24'), 0.06, -0.085, 0.2, 8); c.rotation.set(Math.PI / 2.2, 0, -0.4); hd.add(c); hd.add(ball(0.016, M('#ff6a00', { e: '#ff5a00', ei: 2.5 }), 0.105, -0.09, 0.26, 8)); }
    if (o.headphones) { const band = new T.Mesh(new T.TorusGeometry(0.17, 0.016, 8, 24, Math.PI), M('#111')); band.position.y = 0.02; hd.add(band); for (const s of [-1, 1]) { const cup = cyl(0.055, 0.055, 0.05, M('#111'), s * 0.17, 0, 0, 16); cup.rotation.z = Math.PI / 2; hd.add(cup); } }
    hat(hd, o);
    if (o.halo) { const h = new T.Mesh(new T.TorusGeometry(0.2, 0.018, 10, 40), M('#ffe27a', { e: '#ffd23a', ei: 2.2 })); h.position.y = 0.32; h.rotation.x = Math.PI / 2.3; hd.add(h); }
    g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    return { g, P, o, seed: rnd() * 10 };
  }
  function hair(hd, o) {
    const c = M(o.hairColor || '#1d1a17', { r: 0.85 }), st = o.hair || 'short';
    if (st === 'bald' || o.hat === 'fedora' && st !== 'long') { if (st !== 'bald' && o.hat === 'fedora') { const sides = new T.Mesh(new T.SphereGeometry(0.162, 22, 12, 0, Math.PI * 2, Math.PI * 0.32, Math.PI * 0.22), c); sides.rotation.x = -0.2; hd.add(sides); } return; }
    const cap = new T.Mesh(new T.SphereGeometry(0.165, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.52), c); cap.scale.set(1.02, 1.12, 1.05); cap.rotation.x = -0.28; cap.position.y = 0.01;
    if (st === 'swoop') { cap.scale.set(1.1, 1.18, 1.12); hd.add(cap); const sw = ball(0.13, c, 0.02, 0.13, 0.07, 20); sw.scale.set(1.55, 0.42, 1.0); sw.rotation.z = 0.18; hd.add(sw); const sw2 = ball(0.1, M(shade(o.hairColor, -0.08), { r: 0.85 }), -0.07, 0.115, 0.1, 16); sw2.scale.set(1.3, 0.35, 0.9); sw2.rotation.z = -0.3; hd.add(sw2); return; }
    if (st === 'slick') { cap.scale.set(1.03, 1.05, 1.08); cap.material = M(o.hairColor, { r: 0.25, m: 0.2 }); hd.add(cap); return; }
    if (st === 'cap') return;
    hd.add(cap);
    if (st === 'long') { const back = box(0.3, 0.34, 0.08, c, 0, -0.12, -0.12); back.geometry = new T.CylinderGeometry(0.16, 0.19, 0.34, 18, 1, true, Math.PI * 0.6, Math.PI * 0.8); back.material = M(o.hairColor, { r: 0.85, ds: true }); back.position.set(0, -0.12, 0); back.rotation.y = Math.PI; hd.add(back); }
    if (st === 'mohawk') hd.add(box(0.045, 0.1, 0.28, c, 0, 0.19, -0.01));
    if (st === 'bun') hd.add(ball(0.065, c, 0, 0.16, -0.1, 14));
    if (st === 'afro') { const a = ball(0.225, c, 0, 0.09, -0.085, 20); hd.add(a); }
    if (st === 'spiky') for (let k = 0; k < 7; k++) { const sp = new T.Mesh(new T.ConeGeometry(0.035, 0.1, 6), c); const a = (k / 7) * Math.PI * 2; sp.position.set(Math.cos(a) * 0.09, 0.17, Math.sin(a) * 0.09 - 0.02); sp.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); hd.add(sp); }
  }
  function hat(hd, o) {
    const h = o.hat; if (!h) return;
    const g = new T.Group(); g.position.y = 0.11; hd.add(g);
    if (h === 'fedora') {
      const m = M(o.hatColor || '#1d1d22', { r: 0.8 });
      const brim = cyl(0.3, 0.3, 0.018, m, 0, 0.01, 0, 32); brim.scale.z = 0.9; g.add(brim);
      const crown = cyl(0.155, 0.185, 0.17, m, 0, 0.1, 0, 26); g.add(crown);
      g.add(cyl(0.188, 0.188, 0.04, M('#0b0b0b'), 0, 0.035, 0, 26));
      const dent = box(0.05, 0.03, 0.22, M(shade(o.hatColor || '#1d1d22', -0.2)), 0, 0.18, 0); g.add(dent);
      g.rotation.set(-0.08, 0, 0.06);
    } else if (h === 'top') { const m = M('#111', { r: 0.4 }); g.add(cyl(0.25, 0.25, 0.02, m, 0, 0.01, 0, 28)); g.add(cyl(0.15, 0.15, 0.3, m, 0, 0.16, 0, 24)); g.add(cyl(0.152, 0.152, 0.05, M('#7a1f2b'), 0, 0.05, 0, 24)); }
    else if (h === 'crown') { const m = M('#f2c14e', { m: 0.9, r: 0.25 }); g.add(cyl(0.16, 0.16, 0.08, m, 0, 0.03, 0, 24, true)); for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; const sp = new T.Mesh(new T.ConeGeometry(0.03, 0.08, 6), m); sp.position.set(Math.cos(a) * 0.16, 0.1, Math.sin(a) * 0.16); g.add(sp); } }
    else if (h === 'cowboy') { const m = M('#8a5a2b', { r: 0.8 }); const b = cyl(0.33, 0.33, 0.02, m, 0, 0.01, 0, 30); b.scale.z = 0.8; g.add(b); g.add(cyl(0.14, 0.17, 0.17, m, 0, 0.1, 0, 22)); }
    else if (h === 'beanie') { const b = new T.Mesh(new T.SphereGeometry(0.17, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), M('#c4162a', { r: 0.95 })); b.position.y = -0.02; g.add(b); g.add(ball(0.04, M('#ffffff', { r: 1 }), 0, 0.17, 0, 10)); }
    else if (h === 'cap') { const m = M(o.jacket || '#2962ff', { r: 0.8 }); const c = new T.Mesh(new T.SphereGeometry(0.168, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), m); c.position.y = -0.04; g.add(c); g.add(box(0.2, 0.015, 0.16, m, 0, -0.03, 0.17)); }
    else if (h === 'bucket') { const m = M('#e6e8ee', { r: 0.9 }); g.add(cyl(0.155, 0.21, 0.15, m, 0, 0.06, 0, 24)); g.add(cyl(0.25, 0.25, 0.015, m, 0, -0.01, 0, 24)); }
  }
  function shade(hex, k) { const n = parseInt(String(hex).replace('#', '').padEnd(6, '0'), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255; const f = v => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k))); return '#' + ((f(r) << 16) | (f(g) << 8) | f(b)).toString(16).padStart(6, '0'); }
  function idle(p, t, talking) {
    const s = p.seed, P = p.P;
    P.body.scale.y = 1 + Math.sin(t * 2.2 + s) * 0.012;
    P.head.rotation.y = Math.sin(t * 0.7 + s) * 0.12; P.head.rotation.x = Math.sin(t * 1.1 + s) * 0.03;
    if (talking) { P.mouth.scale.y = (p.o.mouth === 'pursed' ? 0.7 : 1) * (1 + Math.abs(Math.sin(t * 17 + s)) * 2.4); P.head.rotation.x += Math.sin(t * 9) * 0.03; P.armR.rotation.x = Math.sin(t * 3 + s) * 0.25 - 0.15; }
    else { P.mouth.scale.y = p.o.mouth === 'pursed' ? 0.7 : 1; }
  }

  // ---------- stage ----------
  function stage(target, { bg = '#0b0d14', fog = null, fov = 40, exposure = 1.05 } = {}) {
    const r = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); r.outputEncoding = T.sRGBEncoding; r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = exposure;
    r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
    const cv = r.domElement; cv.className = 'mm3d-cv'; target.prepend(cv);
    const scene = new T.Scene(); scene.background = typeof bg === 'string' ? new T.Color(bg) : bg; if (fog) scene.fog = new T.Fog(fog[0], fog[1], fog[2]);
    const cam = new T.PerspectiveCamera(fov, 1, 0.05, 200);
    const fit = () => { const w = target.clientWidth || innerWidth, h = target.clientHeight || innerHeight; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); S.portrait = w / h < 0.9; };
    const S = { r, scene, cam, t: 0, tick: [], portrait: false, shake: 0 };
    fit(); const ro = new ResizeObserver(fit); ro.observe(target);
    const t0 = performance.now(); let started = false;
    const loop = () => {
      if (!cv.isConnected) { ro.disconnect(); r.dispose(); r.forceContextLoss?.(); scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material?.map) o.material.map.dispose(); }); return; }
      S.t = (performance.now() - t0) / 1000; for (const f of S.tick) f(S.t);
      if (S.shake > 0) { cam.position.x += (Math.random() - 0.5) * S.shake; cam.position.y += (Math.random() - 0.5) * S.shake; S.shake *= 0.88; }
      r.render(scene, cam); if (!started) { started = true; cv.classList.add('on'); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return S;
  }
  function lights(S, { key = '#fff4e0', ki = 2.4, fill = '#8fb0ff', fi = 0.55, kx = 3, ky = 6, kz = 4 } = {}) {
    S.scene.add(new T.HemisphereLight(fill, '#1a1410', fi));
    const k = new T.DirectionalLight(key, ki); k.position.set(kx, ky, kz); k.castShadow = true; k.shadow.mapSize.set(1024, 1024); k.shadow.camera.left = -6; k.shadow.camera.right = 6; k.shadow.camera.top = 6; k.shadow.camera.bottom = -2; k.shadow.bias = -0.0004; S.scene.add(k);
    return k;
  }
  function floor(S, color, w = 30, d = 30, o = {}) { const f = new T.Mesh(new T.PlaneGeometry(w, d), M(color, { r: o.r ?? 0.85, m: o.m ?? 0 })); f.rotation.x = -Math.PI / 2; f.receiveShadow = true; S.scene.add(f); return f; }
  function wall(S, color, z = -3, w = 30, h = 12, map = null) { const m = map ? new T.MeshStandardMaterial({ map, roughness: 0.9 }) : M(color, { r: 0.92 }); const p = new T.Mesh(new T.PlaneGeometry(w, h), m); p.position.set(0, h / 2, z); p.receiveShadow = true; S.scene.add(p); return p; }
  const look = (cam, x, y, z) => cam.lookAt(x, y, z);
  function cityTex(lit = '#ffd98a') { return tex(1024, 512, (c, W, H) => { const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0a1230'); g.addColorStop(1, '#1c2350'); c.fillStyle = g; c.fillRect(0, 0, W, H); const R = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(9); for (let i = 0; i < 26; i++) { const bw = 30 + R() * 70, bh = 120 + R() * 340, x = R() * W; c.fillStyle = '#060a1c'; c.fillRect(x, H - bh, bw, bh); for (let y = H - bh + 8; y < H - 6; y += 14) for (let xx = x + 5; xx < x + bw - 6; xx += 11) if (R() < 0.42) { c.fillStyle = R() < 0.85 ? lit : '#9fd0ff'; c.fillRect(xx, y, 5, 7); } } }); }
  function window3d(S, x, y, z, w, h, map) { const fr = new T.Group(); fr.position.set(x, y, z); const pane = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map })); fr.add(pane); const m = M('#1c1c22', { r: 0.6 }); fr.add(box(w + 0.12, 0.08, 0.08, m, 0, h / 2, 0.02), box(w + 0.12, 0.08, 0.08, m, 0, -h / 2, 0.02), box(0.08, h, 0.08, m, -w / 2, 0, 0.02), box(0.08, h, 0.08, m, w / 2, 0, 0.02), box(0.05, h, 0.06, m, 0, 0, 0.02)); S.scene.add(fr); return fr; }
  function monitor(S, x, y, z, ry = 0, hue = 140) { const g = new T.Group(); g.position.set(x, y, z); g.rotation.y = ry; g.add(box(0.62, 0.38, 0.04, M('#0e0e12', { r: 0.3 }), 0, 0.3, 0)); g.add(box(0.05, 0.2, 0.05, M('#222'), 0, 0.08, -0.03)); const sc = tex(256, 160, (c, W, H) => { c.fillStyle = '#05070c'; c.fillRect(0, 0, W, H); c.strokeStyle = `hsl(${hue} 90% 55%)`; c.lineWidth = 3; c.beginPath(); let v = H * 0.6; for (let i = 0; i <= 20; i++) { v += (Math.random() - 0.48) * 22; v = Math.max(15, Math.min(H - 15, v)); i ? c.lineTo(i * W / 20, v) : c.moveTo(0, v); } c.stroke(); }); const s = new T.Mesh(new T.PlaneGeometry(0.57, 0.33), new T.MeshBasicMaterial({ map: sc })); s.position.set(0, 0.3, 0.021); g.add(s); S.scene.add(g); return g; }
  function desk(S, x, z, w = 1.8, d = 0.8, color = '#3b2a1e') { const g = new T.Group(); g.position.set(x, 0, z); const m = M(color, { r: 0.55 }); g.add(box(w, 0.06, d, m, 0, 0.76, 0)); for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.06, 0.74, 0.06, M('#222'), sx * (w / 2 - 0.08), 0.37, sz * (d / 2 - 0.08))); S.scene.add(g); return g; }
  function confetti(S, n = 220, area = [8, 6, 4], y0 = 5) {
    const geo = new T.PlaneGeometry(0.05, 0.08), mat = new T.MeshBasicMaterial({ side: T.DoubleSide, vertexColors: false });
    const im = new T.InstancedMesh(geo, mat, n), d = new T.Object3D(), col = new T.Color(), P = [];
    for (let i = 0; i < n; i++) { P.push({ x: (Math.random() - 0.5) * area[0], y: y0 + Math.random() * area[1], z: (Math.random() - 0.5) * area[2], s: 0.6 + Math.random() * 0.9, r: Math.random() * 6 }); im.setColorAt(i, col.setHSL(Math.random(), 0.85, 0.6)); }
    S.scene.add(im);
    S.tick.push(t => { for (let i = 0; i < n; i++) { const p = P[i]; const y = p.y - ((t * p.s) % (area[1] + y0)); d.position.set(p.x + Math.sin(t * 2 + p.r) * 0.2, y < -0.2 ? y + area[1] + y0 : y, p.z); d.rotation.set(t * 3 * p.s + p.r, t * 2 + p.r, 0); d.updateMatrix(); im.setMatrixAt(i, d.matrix); } im.instanceMatrix.needsUpdate = true; });
  }
  function flashes(S, n, area, every = 0.5, peak = 5) { const L = []; for (let i = 0; i < n; i++) { const l = new T.PointLight('#ffffff', 0, 6); l.position.set((Math.random() - 0.5) * area[0], area[1] + Math.random() * 0.8, area[2] + Math.random() * 1.5); S.scene.add(l); L.push({ l, next: Math.random() * 2 }); } S.tick.push(t => { for (const f of L) { if (t > f.next) { f.l.intensity = peak; f.next = t + every + Math.random() * 1.6; } f.l.intensity *= 0.82; } }); }

  // ---------- sets ----------
  const SETS = {};
  // presidential press rally: flag wall, podium with seal, reporters in suits and ~50 microphones
  SETS.rally = (S, d) => {
    lights(S, { key: '#fff1dd', ki: 1.5, kx: 1.5, ky: 5, kz: 5, fi: 0.3 });
    const flag = tex(1024, 512, (c, W, H) => { for (let i = 0; i < 13; i++) { c.fillStyle = i % 2 ? '#e8e1d6' : '#8e1c2b'; c.fillRect(0, i * H / 13, W, H / 13 + 1); } c.fillStyle = '#16275a'; c.fillRect(0, 0, W * 0.4, H * 7 / 13); c.fillStyle = '#f3efe6'; for (let r = 0; r < 6; r++) for (let k = 0; k < 9; k++) { c.beginPath(); c.arc(28 + k * 44 + (r % 2) * 22, 26 + r * 44, 7, 0, 7); c.fill(); } });
    wall(S, '#000', -2.6, 18, 8, flag).material.color.set('#6f6666');
    floor(S, '#3a2a22', 30, 30, { r: 0.4, m: 0.1 });
    const seal = tex(256, 256, (c, W) => { c.fillStyle = '#c9a227'; c.beginPath(); c.arc(W / 2, W / 2, 124, 0, 7); c.fill(); c.fillStyle = '#13244f'; c.beginPath(); c.arc(W / 2, W / 2, 100, 0, 7); c.fill(); c.fillStyle = '#fff'; c.font = '900 120px serif'; c.textAlign = 'center'; c.fillText('★', W / 2, W / 2 + 42); });
    const pod = new T.Group(); pod.position.set(0, 0, 0.55); pod.add(box(1.5, 1.12, 0.6, M('#3b261c', { r: 0.4 }), 0, 0.56, 0)); pod.add(box(1.62, 0.07, 0.72, M('#2a1a14', { r: 0.35 }), 0, 1.15, 0));
    const sl = new T.Mesh(new T.CircleGeometry(0.28, 40), new T.MeshStandardMaterial({ map: seal, roughness: 0.4, metalness: 0.3 })); sl.position.set(0, 0.62, 0.305); pod.add(sl); S.scene.add(pod);
    const pres = person(LOOKS.president); pres.g.position.set(0, 0.02, 0); S.scene.add(pres.g);
    pres.P.armL.rotation.set(-0.55, 0, 0.25); pres.P.armR.rotation.set(-0.5, 0, -0.2);
    const mic = (x, y, z, k) => { const g = new T.Group(); g.add(cyl(0.022, 0.018, 0.34, M('#111'), 0, -0.17, 0, 8)); g.add(ball(0.05, M('#2b2b2b', { r: 0.35, m: 0.5 }), 0, 0.02, 0, 10)); g.add(box(0.075, 0.06, 0.075, M(['#c4162a', '#1b6fd1', '#e8e8e8', '#e0a100'][k % 4], { r: 0.5 }), 0, -0.1, 0)); g.position.set(x, y, z); g.lookAt(0, 1.86, 0); g.rotateX(Math.PI / 2); S.scene.add(g); return g; };
    // reporters in suits crowd the podium, arms up, mics pointed at him
    const reps = [];
    for (let k = 0; k < 9; k++) {
      const row = k < 5 ? 0 : 1, i = row ? k - 5 : k, side = i % 2 ? 1 : -1, x = side * ((row ? 1.25 : 0.95) + Math.floor(i / 2) * 0.75), z = row ? 2.3 : 1.45;
      const p = person(LOOKS.reporter(k)); p.g.position.set(x, 0, z); p.g.rotation.y = Math.PI + Math.atan2(x, z) * 0.6; S.scene.add(p.g);
      p.P.armR.rotation.set(-2.45, 0, -0.05); p.P.armL.rotation.set(-0.3, 0, 0.1); reps.push(p);
      const hand = new T.Vector3(); p.P.armR.updateWorldMatrix(true, false); hand.set(0, -0.66, 0); p.P.armR.localToWorld(hand); mic(hand.x, hand.y + 0.03, hand.z, k);
    }
    // the rest of the ~50 mics on poles and outstretched hands, all aimed at his face
    for (let k = 0; k < 42; k++) { const a = (k / 42) * Math.PI * 2 * 1.6, rr = 0.55 + (k % 7) * 0.09; mic(Math.cos(a) * rr * 1.3, 1.6 + Math.sin(a) * rr * 0.45 + 0.1, 0.62 + (k % 5) * 0.12, k); }
    // back-row crowd silhouettes
    const sil = M('#08080d', { r: 1 }); for (let k = 0; k < 18; k++) { const x = -7 + k * 0.85 + rnd() * 0.3; S.scene.add(cyl(0.22, 0.26, 1.4, sil, x, 0.7, 3.6 + rnd() * 0.6), ball(0.15, sil, x, 1.55, 3.6)); }
    flashes(S, 6, [7, 1.6, 1.6], 0.45, 3.5);
    const red = new T.PointLight('#ff3b3b', 0.6, 9); red.position.set(-3, 2.5, 1); const blu = new T.PointLight('#3b6bff', 0.6, 9); blu.position.set(3, 2.5, 1); S.scene.add(red, blu);
    const typing = (d.text?.length || 60) * 0.032 + 0.4;
    S.tick.push(t => {
      idle(pres, t, t < typing); pres.P.head.rotation.y = Math.sin(t * 0.9) * 0.28;
      pres.P.armR.rotation.x = -0.5 + (t < typing ? Math.sin(t * 2.4) * 0.35 : 0); // jabbing the air
      for (const p of reps) { idle(p, t, false); p.P.armR.rotation.x = -2.45 + Math.sin(t * 1.3 + p.seed) * 0.05; }
      const k = ease(Math.min(1, t / 6)); S.cam.position.set(Math.sin(t * 0.25) * 0.25, lerp(2.5, 2.25, k), lerp(5.6, 4.1, k)); look(S.cam, 0, 1.62, 0);
    });
  };
  // loan shark shakedown: your office at night, the shark in a trench coat and fedora kicks the door in
  SETS.shark = (S, d) => {
    lights(S, { key: '#ffd7a8', ki: 1.4, kx: -2, ky: 4, kz: 3, fi: 0.35, fill: '#6c86c9' });
    floor(S, '#2b1d14', 30, 30, { r: 0.55 }); wall(S, '#3a2c22', -3.2, 14, 6);
    window3d(S, 1.6, 2.0, -3.15, 2.4, 1.6, cityTex());
    const door = new T.Group(); door.position.set(-1.6, 0, -3.1); door.add(box(0.1, 2.3, 0.12, M('#1a120c'), -0.55, 1.15, 0), box(0.1, 2.3, 0.12, M('#1a120c'), 0.55, 1.15, 0), box(1.2, 0.1, 0.12, M('#1a120c'), 0, 2.3, 0)); S.scene.add(door);
    const leaf = new T.Group(); leaf.position.set(-2.1, 0, -3.05); leaf.add(box(1.0, 2.2, 0.06, M('#5a3d26', { r: 0.6 }), 0.5, 1.1, 0)); S.scene.add(leaf);
    const hall = new T.PointLight('#ffcf8a', 3, 6); hall.position.set(-1.6, 2, -4); S.scene.add(hall);
    const lamp = new T.PointLight('#ffb766', 2.2, 5); lamp.position.set(1.4, 1.3, 1.1); S.scene.add(lamp);
    desk(S, 0, 1.6, 2.6, 0.9); monitor(S, -0.6, 0.79, 1.5, 0.2); monitor(S, 0.6, 0.79, 1.5, -0.2, 0);
    S.scene.add(cyl(0.05, 0.12, 0.5, M('#c9a227', { m: 0.7, r: 0.3 }), 1.4, 1.04, 1.6));
    const id = ['vinnie', 'tony', 'knuckles', 'broker'].includes(d.shark) ? d.shark : 'tony';
    const sh = person(LOOKS[id]); S.scene.add(sh.g);
    const hits = [0.55, 1.65, 2.05, 2.45];
    S.tick.push(t => {
      leaf.rotation.y = -ease(Math.min(1, t / 0.25)) * 1.7;
      const k = ease(Math.min(1, t / 0.9)); sh.g.position.set(lerp(-1.6, -0.1, k), 0, lerp(-3.6, 0.35, k)); sh.g.rotation.y = lerp(0.6, 0.05, k);
      idle(sh, t, t > 2.9); sh.g.position.y = t < 0.9 ? Math.abs(Math.sin(t * 9)) * 0.04 : 0;
      let punch = 0; for (const h of hits) { const u = t - h + 0.12; if (u > 0 && u < 0.35) punch = Math.max(punch, Math.sin(u / 0.35 * Math.PI)); }
      sh.P.armR.rotation.set(-0.15 - punch * 1.45, 0, -0.1 - punch * 0.25); sh.P.armL.rotation.x = Math.sin(t * 2) * 0.1;
      for (const h of hits) if (t > h && !S['hit' + h]) { S['hit' + h] = 1; S.shake = 0.16; }
      S.cam.position.set(Math.sin(t * 0.4) * 0.1, 1.55, 3.3); look(S.cam, -0.1, 1.45, -0.6);
    });
  };
  // the Market God: rising clouds, a robed figure with a halo, and a lightning bolt
  SETS.cash = (S, d) => {
    const sky = tex(16, 512, (c, W, H) => { const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#05060f'); g.addColorStop(0.55, '#1a1740'); g.addColorStop(1, '#4a3f8e'); c.fillStyle = g; c.fillRect(0, 0, W, H); });
    S.scene.background = sky;
    S.scene.add(new T.HemisphereLight('#b9c4ff', '#2a1f4a', 0.7));
    const sun = new T.DirectionalLight('#fff3c4', 2); sun.position.set(0, 8, 6); S.scene.add(sun);
    const glow = new T.PointLight('#fff6a8', 0, 30); glow.position.set(2, 6, 2); S.scene.add(glow);
    const god = person(LOOKS.god); god.g.scale.setScalar(2.6); god.g.position.set(0, -1.2, -4); S.scene.add(god.g);
    const aura = new T.Mesh(new T.SphereGeometry(2.6, 32, 20), new T.MeshBasicMaterial({ color: '#fffbe0', transparent: true, opacity: 0.08 })); aura.position.set(0, 3.8, -4.6); S.scene.add(aura);
    const bs = new T.Shape(); [[0, 0], [0.32, 0], [0.12, -0.5], [0.42, -0.5], [-0.12, -1.35], [0.06, -0.72], [-0.22, -0.72], [0, 0]].forEach(([x, y], i) => i ? bs.lineTo(x, y) : bs.moveTo(x, y));
    const bolt = new T.Mesh(new T.ExtrudeGeometry(bs, { depth: 0.08, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02 }), M('#fff3a0', { e: '#ffe45c', ei: 2.5 }));
    bolt.position.set(0.05, -0.62, 0.04); bolt.rotation.z = Math.PI; god.P.armR.add(bolt);
    const cloudM = M('#e8e6ff', { r: 1 }), clouds = [];
    for (let i = 0; i < 26; i++) { const c = new T.Group(); for (let k = 0; k < 5; k++) c.add(ball(0.5 + Math.random() * 0.5, cloudM, (k - 2) * 0.55, Math.random() * 0.3, Math.random() * 0.4, 14)); c.position.set((Math.random() - 0.5) * 16, -3 - Math.random() * 6, -1 - Math.random() * 6); c.userData.v = 0.6 + Math.random() * 1.1; S.scene.add(c); clouds.push(c); }
    const strike = new T.Group(); S.scene.add(strike);
    const gift = d.reset || (d.dollars || 0) > 0;
    S.tick.push(t => {
      for (const c of clouds) { c.position.y += c.userData.v * 0.016 * (t < 2 ? 2.2 : 0.6); if (c.position.y > 9) c.position.y = -4; }
      const rise = ease(Math.min(1, (t - 0.6) / 1.6)); god.g.position.y = lerp(-6, -1.2, rise); idle(god, t, t > 1.8 && t < 3.2);
      god.P.armR.rotation.set(-lerp(0.2, 2.9, ease(Math.min(1, Math.max(0, (t - 1.6) / 0.9)))), 0, -0.15);
      if (t > 3.15 && !strike.children.length) { // the bolt comes down
        const pts = [new T.Vector3(2.2, 7, -3)]; for (let k = 1; k < 9; k++) pts.push(new T.Vector3(2.2 - k * 0.3 + (Math.random() - 0.5) * 0.9, 7 - k * 1.1, -3 + k * 0.4));
        const tube = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 60, 0.09, 6), M('#fffbd0', { e: '#fff6a8', ei: 4 })); strike.add(tube); S.shake = 0.3;
      }
      glow.intensity = t > 3.15 && t < 3.6 ? 40 * Math.random() : glow.intensity * 0.9;
      aura.material.opacity = 0.06 + (gift ? 0.05 : 0.02) * (1 + Math.sin(t * 3));
      S.cam.position.set(Math.sin(t * 0.3) * 0.4, 1.6, 7.5); look(S.cam, 0, 3, -4);
    });
  };
  // SEC raid: agents in suits and shades storm your office under police lights
  SETS.raid = (S) => {
    lights(S, { key: '#cfd8ff', ki: 1.3, fi: 0.35 }); floor(S, '#2a2a30', 30, 30, { r: 0.5 }); wall(S, '#2d3038', -3.2, 14, 6);
    window3d(S, -1.8, 2.0, -3.15, 2.2, 1.5, cityTex('#9fd0ff'));
    desk(S, 0.6, 0.6, 2.4, 0.9); monitor(S, 0.2, 0.79, 0.55, 0.1); monitor(S, 1.0, 0.79, 0.55, -0.15, 0);
    const paper = M('#f3f0e6', { r: 1, ds: true }), papers = [];
    for (let k = 0; k < 40; k++) { const p = new T.Mesh(new T.PlaneGeometry(0.21, 0.29), paper); p.position.set((Math.random() - 0.5) * 5, 1 + Math.random() * 3, (Math.random() - 0.5) * 3); p.userData.v = Math.random() * 2 + 0.5; S.scene.add(p); papers.push(p); }
    const R = new T.PointLight('#ff2030', 2.2, 9), B = new T.PointLight('#2040ff', 2.2, 9); S.scene.add(R, B);
    const ag = [-1, 0, 1].map(k => { const p = person({ ...LOOKS.agent, skin: SKIN[(k + 3) % 6] }); S.scene.add(p.g); return { p, k }; });
    S.tick.push(t => {
      R.position.set(Math.cos(t * 6) * 3, 3, Math.sin(t * 6) * 2); B.position.set(-Math.cos(t * 6) * 3, 3, -Math.sin(t * 6) * 2);
      for (const { p, k } of ag) { const u = ease(Math.min(1, (t - 0.15 * (k + 1)) / 1)); p.g.position.set(k * 1.0, Math.abs(Math.sin(t * 10)) * 0.04 * (1 - u), lerp(-4, -0.6 + Math.abs(k) * 0.3, u)); p.g.rotation.y = -k * 0.15; idle(p, t, k === 0 && t > 1.2); p.P.armR.rotation.x = k === 0 ? -1.3 : -0.2; }
      for (const p of papers) { p.position.y -= 0.01 * p.userData.v; p.rotation.x += 0.03 * p.userData.v; p.rotation.z += 0.02; if (p.position.y < 0.02) p.position.y = 4; }
      S.cam.position.set(Math.sin(t * 0.3) * 0.2, 1.6, 3.6); look(S.cam, 0, 1.4, -1);
    });
  };
  // 3am margin call: you, asleep, the phone lighting up the room
  SETS.mc = (S) => {
    S.scene.add(new T.HemisphereLight('#5a6cff', '#0a0a12', 0.25));
    const moon = new T.DirectionalLight('#7f96ff', 0.6); moon.position.set(-3, 4, 1); moon.castShadow = true; S.scene.add(moon);
    floor(S, '#1e1a22', 30, 30); wall(S, '#1c1d2a', -2.2, 14, 6);
    window3d(S, -1.8, 1.9, -2.15, 1.4, 1.2, cityTex('#5a6a9a'));
    const bed = new T.Group(); bed.position.set(0, 0, -0.6); bed.add(box(1.5, 0.35, 2.2, M('#3a2a22'), 0, 0.2, 0), box(1.45, 0.2, 2.1, M('#e8e6f0', { r: 0.95 }), 0, 0.47, 0), box(1.5, 0.9, 0.08, M('#3a2a22'), 0, 0.6, -1.1), box(0.6, 0.14, 0.38, M('#ffffff', { r: 1 }), 0, 0.64, -0.78)); S.scene.add(bed);
    const me = person(playerLook()); me.g.position.set(0, 0.62, 0.35); me.g.rotation.x = -Math.PI / 2; S.scene.add(me.g);
    const blanket = box(1.46, 0.12, 1.45, M('#4a5bd6', { r: 0.95 }), 0, 0.66, 0.05); S.scene.add(blanket);
    const nt = box(0.45, 0.5, 0.4, M('#2b2028'), 1.05, 0.25, -1.2); S.scene.add(nt);
    const clock = new T.Mesh(new T.PlaneGeometry(0.28, 0.12), new T.MeshBasicMaterial({ map: tex(256, 110, (c, W, H) => { c.fillStyle = '#0a0000'; c.fillRect(0, 0, W, H); c.fillStyle = '#ff2b2b'; c.font = '800 84px ui-monospace,monospace'; c.textAlign = 'center'; c.fillText('3:00', W / 2, 86); }) })); clock.position.set(0.95, 0.58, -1.05); S.scene.add(box(0.3, 0.14, 0.1, M('#111'), 0.95, 0.57, -1.11), clock);
    const phone = box(0.09, 0.012, 0.18, M('#111', { r: 0.3 }), 1.15, 0.51, -1.15), screen = new T.Mesh(new T.PlaneGeometry(0.08, 0.16), M('#9fd0ff', { e: '#9fd0ff', ei: 2 })); screen.rotation.x = -Math.PI / 2; screen.position.set(1.15, 0.518, -1.15); S.scene.add(phone, screen);
    const glow = new T.PointLight('#9fd0ff', 0, 3); glow.position.set(1.15, 0.8, -1.1); const red = new T.PointLight('#ff1a2a', 0, 8); red.position.set(0, 2.5, 1); S.scene.add(glow, red);
    S.tick.push(t => {
      const ring = Math.sin(t * 22) > 0 && (t % 1.4) < 0.9; phone.position.x = 1.15 + (ring ? (Math.random() - 0.5) * 0.012 : 0); screen.position.x = phone.position.x; glow.intensity = ring ? 2.2 : 0.8; red.intensity = (Math.sin(t * 3) + 1) * 1.6;
      const up = ease(Math.min(1, Math.max(0, (t - 1.1) / 0.8))); me.g.rotation.x = lerp(-Math.PI / 2, -0.35, up); me.g.position.set(0, lerp(0.62, 0.42, up), lerp(0.35, -0.75, up)); me.P.head.rotation.y = up * 0.5; idle(me, t, false);
      S.cam.position.set(1.8, 1.7, 2.2); look(S.cam, 0.2, 0.8, -0.8);
    });
  };
  // IPO: the stock exchange floor, a giant bell and you with the gavel
  SETS.ipo = (S) => {
    lights(S, { key: '#fff4e0', ki: 2, kx: 0, ky: 6, kz: 4, fi: 0.6 }); floor(S, '#3a3128', 40, 40, { r: 0.35, m: 0.1 });
    const wallT = tex(1024, 256, (c, W, H) => { c.fillStyle = '#04070c'; c.fillRect(0, 0, W, H); c.font = '700 34px ui-monospace,monospace'; for (let r = 0; r < 5; r++) for (let k = 0; k < 7; k++) { const up = Math.random() > 0.3; c.fillStyle = up ? '#22c55e' : '#f04452'; c.fillText(`${['NRLT', 'VLTD', 'PXLN', 'WOOF', 'HVEX', 'MOON', 'ORBT'][(k + r) % 7]} ${up ? '▲' : '▼'}${(Math.random() * 9).toFixed(1)}`, 10 + k * 150, 44 + r * 48); } });
    wallT.wrapS = wallT.wrapT = T.RepeatWrapping; wallT.repeat.set(2, 3); const w = wall(S, '#000', -4, 20, 9, wallT); w.material = new T.MeshBasicMaterial({ map: wallT });
    for (const x of [-4.5, -2.6, 2.6, 4.5]) S.scene.add(cyl(0.3, 0.32, 6, M('#e8e1d2', { r: 0.6 }), x, 3, -2.5, 24));
    S.scene.add(box(3.2, 1.2, 0.8, M('#1c3a6e', { r: 0.5 }), 0, 0.6, -0.2), box(3.4, 0.08, 1, M('#c9a227', { m: 0.8, r: 0.3 }), 0, 1.24, -0.2));
    const bellG = new T.Group(); bellG.position.set(1.3, 3.3, -0.6); S.scene.add(bellG);
    const prof = []; for (let i = 0; i <= 16; i++) { const k = i / 16; prof.push(new T.Vector2(Math.max(0.02, Math.sin(Math.min(1, k * 1.05) * Math.PI / 2) * 0.42 + (k > 0.82 ? (k - 0.82) * 0.9 : 0)), -k * 0.8)); }
    const bell = new T.Mesh(new T.LatheGeometry(prof, 40), M('#d4a52c', { m: 0.95, r: 0.22, ds: true })); bell.castShadow = true; bellG.add(bell); bellG.add(ball(0.08, M('#a07a1a', { m: 0.9, r: 0.3 }), 0, -0.78, 0, 12));
    const me = person(playerLook()); me.g.position.set(-0.4, 1.28, -0.4); S.scene.add(me.g);
    const gav = new T.Group(); gav.add(cyl(0.02, 0.02, 0.4, M('#5a3a1e'), 0, -0.2, 0, 8)); const hd = cyl(0.05, 0.05, 0.16, M('#5a3a1e'), 0, -0.4, 0, 12); hd.rotation.z = Math.PI / 2; gav.add(hd); gav.position.y = -0.66; me.P.armR.add(gav);
    const crowd = []; for (let k = 0; k < 8; k++) { const p = person(LOOKS.reporter(k + 3)); p.g.position.set(-3.3 + k * 0.95, 0, 2.1 + (k % 2) * 0.5); p.g.rotation.y = Math.PI; S.scene.add(p.g); crowd.push(p); }
    confetti(S, 260, [9, 6, 5], 3);
    S.tick.push(t => {
      bellG.rotation.z = Math.sin(t * 9) * 0.25 * Math.max(0, 1 - t / 6) + Math.sin(t * 9) * 0.05;
      const swing = Math.max(0, Math.sin(t * 9)); me.P.armR.rotation.set(-2.2 + swing * 0.9, 0, -0.5); me.P.armL.rotation.set(-2.5, 0, 0.4); idle(me, t, false);
      for (const p of crowd) { idle(p, t, false); const j = Math.abs(Math.sin(t * 5 + p.seed)); p.g.position.y = j * 0.1; p.P.armR.rotation.x = -2.6 + j * 0.4; p.P.armL.rotation.x = -2.5 + j * 0.3; }
      S.cam.position.set(Math.sin(t * 0.2) * 0.8, 2.9, 6.4); look(S.cam, 0, 2.1, -0.5);
    });
  };
  // hostile takeover: the raider across the boardroom table
  SETS.hostile = (S) => {
    lights(S, { key: '#ffe2c0', ki: 1.6, kx: -3, ky: 4, kz: 3, fi: 0.3, fill: '#5c7ad6' }); floor(S, '#1b1d24', 30, 30, { r: 0.4 });
    window3d(S, 0, 2.2, -3.2, 7, 3.2, cityTex()); wall(S, '#14161c', -3.3, 14, 7);
    S.scene.add(box(1.6, 0.08, 5, M('#2a1a12', { r: 0.25, m: 0.1 }), 0, 0.78, -0.4)); for (const z of [-2.6, 1.8]) S.scene.add(cyl(0.12, 0.25, 0.76, M('#111'), 0, 0.38, z));
    for (let k = 0; k < 4; k++) for (const s of [-1, 1]) { const c = new T.Group(); c.position.set(s * 1.05, 0, -2 + k * 1.1); c.add(box(0.55, 0.08, 0.55, M('#111', { r: 0.4 }), 0, 0.5, 0), box(0.55, 0.8, 0.08, M('#111', { r: 0.4 }), s * 0.25, 0.9, 0)); c.children[1].rotation.y = Math.PI / 2; S.scene.add(c); }
    const rv = person(LOOKS.rival); rv.g.position.set(0, 0, -2.1); S.scene.add(rv.g);
    const rim = new T.SpotLight('#7aa2ff', 6, 10, 0.5, 0.6); rim.position.set(0, 3.5, -4.5); rim.target = rv.g; S.scene.add(rim);
    S.tick.push(t => {
      idle(rv, t, t > 0.5 && t < 3); const lean = ease(Math.min(1, t / 1.2)); rv.g.rotation.x = lean * 0.18; rv.P.armR.rotation.set(-0.9 - lean * 0.2, 0, -0.1); rv.P.armL.rotation.set(-0.9 - lean * 0.2, 0, 0.1);
      const k = ease(Math.min(1, t / 7)); S.cam.position.set(0.25, lerp(1.45, 1.55, k), lerp(2.4, 1.2, k)); look(S.cam, 0, 1.55, -2.1);
    });
  };
  // yacht party at sunset
  SETS.yacht = (S) => {
    const sky = tex(16, 512, (c, W, H) => { const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2a1f5c'); g.addColorStop(0.45, '#c7507a'); g.addColorStop(0.62, '#ffb36b'); g.addColorStop(1, '#ffd9a0'); c.fillStyle = g; c.fillRect(0, 0, W, H); });
    S.scene.background = sky; S.scene.fog = new T.Fog('#e89a7a', 18, 60);
    S.scene.add(new T.HemisphereLight('#ffd7b0', '#203050', 0.8)); const sun = new T.DirectionalLight('#ffb070', 2.2); sun.position.set(-6, 3, -10); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); S.scene.add(sun);
    const sunD = new T.Mesh(new T.CircleGeometry(2.2, 40), new T.MeshBasicMaterial({ color: '#ffe0a0', fog: false })); sunD.position.set(-8, 3, -40); S.scene.add(sunD);
    const seaG = new T.PlaneGeometry(120, 120, 80, 80), sea = new T.Mesh(seaG, M('#1b4f6e', { r: 0.25, m: 0.3 })); sea.rotation.x = -Math.PI / 2; S.scene.add(sea); const base = seaG.attributes.position.array.slice();
    const yacht = new T.Group(); S.scene.add(yacht);
    const hs = new T.Shape(); hs.moveTo(-3.2, 0.5); hs.lineTo(3.6, 0.5); hs.quadraticCurveTo(3.4, -0.2, 2.4, -0.45); hs.lineTo(-3.0, -0.45); hs.lineTo(-3.2, 0.5);
    const hull = new T.Mesh(new T.ExtrudeGeometry(hs, { depth: 2.0, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08 }), M('#f4f4f6', { r: 0.3 })); hull.position.set(0, 0.25, -1); hull.castShadow = true; yacht.add(hull);
    yacht.add(box(6.4, 0.05, 1.9, M('#b98a5a', { r: 0.5 }), 0.1, 0.8, 0), box(2.6, 0.8, 1.5, M('#eef0f4', { r: 0.25 }), -0.8, 1.2, 0), box(2.2, 0.3, 1.2, M('#1d2b3a', { r: 0.1, m: 0.4 }), -0.6, 1.35, 0.06));
    const lights2 = []; for (let k = 0; k < 18; k++) { const b = ball(0.05, M(['#ff5a8a', '#ffd23a', '#5ad1ff', '#8aff7a'][k % 4], { e: ['#ff5a8a', '#ffd23a', '#5ad1ff', '#8aff7a'][k % 4], ei: 2 }), -2.8 + k * 0.36, 2.0 - Math.abs(Math.sin(k / 17 * Math.PI)) * 0.4, 0.9, 8); yacht.add(b); lights2.push(b); }
    const ppl = [person(playerLook()), person(LOOKS.influencer), person(LOOKS.reporter(2)), person(LOOKS.reporter(5))]; ppl.forEach((p, k) => { p.g.position.set(0.7 + k * 0.62, 0.83, -0.3 + (k % 2) * 0.5); p.g.scale.setScalar(0.9); yacht.add(p.g); });
    S.tick.push(t => {
      const a = seaG.attributes.position.array; for (let i = 0; i < a.length; i += 3) a[i + 2] = Math.sin(base[i] * 0.35 + t * 1.4) * 0.12 + Math.cos(base[i + 1] * 0.3 + t) * 0.12; seaG.attributes.position.needsUpdate = true; seaG.computeVertexNormals();
      yacht.position.y = Math.sin(t * 1.2) * 0.06; yacht.rotation.z = Math.sin(t * 0.9) * 0.02;
      lights2.forEach((b, k) => b.material.emissiveIntensity = (Math.sin(t * 6 + k) + 1.2) * 1.5);
      ppl.forEach((p, k) => { idle(p, t, false); const j = Math.abs(Math.sin(t * 4 + k)); p.g.position.y = 0.83 + j * 0.06; p.P.armR.rotation.x = -2.4 + j * 0.6; p.P.armL.rotation.x = k % 2 ? -2.2 + j * 0.5 : -0.3; });
      S.cam.position.set(Math.sin(t * 0.15) * 2 + 2, 2.4, 7.5 - Math.sin(t * 0.15)); look(S.cam, 0.8, 1.3, 0);
    });
  };
  // the influencer's livestream, shown inside the stream frame
  SETS.live = (S, d) => {
    S.scene.background = new T.Color('#1a0f2a');
    S.scene.add(new T.HemisphereLight('#c9a0ff', '#100818', 0.5));
    const ringL = new T.PointLight('#ffffff', 2.4, 5); ringL.position.set(0.6, 1.9, 1.4); S.scene.add(ringL);
    const ring = new T.Mesh(new T.TorusGeometry(0.32, 0.03, 10, 40), M('#ffffff', { e: '#ffffff', ei: 2.5 })); ring.position.set(0.75, 1.9, 1.1); ring.rotation.y = -0.4; S.scene.add(ring);
    wall(S, '#2a1a3a', -1.2, 10, 5); floor(S, '#1a1222', 10, 10);
    const strip = box(4, 0.04, 0.04, M('#ff3ea5', { e: '#ff3ea5', ei: 3 }), 0, 2.6, -1.15); S.scene.add(strip);
    const strip2 = box(4, 0.04, 0.04, M('#7a5cff', { e: '#7a5cff', ei: 3 }), 0, 0.9, -1.15); S.scene.add(strip2);
    const poster = new T.Mesh(new T.PlaneGeometry(0.8, 1.1), new T.MeshBasicMaterial({ map: tex(200, 280, (c, W, H) => { const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#ff7eb6'); g.addColorStop(1, '#7a5cff'); c.fillStyle = g; c.fillRect(0, 0, W, H); c.fillStyle = '#fff'; c.font = '900 46px system-ui'; c.fillText('HODL', 34, 150); }) })); poster.position.set(-1.1, 1.9, -1.18); S.scene.add(poster);
    desk(S, 0, 0.55, 1.6, 0.6, '#1a1a22');
    const inf = person(LOOKS.influencer); inf.g.position.set(0, 0, -0.1); S.scene.add(inf.g);
    const micArm = new T.Group(); micArm.add(cyl(0.012, 0.012, 0.5, M('#111'), 0, 0.25, 0, 6)); micArm.add(cyl(0.04, 0.04, 0.14, M('#222', { m: 0.6, r: 0.3 }), 0, 0.55, 0, 12)); micArm.position.set(-0.3, 0.8, 0.45); micArm.rotation.z = 0.4; S.scene.add(micArm);
    S.tick.push(t => {
      idle(inf, t, true); inf.P.head.rotation.y = Math.sin(t * 3.1) * 0.35; inf.P.head.rotation.z = Math.sin(t * 2.3) * 0.1;
      inf.P.armR.rotation.set(-1.2 + Math.sin(t * 6) * 0.6, 0, -0.3); inf.P.armL.rotation.set(-1.0 + Math.cos(t * 5) * 0.5, 0, 0.3);
      S.cam.position.set(Math.sin(t * 0.5) * 0.05, 1.75, 1.9); look(S.cam, 0, 1.6, 0);
    });
  };
  // magazine cover: a photo studio with flashes behind the cover
  SETS.mag = (S) => {
    lights(S, { key: '#ffffff', ki: 1.4, fi: 0.5 }); S.scene.background = new T.Color('#120e06');
    const sweep = new T.Mesh(new T.CylinderGeometry(3, 3, 12, 40, 1, true, Math.PI * 0.75, Math.PI * 0.5), M('#3a2e12', { r: 1, ds: true })); sweep.rotation.z = Math.PI / 2; sweep.position.set(0, 3, -1); S.scene.add(sweep); floor(S, '#3a2e12');
    for (const s of [-1, 1]) { const sb = new T.Group(); sb.position.set(s * 2.4, 0, 0.5); sb.add(cyl(0.02, 0.02, 2, M('#111'), 0, 1, 0, 6), box(0.7, 0.7, 0.1, M('#ffffff', { e: '#ffffff', ei: 1.5 }), 0, 2.1, 0)); sb.rotation.y = -s * 0.6; S.scene.add(sb); }
    const me = person(playerLook()); me.g.position.set(0, 0, -0.6); me.g.rotation.y = 0.25; S.scene.add(me.g); me.P.armR.rotation.set(-0.2, 0, -0.7); me.P.armL.rotation.set(-1.6, 0.4, 0.9);
    flashes(S, 4, [5, 2, 1.5], 0.45, 3);
    S.tick.push(t => { idle(me, t, false); S.cam.position.set(Math.sin(t * 0.3) * 0.4, 1.4, 4.2); look(S.cam, 0, 1.3, -0.6); });
  };
  // the game's own cutscenes: car park, office, trading floor and flat
  SETS.garage = S => { S.scene.background = new T.Color('#0b0c0e'); S.scene.fog = new T.Fog('#0b0c0e', 6, 18); S.scene.add(new T.HemisphereLight('#8ea0b8', '#0a0a0a', 0.35)); floor(S, '#2a2b2e', 40, 40, { r: 0.35, m: 0.2 }); wall(S, '#26272b', -4, 30, 4); S.scene.add(box(40, 0.3, 40, M('#1c1d20'), 0, 3.4, 0));
    for (const x of [-3, 3]) S.scene.add(box(0.45, 3.3, 0.45, M('#3a3b40', { r: 0.9 }), x, 1.65, -1.5));
    for (const [x, z] of [[-2.2, -0.5], [2.4, -1]]) { const tube = box(1.2, 0.05, 0.12, M('#e9f4ff', { e: '#e9f4ff', ei: 2 }), x, 3.2, z); S.scene.add(tube); const l = new T.PointLight('#d8ecff', 2.4, 8); l.position.set(x, 3, z); S.scene.add(l); S.tick.push(t => { const on = !(x < 0 && Math.sin(t * 13) > 0.9); l.intensity = on ? 2.4 : 0.1; tube.material.emissiveIntensity = on ? 2 : 0.1; }); }
    const car = new T.Group(); car.position.set(-2.5, 0, -2.6); car.rotation.y = 0.2; car.add(box(4, 0.7, 1.8, M('#3b0d12', { r: 0.25, m: 0.6 }), 0, 0.55, 0), box(2.2, 0.55, 1.6, M('#14161a', { r: 0.1, m: 0.5 }), -0.2, 1.15, 0)); for (const [x, z] of [[-1.3, 0.9], [1.3, 0.9], [-1.3, -0.9], [1.3, -0.9]]) { const w = cyl(0.33, 0.33, 0.25, M('#111'), x, 0.33, z, 18); w.rotation.x = Math.PI / 2; car.add(w); } S.scene.add(car); };
  SETS.office = S => { lights(S, { key: '#ffe2c0', ki: 1.6, fi: 0.45 }); floor(S, '#2b2520', 30, 30, { r: 0.5 }); wall(S, '#3b3a40', -3, 14, 6); window3d(S, 1.8, 2, -2.95, 2.6, 1.6, cityTex()); desk(S, -1.6, -1.6, 2, 0.8); monitor(S, -1.6, 0.79, -1.7, 0.2); S.scene.add(box(0.5, 1.8, 0.4, M('#5a4636'), 3.2, 0.9, -2.6)); };
  SETS.floor = S => { lights(S, { key: '#fff1dd', ki: 1.8, fi: 0.5 }); floor(S, '#25262c', 40, 40, { r: 0.5 }); const wt = tex(1024, 256, (c, W, H) => { c.fillStyle = '#04070c'; c.fillRect(0, 0, W, H); c.font = '700 30px ui-monospace,monospace'; for (let r = 0; r < 6; r++) for (let k = 0; k < 8; k++) { const up = Math.random() > 0.35; c.fillStyle = up ? '#22c55e' : '#f04452'; c.fillText(`${['MMX', 'NRLT', 'VLTD', 'HVEX', 'WOOF', 'PGEN', 'ORBT', 'PXLN'][k]} ${up ? '+' : '-'}${(Math.random() * 6).toFixed(2)}%`, 8 + k * 128, 36 + r * 40); } }); const w = wall(S, '#000', -4, 24, 8, wt); w.material = new T.MeshBasicMaterial({ map: wt });
    for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) { desk(S, -3.6 + k * 2.4, -1.4 - r * 1.6 + 0.3, 1.8, 0.7, '#2a2d36'); monitor(S, -3.9 + k * 2.4, 0.79, -1.5 - r * 1.6 + 0.3, 0, (k * 90) % 360); monitor(S, -3.3 + k * 2.4, 0.79, -1.5 - r * 1.6 + 0.3, 0, 0); } confetti(S, 140, [9, 5, 4], 3); };
  SETS.flat = S => { lights(S, { key: '#ffd9b0', ki: 1.3, fi: 0.45 }); floor(S, '#4a3a2c', 30, 30, { r: 0.6 }); wall(S, '#5d5470', -3, 14, 6); window3d(S, -2, 2, -2.95, 1.8, 1.4, cityTex());
    const sofa = new T.Group(); sofa.position.set(1.8, 0, -2.2); sofa.add(box(2.2, 0.45, 0.9, M('#7a2f3b', { r: 0.9 }), 0, 0.3, 0), box(2.2, 0.6, 0.25, M('#7a2f3b', { r: 0.9 }), 0, 0.75, -0.35), box(0.25, 0.6, 0.9, M('#6a2632'), -1.1, 0.5, 0), box(0.25, 0.6, 0.9, M('#6a2632'), 1.1, 0.5, 0)); S.scene.add(sofa);
    const tv = box(1.6, 0.9, 0.06, M('#0a0a0c', { r: 0.2 }), -2.8, 1.5, -1); tv.rotation.y = 0.9; S.scene.add(tv); S.scene.add(box(0.3, 0.25, 0.2, M('#f2c14e', { m: 0.8, r: 0.3 }), -1.2, 0.85, -2.6)); };

  // ---------- attaching to the 2D scenes ----------
  const KIND = { pres: 'rally', shark: 'shark', cash: 'cash', raid: 'raid', mc: 'mc', ipo: 'ipo', hostile: 'hostile', yacht: 'yacht', live: 'live', mag: 'mag' };
  function attach(root, kind, data = {}, tries = 0) {
    const k = KIND[kind] || kind; if (!SETS[k] || !webgl) return;
    load().then(() => {
      if (!root.isConnected) { if (tries < 40) setTimeout(() => attach(root, kind, data, tries + 1), 60); return; }
      if (root.classList.contains('has3d')) return;
      const target = k === 'live' ? root.querySelector('.frame') || root : root;
      try {
        const S = stage(target, { fov: k === 'live' ? 35 : 40 }); SETS[k](S, data);
        target.classList.add('has3d'); root.classList.add('has3d');
        if (k === 'mag') portraitInto(root.querySelector('.cover .scn-av'));
      } catch (e) { console.warn('3D scene failed, keeping 2D art', e); root.querySelector('.mm3d-cv')?.remove(); }
    }).catch(() => {});
  }
  // a 3D portrait of the player for the magazine cover
  function portraitInto(slot) {
    if (!slot) return;
    const w = 300, h = 380, r = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); r.setPixelRatio(2); r.setSize(w, h, false); r.outputEncoding = T.sRGBEncoding; r.toneMapping = T.ACESFilmicToneMapping;
    const sc = new T.Scene(), cam = new T.PerspectiveCamera(30, w / h, 0.1, 20); cam.position.set(0.5, 1.45, 3.6); cam.lookAt(0, 1.2, 0);
    sc.add(new T.HemisphereLight('#fff8ee', '#4a3a20', 0.9)); const k = new T.DirectionalLight('#ffffff', 2.2); k.position.set(2, 3, 3); sc.add(k);
    const me = person(playerLook()); me.g.rotation.y = 0.3; me.P.armL.rotation.set(-1.6, 0.4, 0.9); me.P.armR.rotation.set(-0.2, 0, -0.7); sc.add(me.g);
    r.render(sc, cam); const img = new Image(); img.src = r.domElement.toDataURL('image/png'); img.alt = 'You'; img.style.cssText = 'display:block;width:min(260px,58vw);height:auto';
    slot.replaceChildren(img); r.dispose(); r.forceContextLoss?.();
  }

  // the game's built-in cutscenes re-render every frame, so a separate canvas sits behind them
  const CUT_SHARK = /LOAN SHARK|DEBT COLLECTION/;
  let cut = null;
  function castLook(name, o, tag) {
    if (name === 'YOU') return playerLook();
    const shark = CUT_SHARK.test(tag);
    if (/VINNIE/.test(name)) return LOOKS.vinnie; if (/TONY/.test(name)) return LOOKS.tony; if (/KNUCKLES/.test(name)) return LOOKS.knuckles;
    if (shark || o.coat) return { skin: SKIN[(name.length % 4) + 1], hair: 'short', hairColor: HAIRC[name.length % 3], outfit: 'trench', jacket: ['#5a4632', '#2b2b33', '#8a8f98', '#3f4a3a'][name.length % 4], pants: '#1e1e22', hat: o.hat || shark ? 'fedora' : '', hatColor: '#1d1d22', eyes: o.shades ? 'shades' : '', acc: o.cig ? 'cigar' : '', wide: o.big ? 1.3 : 1, angry: shark };
    if (/BROKER/.test(name)) return { ...LOOKS.broker, eyes: o.shades ? 'shades' : '' };
    if (/BUDDY/.test(name)) return { skin: SKIN[2], hair: 'short', hairColor: HAIRC[1], outfit: 'tee', jacket: '#089981', pants: '#2b3142', hat: 'bucket' };
    return { ...LOOKS.reporter(name.length), eyes: o.shades ? 'shades' : '', hat: o.hat ? 'fedora' : '', wide: o.big ? 1.25 : 1 };
  }
  function cutWatch() {
    const el = document.querySelector('.bc.cut');
    if (!el) { if (cut) { cut.host.remove(); cut = null; document.documentElement.classList.remove('mm3d-cut-on'); } return; }
    if (!T) { load().catch(() => {}); return; }
    let cast = []; try { cast = JSON.parse(el.dataset.cast || '[]'); } catch {}
    const key = el.dataset.kind + '|' + cast.map(c => c[0]).join(',');
    if (!cut || cut.key !== key) {
      cut?.host.remove();
      const host = document.createElement('div'); host.id = 'mm3d-cut'; document.body.append(host);
      try {
        const S = stage(host, {}); const set = SETS[el.dataset.set] ? el.dataset.set : 'office'; SETS[set](S); const tag = el.dataset.tag || '';
        const figs = cast.map(([name, o], i) => { const p = person(castLook(name, o || {}, tag)); S.scene.add(p.g); p.g.visible = i < 2; return p; });
        cut = { host, key, S, figs, el };
        S.tick.push(t => {
          const e = document.querySelector('.bc.cut'), sp = Number(e?.dataset.sp ?? -1), line = Number(e?.dataset.line || 0), narrow = S.portrait;
          figs.forEach((p, i) => {
            const x = i === 0 ? (narrow ? -0.55 : -0.85) : i === 1 ? (narrow ? 0.55 : 0.85) : (narrow ? 0 : 2.1);
            p.g.position.set(x, 0, i === 2 ? -0.6 : 0); p.g.rotation.y = i === 0 ? 0.55 : i === 1 ? -0.55 : -0.8; if (i === 2) p.g.visible = line >= 3; idle(p, t, sp === i);
          });
          S.cam.position.set(Math.sin(t * 0.2) * 0.2, 1.6, narrow ? 4.6 : 3.8); look(S.cam, 0, 1.35, 0);
        });
        document.documentElement.classList.add('mm3d-cut-on');
      } catch (e) { console.warn('3D cutscene failed', e); host.remove(); cut = null; }
    }
  }
  setInterval(cutWatch, 120);

  window.mm3d = { attach, load, person, LOOKS };
})();
