// Full-screen Market God scenes.
//   mmFx.president({who, text, name, ticker, mag})  press rally for a presidential announcement (cannot be turned off)
//   mmFx.cash(dollars)                              clouds, lightning and a white flash when the Market God gives or takes money
// Scenes queue up, pause the game while they play, and put it back to the speed it had afterwards.
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const h = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) if (v != null) k === 'class' ? (n.className = v) : k === 'style' ? (n.style.cssText = v) : n.setAttribute(k, v);
    for (const c of kids.flat()) if (c != null) n.append(c.nodeType ? c : document.createTextNode(String(c)));
    return n;
  };
  const money = d => '$' + Math.round(Math.abs(d)).toLocaleString('en-US');
  // small seeded random so the mic cluster looks the same every time
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  const style = h('style', {}, `
  #mmfx{position:fixed;inset:0;z-index:9500;overflow:hidden;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#fff;animation:mmfx-in .35s ease-out}
  @keyframes mmfx-in{from{opacity:0}to{opacity:1}}
  #mmfx button.mmfx-go{cursor:pointer;border:0;border-radius:12px;padding:14px 28px;font:700 18px system-ui;letter-spacing:.02em}
  /* ---------- press rally ---------- */
  #mmfx.pres{background:linear-gradient(#0c1733,#2a0f1c 70%,#150a10)}
  #mmfx.pres svg.stage{position:absolute;inset:0;width:100%;height:100%}
  .mmfx-flash{position:absolute;inset:0;background:#fff;opacity:0;animation:mmfx-cam 2.4s infinite;pointer-events:none}
  @keyframes mmfx-cam{0%,86%,100%{opacity:0}88%{opacity:.34}91%{opacity:.04}94%{opacity:.22}97%{opacity:0}}
  .mmfx-mic{animation:mmfx-bob 1.6s ease-in-out infinite}
  @keyframes mmfx-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
  .mmfx-pres-head{animation:mmfx-nod 2.6s ease-in-out infinite;transform-origin:500px 330px}
  @keyframes mmfx-nod{0%,100%{transform:rotate(-1.2deg)}50%{transform:rotate(1.4deg)}}
  .mmfx-banner{position:absolute;top:2.5vh;left:50%;transform:translateX(-50%);background:#b3122b;border:2px solid #fff;padding:6px 22px;border-radius:6px;font:800 clamp(12px,2.2vw,18px) system-ui;letter-spacing:.18em;box-shadow:0 4px 18px #0008;white-space:nowrap}
  .mmfx-banner i{display:inline-block;width:9px;height:9px;border-radius:50%;background:#fff;margin-right:10px;animation:mmfx-live 1s steps(2) infinite}
  @keyframes mmfx-live{50%{opacity:.15}}
  .mmfx-lower{position:absolute;left:0;right:0;bottom:0;padding:18px 4vw 3.5vh;background:linear-gradient(transparent,#000a 35%,#000d);display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center}
  .mmfx-who{background:#fff;color:#0c1733;font:800 clamp(12px,2vw,16px) system-ui;letter-spacing:.14em;padding:4px 14px;border-radius:5px;text-transform:uppercase}
  .mmfx-say{font:600 clamp(20px,4vw,38px)/1.25 Georgia,"Times New Roman",serif;max-width:1000px;min-height:2.6em}
  .mmfx-tag{font:700 14px system-ui;border-radius:999px;padding:4px 12px}
  .mmfx-go.mmfx-open{background:#2962ff;color:#fff;animation:mmfx-pop .4s ease-out}
  @keyframes mmfx-pop{from{transform:scale(.8);opacity:0}to{transform:none;opacity:1}}
  /* ---------- Market God cash ---------- */
  #mmfx.cash{background:linear-gradient(#05060f,#1a1740 55%,#2d2a5e)}
  .mmfx-cloud{position:absolute;bottom:-40vh;border-radius:50%;background:radial-gradient(circle at 40% 35%,#8f95c2,#4b5088 55%,#262a55);filter:blur(5px);opacity:.96;animation:mmfx-rise 2.6s cubic-bezier(.2,.7,.2,1) forwards}
  @keyframes mmfx-rise{to{transform:translateY(calc(-1 * var(--rise)))}}
  .mmfx-god{position:absolute;left:50%;top:20%;width:min(360px,70vw);transform:translateX(-50%) scale(.6);opacity:0;animation:mmfx-god 1s 1.7s ease-out forwards;filter:drop-shadow(0 0 30px #fff8)}
  @keyframes mmfx-god{to{opacity:1;transform:translateX(-50%) scale(1)}}
  .mmfx-arm{transform-origin:236px 150px;animation:mmfx-throw .35s 3.05s ease-in forwards}
  @keyframes mmfx-throw{to{transform:rotate(38deg)}}
  .mmfx-bolt{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
  .mmfx-bolt polyline{stroke-dasharray:1400;stroke-dashoffset:1400;animation:mmfx-strike .22s 3.25s ease-in forwards}
  @keyframes mmfx-strike{to{stroke-dashoffset:0}}
  .mmfx-white{position:absolute;inset:0;background:#fff;opacity:0;animation:mmfx-whiteout .5s 3.45s ease-out forwards}
  @keyframes mmfx-whiteout{to{opacity:1}}
  .mmfx-msg{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;padding:0 5vw;opacity:0;animation:mmfx-in .6s 4.05s forwards}
  .mmfx-msg small{font:800 clamp(14px,2.6vw,22px) system-ui;letter-spacing:.2em;color:#1a1740}
  .mmfx-msg b{font:900 clamp(46px,13vw,130px)/1 system-ui;letter-spacing:-.02em}
  .mmfx-note{font:600 italic clamp(16px,2.6vw,24px)/1.35 Georgia,serif;color:#1a1740;max-width:760px}.mmfx-note span{display:block;font:700 13px system-ui;letter-spacing:.14em;margin-top:6px;color:#55507a;font-style:normal}
  .mmfx-msg .up{color:#0a9a5a}.mmfx-msg .dn{color:#d3212f}
  .mmfx-msg .mmfx-go{background:#1a1740;color:#fff;margin-top:20px;opacity:0;animation:mmfx-in .4s 5.1s forwards}
  @media (prefers-reduced-motion:reduce){.mmfx-flash,.mmfx-mic,.mmfx-pres-head,.mmfx-banner i{animation:none}}
  `);
  document.head.append(style);

  // ----- scene art -----
  const svg = (tag, attrs = {}, ...kids) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); for (const c of kids.flat()) c && n.append(c); return n; };

  function rallyStage() {
    seed = 7;
    const s = svg('svg', { class: 'stage', viewBox: '0 0 1000 600', preserveAspectRatio: 'xMidYMax slice' });
    // flag-like backdrop
    for (let i = 0; i < 9; i++) s.append(svg('rect', { x: 0, y: i * 46, width: 1000, height: 23, fill: i % 2 ? '#3b1b2a' : '#5c1424', opacity: .8 }));
    s.append(svg('rect', { x: 0, y: 0, width: 330, height: 230, fill: '#13244f', opacity: .92 }));
    for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) s.append(svg('circle', { cx: 28 + c * 40 + (r % 2) * 20, cy: 30 + r * 40, r: 4, fill: '#ffffffaa' }));
    // crowd silhouettes
    for (let i = 0; i < 26; i++) { const x = 20 + i * 38 + rnd() * 14, y = 392 + rnd() * 30; s.append(svg('circle', { cx: x, cy: y, r: 17, fill: '#07070d' }), svg('rect', { x: x - 24, y: y + 14, width: 48, height: 90, rx: 20, fill: '#07070d' })); }
    // the president (a cartoon caricature, nobody in particular)
    const g = svg('g');
    g.append(svg('path', { d: 'M300 600 L320 450 Q335 395 420 380 L580 380 Q665 395 680 450 L700 600 Z', fill: '#101a3d' }));                 // suit
    g.append(svg('path', { d: 'M440 380 L500 470 L560 380 Z', fill: '#f5f5f5' }));                                                           // shirt
    g.append(svg('path', { d: 'M488 398 L512 398 L524 430 L508 560 L492 560 L476 430 Z', fill: '#c4162a' }));                              // long red tie
    g.append(svg('path', { d: 'M440 380 L470 432 L500 470 L450 420 Z', fill: '#0b1330' }), svg('path', { d: 'M560 380 L530 432 L500 470 L550 420 Z', fill: '#0b1330' })); // lapels
    g.append(svg('rect', { x: 600, y: 440, width: 16, height: 10, fill: '#fff', rx: 1 }));                                                   // flag pin
    g.append(svg('rect', { x: 470, y: 340, width: 60, height: 50, rx: 14, fill: '#d98f4e' }));                                               // neck
    const head = svg('g', { class: 'mmfx-pres-head' });
    head.append(svg('ellipse', { cx: 500, cy: 280, rx: 88, ry: 98, fill: '#eaa35e' }));                                                      // face
    head.append(svg('ellipse', { cx: 500, cy: 345, rx: 66, ry: 30, fill: '#eaa35e' }));                                                      // jowls
    head.append(svg('path', { d: 'M404 262 Q392 168 482 160 Q585 148 620 214 Q640 160 548 132 Q430 108 392 200 Q380 250 404 290 Z', fill: '#f1c453' })); // swept hair
    head.append(svg('path', { d: 'M412 214 Q520 150 598 206 Q540 178 440 232 Z', fill: '#e2b13f' }));
    head.append(svg('path', { d: 'M440 244 L484 252', stroke: '#c78a2f', 'stroke-width': 9, 'stroke-linecap': 'round' }), svg('path', { d: 'M516 252 L560 244', stroke: '#c78a2f', 'stroke-width': 9, 'stroke-linecap': 'round' })); // brows
    head.append(svg('ellipse', { cx: 462, cy: 270, rx: 13, ry: 5, fill: '#fff' }), svg('ellipse', { cx: 540, cy: 270, rx: 13, ry: 5, fill: '#fff' }), svg('circle', { cx: 464, cy: 270, r: 4, fill: '#1b2a4a' }), svg('circle', { cx: 538, cy: 270, r: 4, fill: '#1b2a4a' })); // squint
    head.append(svg('path', { d: 'M500 276 L492 312 L510 314', stroke: '#c9803e', 'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round' }));  // nose
    head.append(svg('ellipse', { cx: 500, cy: 338, rx: 24, ry: 11, fill: '#a3362f' }), svg('path', { d: 'M478 336 Q500 328 522 336', stroke: '#7d2622', 'stroke-width': 3, fill: 'none' })); // pursed mouth
    g.append(head);
    s.append(g);
    // podium
    s.append(svg('path', { d: 'M330 600 L355 470 L645 470 L670 600 Z', fill: '#2a1a14' }), svg('rect', { x: 340, y: 452, width: 320, height: 28, rx: 5, fill: '#3b261c' }));
    s.append(svg('circle', { cx: 500, cy: 535, r: 38, fill: '#c9a227' }), svg('circle', { cx: 500, cy: 535, r: 30, fill: '#13244f' }), svg('text', { x: 500, y: 546, 'text-anchor': 'middle', 'font-size': 32, fill: '#fff' }, '★'));
    // ~50 microphones shoved in his face
    for (let i = 0; i < 52; i++) {
      const side = rnd(), ang = rnd() * Math.PI * 2, rad = 55 + rnd() * 100, x = 500 + Math.cos(ang) * rad * 1.6, y = 300 + Math.abs(Math.sin(ang)) * rad * 0.95 + 10;
      if (Math.abs(x - 500) < 44 && y < 400) continue;
      const a = Math.atan2(320 - y, 500 - x) * 180 / Math.PI;
      const outer = svg('g', { transform: `translate(${x.toFixed(0)} ${y.toFixed(0)}) rotate(${a.toFixed(0)})` });
      const m = svg('g', { class: 'mmfx-mic', style: `animation-delay:-${(rnd() * 1.6).toFixed(2)}s` }); outer.append(m);
      m.append(svg('rect', { x: -52, y: -4, width: 58, height: 8, rx: 4, fill: '#111' }), svg('rect', { x: -52, y: -5, width: 10, height: 10, rx: 2, fill: ['#c4162a', '#1b6fd1', '#e8e8e8', '#e0a100'][i % 4] }), svg('circle', { cx: 12, cy: 0, r: 8.5, fill: '#2b2b30' }), svg('circle', { cx: 12, cy: 0, r: 6, fill: '#55555e' }));
      s.append(outer); void side;
    }
    return s;
  }

  const sceneRally = d => {
    const root = h('div', { id: 'mmfx', class: 'pres', role: 'dialog', 'aria-label': 'Presidential announcement' });
    root.append(rallyStage());
    for (const delay of [0, .7, 1.3]) root.append(h('div', { class: 'mmfx-flash', style: `animation-delay:${delay}s;animation-duration:${2.1 + delay}s` }));
    root.append(h('div', { class: 'mmfx-banner' }, h('i'), 'LIVE · PRESS CONFERENCE'));
    const say = h('div', { class: 'mmfx-say', 'aria-live': 'polite' });
    const btn = h('button', { class: 'mmfx-go mmfx-open', style: 'display:none' }, 'Open the market');
    const up = d.mag >= 0;
    const tag = d.ticker ? h('span', { class: 'mmfx-tag', style: `background:${up ? '#0a9a5a' : '#d3212f'}` }, `${up ? '▲' : '▼'} ${d.label || d.ticker + ' traders are reacting'}`) : null;
    root.append(h('div', { class: 'mmfx-lower' }, h('div', { class: 'mmfx-who' }, d.who || 'The President'), say, tag, btn));
    const full = '“' + d.text + '”'; let i = 0, done = false;
    const finish = () => { done = true; say.textContent = full; btn.style.display = ''; btn.focus(); };
    const tick = setInterval(() => { if (done) return clearInterval(tick); say.textContent = full.slice(0, ++i); if (i >= full.length) { clearInterval(tick); finish(); } }, 32);
    root.addEventListener('click', e => { if (e.target === btn) return; if (!done) { clearInterval(tick); finish(); } });
    return { root, btn };
  };

  const sceneCash = d => {
    const gift = d.reset || d.dollars > 0;
    const root = h('div', { id: 'mmfx', class: 'cash', role: 'dialog', 'aria-label': 'Market God' });
    seed = 11;
    for (let i = 0; i < 18; i++) { const size = 160 + rnd() * 240; root.append(h('div', { class: 'mmfx-cloud', style: `width:${size}px;height:${size * .62}px;left:${(rnd() * 110 - 8).toFixed(0)}%;--rise:${(40 + rnd() * 70).toFixed(0)}vh;animation-delay:${(rnd() * .9).toFixed(2)}s` })); }
    const god = svg('svg', { class: 'mmfx-god', viewBox: '0 0 300 360' });
    god.append(svg('circle', { cx: 150, cy: 120, r: 120, fill: '#fff', opacity: .12 }));
    god.append(svg('path', { d: 'M40 360 Q50 200 150 170 Q250 200 260 360 Z', fill: '#e9e6ff' }));                                    // robe
    god.append(svg('path', { d: 'M110 160 Q150 120 190 160 L200 250 Q150 330 100 250 Z', fill: '#fff' }));                                 // beard
    god.append(svg('ellipse', { cx: 150, cy: 100, rx: 48, ry: 56, fill: '#f3d9bf' }));                                                     // face
    god.append(svg('path', { d: 'M100 92 Q110 40 150 38 Q192 40 200 92 Q180 64 150 66 Q118 64 100 92 Z', fill: '#fff' }));                  // hair
    god.append(svg('path', { d: 'M118 96 L140 100', stroke: '#8a8aa8', 'stroke-width': 6, 'stroke-linecap': 'round' }), svg('path', { d: 'M182 96 L160 100', stroke: '#8a8aa8', 'stroke-width': 6, 'stroke-linecap': 'round' }));
    god.append(svg('circle', { cx: 128, cy: 108, r: 6, fill: '#7fe9ff' }), svg('circle', { cx: 172, cy: 108, r: 6, fill: '#7fe9ff' }));    // glowing eyes
    god.append(svg('path', { d: 'M132 138 Q150 130 168 138', stroke: '#c9a99a', 'stroke-width': 4, fill: 'none' }));
    const arm = svg('g', { class: 'mmfx-arm' });
    arm.append(svg('path', { d: 'M236 150 L276 70 L300 84 L256 166 Z', fill: '#e9e6ff' }), svg('circle', { cx: 288, cy: 74, r: 12, fill: '#f3d9bf' }),
      svg('polygon', { points: '288,-22 262,44 284,44 270,96 312,26 290,26 304,-22', fill: '#fff6a8', stroke: '#fff', 'stroke-width': 2 }));
    god.append(arm);
    root.append(god);
    const bolt = svg('svg', { class: 'mmfx-bolt', viewBox: '0 0 1000 1000', preserveAspectRatio: 'none' });
    bolt.append(svg('polyline', { points: '650,230 600,380 650,400 560,560 620,580 500,780 540,800 470,1000', fill: 'none', stroke: '#fffbd0', 'stroke-width': 18, 'stroke-linejoin': 'round', style: 'filter:drop-shadow(0 0 18px #fff6a8) drop-shadow(0 0 40px #9fd8ff)' }));
    root.append(bolt, h('div', { class: 'mmfx-white' }));
    const btn = h('button', { class: 'mmfx-go' }, 'Continue');
    root.append(d.reset ? h('div', { class: 'mmfx-msg' }, h('small', {}, 'THE MARKET GOD HAS RESET THE MARKET'), h('b', { class: 'up', style: 'font-size:clamp(34px,8vw,80px)' }, 'Back to $10,000'), h('div', { class: 'mmfx-note' }, 'Everyone starts again. Make it count.'), btn)
      : h('div', { class: 'mmfx-msg' }, h('small', {}, gift ? 'THE MARKET GOD HAS GIVEN YOU' : 'THE MARKET GOD HAS TAKEN'), h('b', { class: gift ? 'up' : 'dn' }, (gift ? '+' : '−') + money(d.dollars)), d.note ? h('div', { class: 'mmfx-note' }, '“' + d.note + '”', h('span', {}, '— The Market God')) : null, btn));
    return { root, btn };
  };

  // ----- queue -----
  const queue = []; let playing = false, savedSpeed = null;
  const ui = () => window.__mm?.ui;
  function next() {
    const job = queue.shift();
    if (!job) { playing = false; const u = ui(); if (u && savedSpeed != null) u.speed = savedSpeed; savedSpeed = null; window.__mm?.render?.(); return; }
    playing = true;
    const u = ui(); if (u) { if (savedSpeed == null) savedSpeed = u.speed; u.speed = 0; }
    const { root, btn } = job.kind === 'president' ? sceneRally(job.data) : sceneCash(job.data);
    document.body.append(root);
    const stop = e => { if (e.key === 'Enter' && document.activeElement === btn) return; e.stopPropagation(); if (e.key === ' ') e.preventDefault(); };
    document.addEventListener('keydown', stop, true);
    btn.addEventListener('click', () => { document.removeEventListener('keydown', stop, true); root.remove(); next(); });
    if (job.kind === 'cash') setTimeout(() => btn.focus(), 5200);
  }
  const push = (kind, data) => { queue.push({ kind, data }); if (!playing) next(); };

  window.mmFx = {
    president: d => push('president', { label: String(d.label || '').slice(0, 60), who: String(d.who || 'The President').slice(0, 40), text: String(d.text || '').slice(0, 160), name: d.name, ticker: d.ticker, mag: Number(d.mag) || 0 }),
    cash: (dollars, note) => { if (Number.isFinite(dollars) && Math.abs(dollars) >= 1) push('cash', { dollars, note: note ? String(note).slice(0, 200) : '' }); },
    reset: () => push('cash', { dollars: 0, reset: true }),
  };
})();
