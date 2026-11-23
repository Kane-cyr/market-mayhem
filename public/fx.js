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
  /* ---------- loan shark ---------- */
  #mmfx.shark{background:#1b120d;animation:mmfx-in .2s,mmfx-shake .5s .55s,mmfx-shake .35s 1.65s,mmfx-shake .35s 2.05s,mmfx-shake .35s 2.45s}
  @keyframes mmfx-shake{0%,100%{transform:none}20%{transform:translate(-14px,6px)}40%{transform:translate(12px,-8px)}60%{transform:translate(-8px,4px)}80%{transform:translate(6px,-2px)}}
  .mmfx-room{position:absolute;inset:0;background:linear-gradient(#3a2618,#24170f 62%,#140c08 62%)}
  .mmfx-window{position:absolute;left:8%;top:10%;width:26%;height:34%;background:linear-gradient(#0b1430,#22305e);border:8px solid #5a3a22;box-shadow:inset 0 0 0 3px #2a1a10}
  .mmfx-window::after{content:'';position:absolute;inset:auto 8% 10% 8%;height:40%;background:repeating-linear-gradient(90deg,#f7d36b 0 4px,transparent 4px 14px);opacity:.35}
  .mmfx-door{position:absolute;right:10%;top:12%;width:18%;height:50%;background:#6b4426;border:6px solid #3a2414;transform-origin:right center;animation:mmfx-door .25s .5s ease-in forwards}
  @keyframes mmfx-door{to{transform:perspective(600px) rotateY(-80deg);background:#4a2e19}}
  .mmfx-desk{position:absolute;left:0;right:0;bottom:0;height:24%;background:linear-gradient(#5b3b23,#3a2414);border-top:6px solid #7a5032}
  .mmfx-shark-wrap{position:absolute;left:50%;bottom:16%;width:min(330px,55vw);transform:translateX(70vw);animation:mmfx-walkin .45s .75s ease-out forwards}
  @keyframes mmfx-walkin{to{transform:translateX(-50%)}}
  .mmfx-fist{transform-origin:200px 250px;animation:mmfx-punch .3s 1.55s 3 ease-in-out}
  @keyframes mmfx-punch{50%{transform:translate(-120px,40px) scale(1.25)}}
  .mmfx-pow{position:absolute;font:900 clamp(30px,6vw,60px) Impact,system-ui;color:#ffe14d;-webkit-text-stroke:3px #b3122b;transform:scale(0) rotate(-12deg);opacity:0;animation:mmfx-pow .5s ease-out forwards}
  @keyframes mmfx-pow{40%{transform:scale(1.25) rotate(-8deg);opacity:1}100%{transform:scale(1) rotate(-8deg);opacity:0}}
  .mmfx-hurt{position:absolute;inset:0;background:radial-gradient(transparent 40%,#b3122b99);opacity:0;animation:mmfx-hurt 1.2s 1.6s forwards}
  @keyframes mmfx-hurt{30%{opacity:1}100%{opacity:.55}}
  .mmfx-panel{position:absolute;left:50%;bottom:3vh;transform:translateX(-50%);width:min(680px,94vw);background:#0d0d12ee;border:1px solid #ffffff22;border-radius:14px;padding:16px 18px;display:flex;flex-direction:column;gap:10px;opacity:0;animation:mmfx-in .4s 2.9s forwards}
  .mmfx-say2{font:700 clamp(16px,2.6vw,22px)/1.35 Georgia,serif}
  .mmfx-info{font:14px/1.45 system-ui;color:#cfd2dc}
  .mmfx-choices{display:flex;gap:10px;flex-wrap:wrap}.mmfx-choices .mmfx-go{flex:1;min-width:200px;font-size:15px;padding:12px 14px}
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

  // ----- loan shark shakedown -----
  // Each lender has a face: Vinnie (glasses, calculator), Big Tony (gold chain, cigar),
  // Knuckles (bald, scar, brass knuckles) and the broker (suit, briefcase).
  const SHARK_LOOK = {
    vinnie: { skin: '#e2b48e', suit: '#5d6470', shirt: '#d9d9d9', hair: '#9ea3a8', bald: false, wide: 0.85, glasses: true, prop: 'calc', line: 'I ran the numbers. Twice. You owe me' },
    tony: { skin: '#d9a073', suit: '#2b2b33', shirt: '#7a1f2b', hair: '#141414', bald: false, wide: 1.25, chain: true, prop: 'cigar', line: 'Nobody makes Big Tony wait. You owe me' },
    knuckles: { skin: '#c98d64', suit: '#3a3a3a', shirt: '#efefef', hair: null, bald: true, wide: 1.15, scar: true, tank: true, prop: 'knuckles', line: 'The boys and me came for our money. You owe us' },
    broker: { skin: '#efc9a6', suit: '#18234a', shirt: '#ffffff', hair: '#6b4a2b', bald: false, wide: 0.95, tie: '#b3122b', prop: 'case', line: 'Margin call, in person. You owe the firm' },
  };
  function sharkSvg(id) {
    const L = SHARK_LOOK[id] || SHARK_LOOK.tony, w = L.wide;
    const g = svg('svg', { viewBox: '0 0 300 380', class: 'mmfx-shark' });
    const bx = (x) => 150 + (x - 150) * w;
    g.append(svg('path', { d: `M${bx(40)} 380 Q${bx(48)} 240 150 225 Q${bx(252)} 240 ${bx(260)} 380 Z`, fill: L.tank ? L.skin : L.suit })); // body / arms
    if (L.tank) g.append(svg('path', { d: `M${bx(95)} 380 L${bx(105)} 245 Q150 262 ${bx(195)} 245 L${bx(205)} 380 Z`, fill: L.shirt }));
    else g.append(svg('path', { d: 'M125 228 L150 300 L175 228 Z', fill: L.shirt }));
    if (L.tie) g.append(svg('path', { d: 'M144 236 L156 236 L162 300 L150 316 L138 300 Z', fill: L.tie }));
    if (L.chain) g.append(svg('path', { d: 'M128 236 Q150 286 172 236', stroke: '#f2c14e', 'stroke-width': 6, fill: 'none' }));
    g.append(svg('rect', { x: 132, y: 190, width: 36, height: 40, rx: 10, fill: L.skin }));                                     // neck
    g.append(svg('ellipse', { cx: 150, cy: 140, rx: 56 * (0.9 + 0.1 * w), ry: 66, fill: L.skin }));                               // head
    if (!L.bald) g.append(svg('path', { d: 'M94 132 Q96 72 150 70 Q206 72 206 132 Q196 96 150 96 Q108 96 94 132 Z', fill: L.hair }));
    g.append(svg('path', { d: 'M112 126 L140 134', stroke: '#2a1a12', 'stroke-width': 7, 'stroke-linecap': 'round' }), svg('path', { d: 'M188 126 L160 134', stroke: '#2a1a12', 'stroke-width': 7, 'stroke-linecap': 'round' })); // angry brows
    g.append(svg('circle', { cx: 128, cy: 146, r: 6, fill: '#1b1b1b' }), svg('circle', { cx: 172, cy: 146, r: 6, fill: '#1b1b1b' }));
    if (L.glasses) g.append(svg('rect', { x: 110, y: 134, width: 34, height: 24, rx: 6, fill: 'none', stroke: '#222', 'stroke-width': 4 }), svg('rect', { x: 156, y: 134, width: 34, height: 24, rx: 6, fill: 'none', stroke: '#222', 'stroke-width': 4 }), svg('path', { d: 'M144 144 L156 144', stroke: '#222', 'stroke-width': 4 }));
    if (L.scar) g.append(svg('path', { d: 'M170 108 L186 160', stroke: '#8a3b2e', 'stroke-width': 4 }), svg('path', { d: 'M172 122 L184 120 M175 134 L187 132 M178 146 L190 144', stroke: '#8a3b2e', 'stroke-width': 2 }));
    g.append(svg('path', { d: 'M128 182 Q150 172 172 182', stroke: '#5a2a22', 'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round' })); // scowl
    if (L.prop === 'cigar') g.append(svg('rect', { x: 166, y: 176, width: 34, height: 8, rx: 3, fill: '#7a4a24' }), svg('circle', { cx: 202, cy: 180, r: 4, fill: '#ff6a00' }));
    const fist = svg('g', { class: 'mmfx-fist' });
    fist.append(svg('circle', { cx: 252, cy: 250, r: 26, fill: L.skin }));
    if (L.prop === 'knuckles') fist.append(svg('path', { d: 'M232 236 Q252 226 272 236', stroke: '#c9c9c9', 'stroke-width': 8, fill: 'none' }));
    if (L.prop === 'calc') fist.append(svg('rect', { x: 230, y: 214, width: 40, height: 54, rx: 4, fill: '#333' }), svg('rect', { x: 236, y: 220, width: 28, height: 10, fill: '#9fe39f' }));
    if (L.prop === 'case') fist.append(svg('rect', { x: 222, y: 252, width: 60, height: 40, rx: 5, fill: '#4a2f1a' }));
    g.append(fist);
    return g;
  }
  const sceneShark = d => {
    const root = h('div', { id: 'mmfx', class: 'shark', role: 'dialog', 'aria-label': 'Loan shark' });
    const room = h('div', { class: 'mmfx-room' });
    room.append(h('div', { class: 'mmfx-window' }), h('div', { class: 'mmfx-door' }), h('div', { class: 'mmfx-desk' }));
    const who = h('div', { class: 'mmfx-shark-wrap' }); who.append(sharkSvg(d.shark));
    root.append(room, who);
    for (const [txt, x, y, t] of [['BANG!', 64, 30, .55], ['WHAM!', 30, 40, 1.65], ['POW!', 58, 52, 2.05], ['OOF!', 40, 30, 2.45]])
      root.append(h('div', { class: 'mmfx-pow', style: `left:${x}%;top:${y}%;animation-delay:${t}s` }, txt));
    root.append(h('div', { class: 'mmfx-hurt' }));
    const L = SHARK_LOOK[d.shark] || SHARK_LOOK.tony;
    const panel = h('div', { class: 'mmfx-panel' });
    const btn = h('button', { class: 'mmfx-go', style: 'display:none;background:#2962ff;color:#fff' }, 'Continue');
    const say = h('div', { class: 'mmfx-say2' }, `${d.who}: “${L.line} ${money(d.owed)}. Right now.”`);
    const short = d.cash < d.owed;
    const info = h('div', { class: 'mmfx-info' }, `You have ${money(d.cash)} in cash.${short ? ' Pay now and they take the rest from your stuff' + (d.pledged?.length ? ' (starting with your ' + d.pledged.join(', ') + ')' : '') + ', then your shares.' : ''}`);
    const left = d.maxBegs - d.begs;
    const pay = h('button', { class: 'mmfx-go', style: 'background:#0a9a5a;color:#fff' }, `Pay now (${money(d.owed)})`);
    const beg = h('button', { class: 'mmfx-go', style: 'background:#3a3a46;color:#fff' }, left > 0 ? `Beg for more time (+30%, 2 days · ${left} left)` : 'Beg anyway (they are done listening)');
    const choices = h('div', { class: 'mmfx-choices' }, pay, beg);
    const result = h('div', { class: 'mmfx-info', style: 'font-weight:700' });
    panel.append(say, info, choices, result, btn); root.append(panel);
    const done = text => { choices.remove(); info.remove(); result.textContent = text; btn.style.display = ''; btn.focus(); };
    pay.onclick = () => { const r = d.onPay?.() || {}; done(r.ok === false ? r.error : r.left > 0 ? `They took ${money(r.took / 100)}${r.toys?.length ? ', your ' + r.toys.join(', ') : ''}${r.sold?.length ? ' and sold your ' + r.sold.join(', ') : ''}. You still came up ${money(r.left / 100)} short, so every shark in town has blacklisted you.` : `Paid. They took ${money(r.took / 100)}${r.toys?.length ? ', plus your ' + r.toys.join(', ') : ''}. They leave, slowly.`); };
    beg.onclick = () => { const r = d.onBeg?.() || {}; done(r.ok === false ? r.error : r.refused ? `“Begging time is over.” They took ${money(r.took / 100)}${r.toys?.length ? ', your ' + r.toys.join(', ') : ''}${r.left > 0 ? `. You are still ${money(r.left / 100)} short and blacklisted.` : '.'}` : `They give you 2 more days. You now owe ${money(r.owed / 100)}. Your face hurts.`); };
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
      : h('div', { class: 'mmfx-msg' }, h('small', {}, d.from ? d.from.toUpperCase() + ' SENT YOU' : gift ? 'THE MARKET GOD HAS GIVEN YOU' : 'THE MARKET GOD HAS TAKEN'), h('b', { class: gift ? 'up' : 'dn' }, (gift ? '+' : '−') + money(d.dollars)), d.note ? h('div', { class: 'mmfx-note' }, '“' + d.note + '”', h('span', {}, '— ' + (d.from || 'The Market God'))) : null, btn));
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
    const { root, btn } = job.kind === 'custom' ? job.data() : job.kind === 'president' ? sceneRally(job.data) : job.kind === 'shark' ? sceneShark(job.data) : sceneCash(job.data);
    document.body.append(root);
    const stop = e => { if (e.key === 'Enter' && document.activeElement === btn) return; e.stopPropagation(); if (e.key === ' ') e.preventDefault(); };
    document.addEventListener('keydown', stop, true);
    btn.addEventListener('click', () => { document.removeEventListener('keydown', stop, true); root.remove(); next(); });
    if (job.kind === 'cash') setTimeout(() => btn.focus(), 5200);
  }
  const push = (kind, data) => { queue.push({ kind, data }); if (!playing) next(); };

  window.mmFx = {
    custom: build => push('custom', build), // build() returns { root, btn }: the scene closes when btn is clicked
    shark: d => push('shark', d),
    president: d => push('president', { label: String(d.label || '').slice(0, 60), who: String(d.who || 'The President').slice(0, 40), text: String(d.text || '').slice(0, 160), name: d.name, ticker: d.ticker, mag: Number(d.mag) || 0 }),
    cash: (dollars, note) => { if (!(Number.isFinite(dollars) && Math.abs(dollars) >= 1)) return; const m = /^(\S+) sent you money(?:: (.*))?$/.exec(note || ''); push('cash', m ? { dollars, from: m[1], note: m[2] || '' } : { dollars, note: note ? String(note).slice(0, 200) : '' }); },
    reset: () => push('cash', { dollars: 0, reset: true }),
  };
})();
