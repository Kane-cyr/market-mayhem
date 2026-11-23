// Rug pull (career only). On a stock's page: dump your whole position and crash the price, in your market
// and in every other player's. Meme coins can be rugged by any holder; anything else needs 5% of the company.
// It is very illegal: the Securities Commission notices, and your insider heat jumps.
(() => {
  'use strict';
  const S = () => window.__mm?.G?.S;
  const usd = c => '$' + Math.round(c / 100).toLocaleString('en-US');
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) if (v == null || v === false) continue; else k === 'class' ? (n.className = v) : k.startsWith('on') ? n.addEventListener(k.slice(2), v) : k === 'style' ? (n.style.cssText = v) : n.setAttribute(k, v);
    for (const c of kids.flat()) if (c != null) n.append(c.nodeType ? c : document.createTextNode(String(c)));
    return n;
  };
  document.head.append(el('style', {}, `
  #mmrug{border:1px solid #f2364566;background:linear-gradient(90deg,#2a0b10,#160b10);margin-bottom:12px}
  #mmrug button{background:#b3122b;border:0;color:#fff;font-weight:800;border-radius:8px;padding:8px 14px;cursor:pointer}#mmrug button:disabled{opacity:.45;cursor:default}
  .scn.rug{background:linear-gradient(#1a0a2e,#3a0d1a)}.scn.rug .rugart{position:absolute;bottom:34%;left:50%;width:min(520px,80vw);height:60px;transform:translateX(-50%);background:repeating-linear-gradient(90deg,#b3122b 0 22px,#f7c948 22px 34px,#2962ff 34px 46px);border-radius:6px;animation:rug-yank .6s .6s cubic-bezier(.6,0,.9,.4) forwards}
  @keyframes rug-yank{to{transform:translateX(120vw) rotate(8deg)}}
  .scn.rug .ppl{position:absolute;bottom:calc(34% + 50px);left:50%;transform:translateX(-50%);font-size:clamp(34px,6vw,54px);letter-spacing:.2em;animation:rug-fall .7s 1s ease-in forwards}
  @keyframes rug-fall{to{transform:translate(-50%,140px) rotate(-20deg);opacity:.3}}
  .scn.rug .stamp{position:absolute;top:12%;left:50%;transform:translateX(-50%) rotate(-8deg);font:900 clamp(40px,10vw,100px) Impact,system-ui;color:#ff2e43;border:8px solid #ff2e43;padding:0 22px;border-radius:12px;opacity:0;animation:rug-stamp .3s 1.3s forwards}
  @keyframes rug-stamp{from{transform:translateX(-50%) rotate(-8deg) scale(2)}to{opacity:1;transform:translateX(-50%) rotate(-8deg) scale(1)}}`));

  const isMeme = c => c.sector === 'Crypto' && c.tier === 'spec';
  function check(tk) {
    const G = S(), c = G?.companies[tk], h = G?.player.holdings[tk];
    if (!G || !c || c.status !== 'active') return { ok: false };
    if (G.mode) return { ok: false, why: 'Rug pulls are for your career game only.' };
    if (!h?.shares) return { ok: false, why: `Buy some ${tk} first. You cannot pull a rug you are not standing on.` };
    const share = h.shares / c.shares, meme = isMeme(c);
    if (!meme && share < 0.05) return { ok: false, why: `You own ${(share * 100).toFixed(2)}% of ${c.name}. You need 5% to rug a real company (any amount works on a meme coin).` };
    const crash = meme ? Math.min(0.9, 0.6 + share * 3) : 0.4;
    return { ok: true, c, h, crash, value: Math.round(h.shares * c.price * 100) };
  }
  async function pull(tk) {
    const r = check(tk); if (!r.ok) return;
    if (!confirm(`Rug pull ${tk}? You sell every share (about ${usd(r.value)}), the price crashes about ${Math.round(r.crash * 100)}% for everyone, and the Securities Commission will want a word.`)) return;
    const G = S(), sold = window.__mm.act('sell', tk, r.h.shares); if (!sold.ok) return alert(sold.error);
    G.impulses.push({ t: tk, rem: Math.log(1 - r.crash), left: 2, start: G.t });
    const I = (G.player.insider ||= { unlocked: false, tips: [], heat: 0, flagged: [], case: null, history: [], suspendedUntil: -1, bannedUntil: -1, lastTip: {}, ids: 0, met: ['dave'] });
    I.heat = (I.heat || 0) + 40;
    window.__mm.news({ cat: 'Markets', sev: 5, status: 'confirmed', tickers: [tk], source: 'Trading floor', head: `RUG PULL: ${r.c.name} collapses as its biggest holder dumps everything`, body: 'Holders woke up to a price chart that looks like a cliff. Regulators say they are looking into it.', impact: { co: {} } });
    window.__mm.save(); window.__mm.render();
    try { await window.__mm.push(); await fetch('/api/game?op=rugpull', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (localStorage.getItem('mm.token') || '') }, body: JSON.stringify({ ticker: tk, size: r.crash }) }); } catch { /* still crashes your own market */ }
    window.mmFx?.custom(() => {
      const root = el('div', { class: 'scn rug', role: 'dialog', 'aria-label': 'Rug pull' });
      const btn = el('button', {}, 'Run');
      root.append(el('div', { class: 'art' }, el('div', { class: 'ppl' }, '🙂🙂🙂🙂🙂'), el('div', { class: 'rugart' }), el('div', { class: 'stamp' }, 'RUG PULLED')),
        el('div', { class: 'panel' }, el('div', { class: 'kick' }, `$${tk} · ${r.c.name.toUpperCase()}`), el('div', { class: 'big' }, `You cashed out ${usd(sold.total ?? r.value)}`), el('div', { class: 'say' }, `Everyone else is holding ${tk} as it falls about ${Math.round(r.crash * 100)}%.`), el('div', { class: 'info' }, 'Insider heat +40. The Securities Commission has questions.'), btn));
      return { root, btn };
    });
  }
  function card(tk) {
    const r = check(tk), c = S()?.companies[tk]; if (!c) return null;
    return el('div', { id: 'mmrug', class: 'card' }, el('div', { style: 'display:flex;gap:12px;align-items:center;flex-wrap:wrap' },
      el('div', { style: 'flex:1;min-width:220px' }, el('b', {}, `🧶 Rug pull $${tk}`), el('div', { class: 'xs dim' }, r.ok ? `Dump all ${r.h.shares.toLocaleString('en-US')} shares (${usd(r.value)}) and crash it about ${Math.round(r.crash * 100)}% for every player. Illegal: insider heat +40.` : r.why)),
      el('button', { disabled: r.ok ? null : '', onclick: () => pull(tk) }, 'Pull the rug')));
  }
  function paint() {
    const m = /^#co-([A-Z]{2,5})/.exec(location.hash), main = document.getElementById('main'); if (!m || !main) return;
    const old = main.querySelector('#mmrug'), fresh = card(m[1]); if (!fresh) return;
    if (old) old.replaceWith(fresh); else { const h1 = main.querySelector('.ph') || main.firstElementChild; if (h1) h1.after(fresh); else main.prepend(fresh); }
  }
  new MutationObserver(() => { const main = document.getElementById('main'); if (main && /^#co-/.test(location.hash) && !main.querySelector('#mmrug')) paint(); }).observe(document.body, { childList: true, subtree: true });
  addEventListener('hashchange', paint); setInterval(() => { if (/^#co-/.test(location.hash)) paint(); }, 3000);
  window.mmRug = { pull, check };
})();
