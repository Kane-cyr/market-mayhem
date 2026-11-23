// More full-screen moments. A watcher looks at the game once a second and plays a scene when something
// big happens. Choices only change the game in career mode; in ranked runs, duels and challenges the
// scenes are for show, so the server's replay of your run is never affected.
//   SEC raid (insider investigation opens)  · 3am margin call  · IPO bell (taking your company public)
//   hostile takeover bid for your company   · yacht party       · market crash on the trading floor
//   influencer meltdown on a livestream      · magazine cover when you reach Millionaire, Tycoon, Legend
(() => {
  'use strict';
  const S = () => window.__mm?.G?.S;
  const career = () => S() && !S().mode;
  const usd = c => '$' + Math.round(c / 100).toLocaleString('en-US');
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) if (v == null || v === false) continue; else k === 'class' ? (n.className = v) : k.startsWith('on') ? n.addEventListener(k.slice(2), v) : k === 'style' ? (n.style.cssText = v) : n.setAttribute(k, v);
    for (const c of kids.flat()) if (c != null) n.append(c.nodeType ? c : document.createTextNode(String(c)));
    return n;
  };
  const svgEl = html => { const d = el('div'); d.innerHTML = html; return d.firstElementChild; };
  const myLook = () => { try { return JSON.parse(localStorage.getItem('mm.avatar') || 'null') || {}; } catch { return {}; } };
  const avatar = (look, size) => { const d = el('div', { class: 'scn-av' }); try { d.innerHTML = window.__mm.avatar(look || {}, size); } catch { /* ignore */ } return d; };

  document.head.append(el('style', {}, `
  .scn{position:fixed;inset:0;z-index:9500;overflow:hidden;color:#fff;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;animation:scn-in .3s ease-out;display:flex;flex-direction:column;align-items:center;justify-content:flex-end}
  @keyframes scn-in{from{opacity:0}}
  .scn .panel{position:relative;z-index:3;margin-bottom:4vh;width:min(680px,94vw);background:#0d0d12ee;border:1px solid #ffffff22;border-radius:14px;padding:16px 18px;display:flex;flex-direction:column;gap:10px;animation:scn-up .5s .4s both}
  @keyframes scn-up{from{opacity:0;transform:translateY(24px)}}
  .scn .kick{font:800 12px system-ui;letter-spacing:.16em;color:#f7c948}.scn .big{font:800 clamp(22px,4vw,34px)/1.15 system-ui}.scn .say{font:600 clamp(16px,2.4vw,20px)/1.4 Georgia,serif}.scn .info{color:#cfd2dc;font-size:14px}
  .scn .row{display:flex;gap:10px;flex-wrap:wrap;height:auto;cursor:auto;border-left:0}.scn button{cursor:pointer;border:0;border-radius:10px;padding:12px 16px;font:700 15px system-ui;color:#fff;background:#2962ff;flex:1;min-width:180px}
  .scn button.g{background:#0a9a5a}.scn button.r{background:#b3122b}.scn button.d{background:#3a3a46}
  .scn .art{position:absolute;inset:0;z-index:1;pointer-events:none}
  /* SEC raid */
  .scn.raid{background:#120d0a}.scn.raid .lights{position:absolute;inset:0;animation:scn-siren .5s infinite alternate}
  @keyframes scn-siren{from{background:radial-gradient(circle at 15% 10%,#ff1f3d66,transparent 45%)}to{background:radial-gradient(circle at 85% 10%,#1f5bff66,transparent 45%)}}
  .scn.raid .agents{position:absolute;bottom:44%;left:50%;transform:translateX(-50%);display:flex;gap:18px;animation:scn-rush .6s .2s both}
  @keyframes scn-rush{from{transform:translate(60vw,0)}}
  /* margin call */
  .scn.mc{background:linear-gradient(#05060c,#0c0f1f)}.scn.mc .clock{position:absolute;top:12%;left:50%;transform:translateX(-50%);font:800 clamp(48px,12vw,120px) ui-monospace,monospace;color:#ff3b3b;text-shadow:0 0 30px #ff3b3b99}
  .scn.mc .phone{position:absolute;top:44%;left:50%;font-size:clamp(60px,12vw,110px);animation:scn-ring .12s infinite alternate}
  @keyframes scn-ring{from{transform:translateX(-50%) rotate(-12deg)}to{transform:translateX(-50%) rotate(12deg)}}
  .scn.mc .red{position:absolute;inset:0;background:#ff000022;animation:scn-pulse 1s infinite}@keyframes scn-pulse{50%{background:#ff000055}}
  /* IPO bell */
  .scn.ipo{background:linear-gradient(#0b2a4a,#071629)}.scn.ipo .bell{position:absolute;top:10%;left:50%;font-size:clamp(90px,16vw,160px);transform-origin:50% 10%;animation:scn-bell .35s 6 alternate ease-in-out}
  @keyframes scn-bell{from{transform:translateX(-50%) rotate(-25deg)}to{transform:translateX(-50%) rotate(25deg)}}
  .scn .conf{position:absolute;top:-5vh;width:10px;height:16px;animation:scn-fall linear forwards}@keyframes scn-fall{to{transform:translateY(115vh) rotate(720deg)}}
  /* takeover */
  .scn.hostile{background:linear-gradient(#1b1210,#0c0806)}.scn.hostile .rival{position:absolute;bottom:30%;left:50%;transform:translateX(-50%);animation:scn-up .6s both}
  /* yacht */
  .scn.yacht{background:linear-gradient(#ff7eb6,#7b3fe4 45%,#0b2a6b 46%,#06163f)}.scn.yacht .boat{position:absolute;bottom:34%;left:50%;transform:translateX(-50%);font-size:clamp(110px,20vw,200px);animation:scn-bob 1.6s infinite ease-in-out}
  @keyframes scn-bob{50%{transform:translate(-50%,-10px) rotate(2deg)}}.scn.yacht .party{position:absolute;top:8%;left:0;right:0;text-align:center;font-size:clamp(30px,6vw,52px);letter-spacing:.3em;animation:scn-pulse2 .5s infinite alternate}@keyframes scn-pulse2{to{opacity:.4}}
  /* crash */
  .scn.crash{background:#2a0508}.scn.crash .tick{position:absolute;top:-10vh;font:800 clamp(16px,2.6vw,26px) ui-monospace,monospace;color:#ff4d5e;animation:scn-fall linear forwards}
  .scn.crash .paper{position:absolute;bottom:-10vh;width:40px;height:52px;background:#f3f0e6;box-shadow:0 2px 6px #0006;animation:scn-fly ease-out forwards}@keyframes scn-fly{to{transform:translate(var(--dx),-120vh) rotate(var(--r))}}
  .scn.crash .head{position:absolute;top:10%;left:0;right:0;text-align:center;font:900 clamp(44px,11vw,120px) Impact,system-ui;color:#ff2e43;letter-spacing:.04em;text-shadow:0 6px 0 #000;animation:scn-shake .3s 4}
  @keyframes scn-shake{25%{transform:translate(-8px,4px)}75%{transform:translate(8px,-4px)}}
  /* livestream */
  .scn.live{background:#0b0b10}.scn.live .frame{position:absolute;top:5vh;left:50%;transform:translateX(-50%);width:min(760px,94vw);height:52vh;border-radius:12px;background:linear-gradient(135deg,#2a1840,#3c1838);border:1px solid #ffffff22;overflow:hidden}
  .scn.live .badge{position:absolute;top:12px;left:12px;background:#e01e37;font:800 12px system-ui;padding:3px 8px;border-radius:4px}.scn.live .watch{position:absolute;top:12px;left:70px;font:600 12px system-ui;background:#0008;padding:3px 8px;border-radius:4px}
  .scn.live .host{position:absolute;bottom:16px;left:24px;width:110px;height:110px;border-radius:50%;display:grid;place-items:center;font:800 40px system-ui;background:#ff7eb6;color:#2a1840;animation:scn-talk .25s infinite alternate}@keyframes scn-talk{to{transform:scale(1.05)}}
  .scn.live .chat{position:absolute;right:12px;top:44px;bottom:12px;width:40%;display:flex;flex-direction:column;justify-content:flex-end;gap:4px;font:13px system-ui;overflow:hidden}
  .scn.live .chat div{background:#0006;border-radius:6px;padding:3px 8px;animation:scn-up .3s both}
  /* magazine */
  .scn.mag{background:radial-gradient(#3a2e12,#0b0904)}.scn.mag .cover{position:absolute;top:4vh;left:50%;transform:translateX(-50%) rotate(-2deg);width:min(360px,70vw);aspect-ratio:3/4;background:linear-gradient(#f7e7b4,#e0b94c);border-radius:6px;box-shadow:0 30px 80px #000c;overflow:hidden;color:#1b1206;animation:scn-cover .7s cubic-bezier(.2,.8,.2,1.2) both}
  @keyframes scn-cover{from{transform:translateX(-50%) rotate(-30deg) scale(.3);opacity:0}}
  .scn.mag .mast{font:900 clamp(30px,7vw,52px)/1 Georgia,serif;text-align:center;letter-spacing:.04em;padding-top:10px;color:#8a1c1c}.scn.mag .issue{text-align:center;font:700 10px system-ui;letter-spacing:.2em}
  .scn.mag .cover .scn-av{position:absolute;bottom:0;left:50%;transform:translateX(-50%)}
  .scn.mag .tag{position:absolute;left:12px;right:12px;top:22%;text-align:center;font:900 clamp(18px,4vw,28px)/1.05 system-ui;text-transform:uppercase;text-shadow:0 2px 0 #f7e7b4}
  .scn-av svg{display:block}`));

  function scene(cls, art, kick, big, say, info, choices) {
    const root = el('div', { class: 'scn ' + cls, role: 'dialog', 'aria-label': big }), art2 = el('div', { class: 'art' }, ...art);
    const result = el('div', { class: 'say', style: 'display:none' });
    const done = el('button', { style: 'display:none' }, 'Continue');
    const row = el('div', { class: 'row' });
    const finish = text => { row.remove(); if (text) { result.textContent = text; result.style.display = ''; } done.style.display = ''; done.focus(); };
    if (choices?.length) for (const c of choices) row.append(el('button', { class: c.cls || '', onclick: () => finish(c.run()) }, c.label));
    else { row.remove(); done.style.display = ''; }
    root.append(art2, el('div', { class: 'panel' }, el('div', { class: 'kick' }, kick), el('div', { class: 'big' }, big), say ? el('div', { class: 'say' }, say) : null, info ? el('div', { class: 'info' }, info) : null, choices?.length ? row : null, result, done));
    return { root, btn: done };
  }
  const play = build => window.mmFx?.custom(build);
  const save = () => { window.__mm.save(); window.__mm.render(); };
  const agent = () => svgEl(`<svg viewBox="0 0 80 180" width="70" height="158"><circle cx="40" cy="26" r="20" fill="#d9a073"/><rect x="22" y="18" width="36" height="8" rx="3" fill="#111"/><path d="M8 180 L14 60 Q40 44 66 60 L72 180Z" fill="#1d2b55"/><rect x="16" y="78" width="48" height="22" fill="#f7c948"/><text x="40" y="94" font-size="13" font-weight="900" text-anchor="middle" fill="#1d2b55" font-family="system-ui">ASC</text></svg>`);

  // 1. SEC raid when an insider-trading investigation opens
  function raid() {
    const G = S(), I = G.player.insider, nw = window.__mm.nw().total, fee = Math.max(500000, Math.round(Math.max(0, nw) * 0.03));
    play(() => scene('raid', [el('div', { class: 'lights' }), el('div', { class: 'agents' }, agent(), agent(), agent())], 'AURELIAN SECURITIES COMMISSION', 'This is a raid.', '“Nobody touch the computers. We have questions about some very lucky trades.”', `Insider heat: ${Math.round(I?.heat || 0)}.`,
      career() ? [
        { label: `Lawyer up (${usd(fee)})`, cls: 'g', run: () => { const p = S().player; const pay = Math.min(p.cash, fee); p.cash -= pay; if (p.insider) p.insider.heat *= 0.6; save(); return `Your lawyers bill ${usd(pay)} and bury them in paperwork. The heat cools.`; } },
        { label: 'Shred the documents', cls: 'r', run: () => { const p = S().player, I2 = p.insider; if (Math.random() < 0.5) { if (I2) { I2.case = null; I2.heat *= 0.5; } save(); return 'The shredder wins. With nothing to read, they drop the case.'; } if (I2) I2.heat += 30; save(); return 'They caught you mid-shred. Obstruction makes everything worse: heat +30.'; } },
      ] : null));
  }
  // 2. the 3am margin call
  function marginCall(text) {
    play(() => scene('mc', [el('div', { class: 'red' }), el('div', { class: 'clock' }, '3:00 AM'), el('div', { class: 'phone' }, '📱')], 'INCOMING CALL · YOUR BROKER', 'MARGIN CALL', '“Your shorts are underwater. Wake up. We need money, now.”', text, null));
  }
  // 3. ringing the IPO bell when you take your company public
  function ipo(i) {
    const G = S(), o = G.player.empire?.[i]; if (!o || !career()) return;
    const value = Math.max(Math.round(o.paid * 0.3), Math.round(o.rev * Math.max(o.margin, 0) * 15 * 100)), price = Math.round(value * (1.1 + Math.random() * 0.3));
    G.player.cash += price; G.player.empire.splice(i, 1); G.player.empireValue = G.player.empire.reduce((a, x) => a + Math.max(Math.round(x.paid * 0.3), Math.round(x.rev * Math.max(x.margin, 0) * 15 * 100)), 0);
    G.player.log.push({ type: 'divest', t: G.t, ticker: o.tk, total: price }); save();
    const conf = Array.from({ length: 60 }, (_, k) => el('div', { class: 'conf', style: `left:${Math.random() * 100}%;background:hsl(${k * 37 % 360} 90% 60%);animation-duration:${2 + Math.random() * 2.5}s;animation-delay:${Math.random()}s` }));
    play(() => scene('ipo', [el('div', { class: 'bell' }, '🔔'), ...conf], 'THE EXCHANGE · OPENING BELL', `${o.name} goes public`, 'You ring the bell. The floor cheers. The shares sell out in minutes.', `You sold your company to the public for ${usd(price)}.`, null));
    return price;
  }
  // 4. a hostile takeover bid for one of your companies
  function hostile(i) {
    const G = S(), o = G.player.empire?.[i]; if (!o || !career()) return;
    const value = Math.max(Math.round(o.paid * 0.3), Math.round(o.rev * Math.max(o.margin, 0) * 15 * 100)), bid = Math.round(value * (1.2 + Math.random() * 0.4)), defend = Math.round(value * 0.05);
    const rival = { skin: 2, hair: 1, hairCol: 4, shirt: 6, eyes: 2, beard: 3, hat: 1, acc: 4, mouth: 2, pants: 0 };
    play(() => scene('hostile', [el('div', { class: 'rival' }, avatar(rival, 280))], 'HOSTILE TAKEOVER', `A raider wants ${o.name}`, `“${usd(bid)}. Cash. Today. Or I buy up your suppliers and starve you out.”`, `Worth about ${usd(value)} to you. Fighting costs ${usd(defend)} in lawyers and bankers.`, [
      { label: `Sell for ${usd(bid)}`, cls: 'g', run: () => { const H = S(), k = H.player.empire.indexOf(o); if (k >= 0) { H.player.empire.splice(k, 1); H.player.cash += bid; H.player.log.push({ type: 'divest', t: H.t, ticker: o.tk, total: bid }); } save(); return `Done. ${usd(bid)} lands in your account.`; } },
      { label: `Fight it (${usd(defend)})`, cls: 'r', run: () => { const H = S(); H.player.cash = Math.max(0, H.player.cash - defend); o.margin = Math.max(-1, o.margin - 0.01); save(); return 'You fend them off. Expensive, and the distraction dents your margins, but it is still yours.'; } },
    ]));
  }
  // 5. yacht party when you buy a yacht or an island
  function yachtParty(name) {
    const G = S(), L = G.player.life, gain = Math.round((L?.followers || 300) * 0.15) + 500;
    if (career() && L) { L.followers += gain; save(); }
    play(() => scene('yacht', [el('div', { class: 'party' }, '🎉 🍾 🎶 🍾 🎉'), el('div', { class: 'boat' }, '🛥️')], 'YOU THREW A PARTY', `Welcome aboard the ${name}`, 'Half of Aurelian finance shows up. Three influencers post you from the deck.', career() ? `+${gain.toLocaleString('en-US')} followers.` : null, null));
  }
  // 6. crash on the trading floor
  function crash(drop) {
    const ticks = Array.from({ length: 26 }, () => el('div', { class: 'tick', style: `left:${Math.random() * 96}%;animation-duration:${1.5 + Math.random() * 2}s;animation-delay:${Math.random() * 1.5}s` }, `${['MMX', 'NRLT', 'VLTD', 'HVEX', 'WOOF', 'PGEN'][Math.floor(Math.random() * 6)]} ▼${(Math.random() * 20 + 3).toFixed(1)}%`));
    const papers = Array.from({ length: 24 }, () => el('div', { class: 'paper', style: `left:${Math.random() * 100}%;--dx:${Math.round(Math.random() * 300 - 150)}px;--r:${Math.round(Math.random() * 720 - 360)}deg;animation-duration:${2 + Math.random() * 2}s;animation-delay:${Math.random()}s` }));
    play(() => scene('crash', [el('div', { class: 'head' }, 'CRASH'), ...ticks, ...papers], 'THE TRADING FLOOR', `The market is down ${(Math.abs(drop) * 100).toFixed(1)}% today`, 'Traders scream into phones. Someone is crying under a desk. Paper everywhere.', 'Panics end. The question is what you do in the middle of one.', null));
  }
  // 7. an influencer melts down on a livestream after you start beef
  function meltdown(who, line) {
    const initials = who.replace(/@.*/, '').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const chat = el('div', { class: 'chat' });
    const lines = ['LMAOOO', 'she is SO mad', 'who is this guy', '🍿🍿🍿', 'ratio incoming', 'not the stock beef', 'W take honestly', 'L take honestly', 'clip this'];
    lines.forEach((t, k) => setTimeout(() => chat.append(el('div', {}, el('b', {}, `user${Math.floor(Math.random() * 900 + 100)}: `), t)), 600 + k * 450));
    play(() => scene('live', [el('div', { class: 'frame' }, el('div', { class: 'badge' }, '● LIVE'), el('div', { class: 'watch' }, `${(Math.random() * 40 + 8).toFixed(1)}k watching`), el('div', { class: 'host' }, initials), chat)], `${who.toUpperCase()} IS LIVE`, 'They saw your post.', `“${line}”`, 'Their followers are now trading against your call.', null));
  }
  // 8. magazine cover at the big levels
  const COVERS = { 6: ['Market Millionaire', 'The new money everyone is talking about'], 7: ['Tycoon', 'How one trader bought half the market'], 8: ['Market Legend', 'The most feared name in Aurelian finance'] };
  function cover(level) {
    const [title, sub] = COVERS[level] || COVERS[6], nick = (localStorage.getItem('mm.nick') || 'You');
    const mag = el('div', { class: 'cover' }, el('div', { class: 'mast' }, 'MAYHEM'), el('div', { class: 'issue' }, 'THE MONEY ISSUE'), avatar(myLook(), 300), el('div', { class: 'tag' }, `${nick}: ${title}`));
    play(() => scene('mag', [mag], 'COVER STORY', `You made the cover: ${title}`, sub, null, null));
  }

  // ----- the watcher -----
  let mark = null;
  function snapshot(G) {
    const p = G.player;
    return { game: G, level: p.level, caseOpen: !!p.insider?.case, notes: new Set(p.notifications), items: new Set((p.life?.owned || []).map(o => o.uid)), day: Math.floor(G.t / 6), crashDay: -1 };
  }
  function watch() {
    const G = S(); if (!G || !G.player) return;
    if (!mark || mark.game !== G) { mark = snapshot(G); return; } // a new or loaded game: start fresh, never replay old moments
    const p = G.player;
    if ((p.level || 0) > (mark.level || 0)) { let top = 0; for (let l = (mark.level || 0) + 1; l <= p.level; l++) if (COVERS[l]) top = l; if (top) cover(top); mark.level = p.level; } // one cover, for the highest level reached
    const open = !!p.insider?.case; if (open && !mark.caseOpen) raid(); mark.caseOpen = open;
    for (const n of p.notifications) if (!mark.notes.has(n)) { mark.notes.add(n); if (/Margin warning|broker covered/i.test(n.text || '')) marginCall(n.text); }
    for (const o of p.life?.owned || []) if (!mark.items.has(o.uid)) { mark.items.add(o.uid); if (/yacht|island/i.test(o.id)) yachtParty(o.id.replace(/_/g, ' ')); }
    const day = Math.floor(G.t / 6);
    if (day !== mark.day) {
      mark.day = day;
      if (career()) for (let i = 0; i < (p.empire || []).length; i++) if (Math.random() < 0.03) { hostile(i); break; }
    }
    const idx = G.idx; if (idx?.prevClose && idx.level / idx.prevClose - 1 <= -0.05 && mark.crashDay !== day) { mark.crashDay = day; crash(idx.level / idx.prevClose - 1); }
  }
  setInterval(watch, 1000);
  window.mmScenes = { raid, marginCall, ipo, hostile, yachtParty, crash, meltdown, cover };
})();
