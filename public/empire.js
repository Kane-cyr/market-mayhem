// Company buyouts (career game only). With $100 million of net worth you can sit down with a company's
// owner, haggle over a premium to its market value, and take it private. Owned companies pay you their
// profits every game day (or cost you their losses) and add their value to your net worth.
// Ranked runs, duels and challenges never use this, so the server's score checks are unaffected.
(() => {
  'use strict';
  const MIN_NW = 1e10; // $100,000,000 in cents
  const S = () => window.__mm?.G?.S;
  const career = () => S() && !S().mode;
  const usd = c => '$' + Math.round(c / 100).toLocaleString('en-US');
  const h = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) if (v == null || v === false) continue; else k === 'class' ? (n.className = v) : k.startsWith('on') ? n.addEventListener(k.slice(2), v) : k === 'style' ? (n.style.cssText = v) : n.setAttribute(k, v);
    for (const c of kids.flat()) if (c != null) n.append(c.nodeType ? c : document.createTextNode(String(c)));
    return n;
  };
  const hash = str => { let x = 2166136261; for (const ch of str) x = Math.imul(x ^ ch.charCodeAt(0), 16777619); return x >>> 0; };
  const FIRST = ['Margaret', 'Viktor', 'Henrietta', 'Rufus', 'Ingrid', 'Desmond', 'Priya', 'Otto', 'Celeste', 'Barnaby', 'Lucinda', 'Ezra'];
  const LAST = ['Vane', 'Okafor', 'Lindqvist', 'Montague', 'Sato', 'Blackwood', 'Moreau', 'Castellano', 'Hargreaves', 'Quint', 'Achterberg', 'Delacroix'];
  function owner(tk) {
    const x = hash(tk);
    return { name: `${FIRST[x % FIRST.length]} ${LAST[(x >>> 5) % LAST.length]}`,
      look: { skin: x % 6, hair: (x >>> 3) % 8, hairCol: (x >>> 6) % 8, shirt: (x >>> 9) % 10, eyes: (x >>> 12) % 3, beard: (x >>> 14) % 4, hat: (x >>> 16) % 7 === 0 ? 1 : 0, acc: (x >>> 18) % 5, mouth: (x >>> 21) % 4, pants: (x >>> 23) % 6 } };
  }
  const value = c => Math.round(c.price * c.shares * 100);
  const coValue = o => Math.max(Math.round(o.paid * 0.3), Math.round(o.rev * Math.max(o.margin, 0) * 15 * 100));
  const talks = () => (S().player.talks ||= {});
  const empire = () => (S().player.empire ||= []);
  const refreshValue = () => { const p = S().player; p.empireValue = (p.empire || []).reduce((a, o) => a + coValue(o), 0); };

  // ----- daily profits (called by the game at the start of each career day) -----
  function daily(G) {
    const p = G.player; if (!p.empire?.length) return;
    let day = 0;
    for (const o of p.empire) {
      const profit = Math.round(o.rev * o.margin / 360 * 100);
      const take = profit >= 0 ? profit : -Math.min(p.cash, -profit);
      p.cash += take; o.earned = (o.earned || 0) + take; day += take;
      o.rev *= 1 + o.growth / 360; o.growth = o.growth * 0.999 + 0.00004; o.margin = Math.max(-1, Math.min(0.6, o.margin + (Math.random() - 0.5) * 0.002));
    }
    p.empireWeek = (p.empireWeek || 0) + day; p.empireDays = (p.empireDays || 0) + 1;
    if (p.empireDays >= 6) { p.notifications.push({ t: G.t, kind: p.empireWeek >= 0 ? 'fill' : 'warn', text: `Your companies ${p.empireWeek >= 0 ? 'made' : 'lost'} ${usd(Math.abs(p.empireWeek))} this week.` }); p.empireWeek = 0; p.empireDays = 0; }
    p.empireValue = p.empire.reduce((a, o) => a + coValue(o), 0);
  }

  // ----- negotiating -----
  function offer(tk, premium) {
    const G = S(), p = G.player, c = G.companies[tk];
    if (!career()) return { error: 'Buying companies is for your career game only.' };
    if (!c || c.status !== 'active') return { error: 'That company is not trading.' };
    if (window.__mm.nw().total < MIN_NW) return { error: 'You need a net worth of $100,000,000 to buy a company.' };
    const T = talks(), t = (T[tk] ||= { ask: 0.15 + Math.random() * 0.45, rounds: 0, until: -1 });
    if (t.until > G.t) return { error: `${owner(tk).name} will not take your calls for a few more days.` };
    const amount = Math.round(value(c) * (1 + premium));
    if (amount > p.cash) return { error: `You need ${usd(amount)} in cash to make that offer. You have ${usd(p.cash)}.` };
    const o = owner(tk), name = o.name.split(' ')[0];
    if (premium >= t.ask - 1e-9) {
      p.cash -= amount;
      window.__mm.delist(tk, 'acquired', amount / 100 / c.shares);
      empire().push({ tk, name: c.name, sector: c.sector, paid: amount, t: G.t, rev: c.revenue, margin: c.margin, growth: c.growth, earned: 0, owner: o.name });
      delete T[tk]; refreshValue();
      p.log.push({ type: 'acquire', t: G.t, ticker: tk, total: amount }); if (p.log.length > 600) p.log.shift();
      window.__mm.news({ cat: 'Deals', sev: 5, status: 'confirmed', tickers: [tk], source: 'Market wire', head: `${c.name} agrees to be taken private in a ${usd(amount)} deal`, body: `${o.name} sold the company at a ${(premium * 100).toFixed(0)}% premium. Shareholders are paid out and the stock stops trading.`, impact: { co: {} } });
      window.__mm.save(); window.__mm.render();
      return { outcome: 'accept', line: `${name}: “Fine. It is yours. Look after my people.”`, amount };
    }
    t.rounds++;
    const gap = t.ask - premium;
    if (t.rounds >= 3) { t.until = G.t + 60; t.rounds = 0; t.ask += 0.05; window.__mm.save(); return { outcome: 'walk', line: `${name}: “We are done here. Call me in ten days, if you have learned some manners.”` }; }
    if (gap > 0.15) { t.ask += 0.03; window.__mm.save(); return { outcome: 'insult', line: `${name}: “Is that a joke? I would not sell my parking space for that.”`, ask: t.ask }; }
    t.ask = Math.max(premium + 0.01, t.ask - gap * 0.5); window.__mm.save();
    return { outcome: 'counter', line: `${name}: “Closer. Make it a ${(t.ask * 100).toFixed(0)}% premium and we can shake hands.”`, ask: t.ask };
  }
  function sell(i) {
    const G = S(), p = G.player, o = p.empire?.[i]; if (!o || !career()) return;
    const price = Math.round(coValue(o) * (0.85 + Math.random() * 0.3));
    p.cash += price; p.empire.splice(i, 1); refreshValue();
    p.log.push({ type: 'divest', t: G.t, ticker: o.tk, total: price }); if (p.log.length > 600) p.log.shift();
    p.notifications.push({ t: G.t, kind: 'fill', text: `You sold ${o.name} for ${usd(price)}.` });
    window.__mm.save(); window.__mm.render(); return price;
  }

  // ----- the boardroom scene -----
  const css = h('style', {}, `
  #mme-back{position:fixed;inset:0;background:rgba(5,8,14,.75);z-index:9000;display:none;align-items:flex-start;justify-content:center;padding:5vh 12px;overflow:auto}
  #mme-back.on{display:flex}
  #mme{width:min(620px,100%);background:var(--panel,#161a25);color:var(--text,#d1d4dc);border:1px solid var(--line2,#2f3545);border-radius:12px;padding:16px;font:14px/1.45 system-ui,sans-serif}
  #mme h2{margin:0;font-size:18px;flex:1}#mme .mut{color:var(--mute,#8a8fa0);font-size:12px}
  #mme button{cursor:pointer;border:1px solid var(--line2,#2f3545);background:transparent;color:inherit;border-radius:8px;padding:7px 12px;font:inherit}
  #mme button.p{background:#2962ff;border-color:#2962ff;color:#fff}#mme button:disabled{opacity:.5;cursor:default}
  #mme .card{border:1px solid var(--line,#232836);border-radius:10px;padding:10px 12px;margin:10px 0;background:var(--bg2,#131722)}
  #mme select,#mme input[type=range]{width:100%}#mme select{background:var(--bg,#0f121a);color:inherit;border:1px solid var(--line2,#2f3545);border-radius:8px;padding:8px}
  #mme .row{display:flex;justify-content:space-between;gap:8px;align-items:center}#mme .up{color:#22ab94}#mme .down{color:#f7525f}#mme .err{color:#f7525f}
  #mmb{position:fixed;inset:0;z-index:9500;background:linear-gradient(#2b1d14,#1a120c);display:flex;flex-direction:column;align-items:center;justify-content:flex-end;font-family:system-ui,sans-serif;color:#fff;animation:mmb-in .3s}
  @keyframes mmb-in{from{opacity:0}}
  #mmb .wall{position:absolute;inset:0 0 38% 0;background:repeating-linear-gradient(90deg,#3a2718 0 80px,#33221500 80px 84px),linear-gradient(#3a2718,#2a1c11)}
  #mmb .table{position:absolute;left:8%;right:8%;bottom:22%;height:16%;background:linear-gradient(#6b4426,#4a2e19);border-radius:50% 50% 8px 8px/40% 40% 8px 8px;box-shadow:0 20px 40px #0009}
  #mmb .own{position:absolute;bottom:30%;left:50%;transform:translateX(-50%);animation:mmb-sit .6s ease-out}
  @keyframes mmb-sit{from{transform:translate(-50%,40px);opacity:0}}
  #mmb .panel{position:relative;margin-bottom:3vh;width:min(640px,94vw);background:#0d0d12ee;border:1px solid #ffffff22;border-radius:14px;padding:16px 18px;display:flex;flex-direction:column;gap:10px}
  #mmb .who{font:800 12px system-ui;letter-spacing:.14em;color:#f7c948}#mmb .say{font:700 clamp(17px,2.6vw,22px)/1.35 Georgia,serif}
  #mmb .stamp{position:absolute;top:14%;left:50%;transform:translateX(-50%) rotate(-10deg) scale(2);opacity:0;font:900 clamp(40px,9vw,90px) Impact,system-ui;letter-spacing:.06em;border:8px solid;padding:0 24px;border-radius:12px;animation:mmb-stamp .35s .5s ease-in forwards}
  @keyframes mmb-stamp{to{transform:translateX(-50%) rotate(-10deg) scale(1);opacity:.92}}
  #mmb button{cursor:pointer;border:0;border-radius:10px;padding:12px 18px;font:700 15px system-ui;background:#2962ff;color:#fff;align-self:flex-end}`);
  document.head.append(css);

  function boardroom(tk, res) {
    const o = owner(tk), root = h('div', { id: 'mmb', role: 'dialog', 'aria-label': 'Negotiation' });
    const av = h('div', { class: 'own' }); av.innerHTML = window.__mm.avatar(o.look, 300);
    const stamp = { accept: ['SOLD', '#22ab94'], counter: ['COUNTER', '#f7c948'], insult: ['NO DEAL', '#f7525f'], walk: ['WALKED OUT', '#f7525f'] }[res.outcome];
    const btn = h('button', {}, res.outcome === 'accept' ? 'Shake hands' : 'Back to the table');
    root.append(h('div', { class: 'wall' }), av, h('div', { class: 'table' }), stamp ? h('div', { class: 'stamp', style: `color:${stamp[1]};border-color:${stamp[1]}` }, stamp[0]) : null,
      h('div', { class: 'panel' }, h('div', { class: 'who' }, `${o.name.toUpperCase()} · OWNER OF ${S().companies[tk]?.name?.toUpperCase() || tk}`), h('div', { class: 'say' }, res.line),
        res.outcome === 'accept' ? h('div', { style: 'color:#cfd2dc' }, `You paid ${usd(res.amount)}. It now pays you its profits every day.`) : null, btn));
    const u = window.__mm.ui, sp = u.speed; u.speed = 0;
    btn.onclick = () => { root.remove(); u.speed = sp; draw(); };
    document.body.append(root); btn.focus();
  }

  // ----- the panel -----
  const back = h('div', { id: 'mme-back' }), box = h('div', { id: 'mme', role: 'dialog', 'aria-label': 'Buy companies' });
  back.append(box); document.body.append(back);
  back.addEventListener('mousedown', e => { if (e.target === back) close(); });
  const close = () => back.classList.remove('on');
  let pick = '', prem = 0.2, err = '';

  function draw() {
    const G = S(); if (!G) return;
    const nw = window.__mm.nw().total, ok = career() && nw >= MIN_NW, list = empire();
    const head = h('div', { class: 'row' }, h('h2', {}, '🏢 Buy companies'), h('button', { onclick: close, 'aria-label': 'Close' }, '×'));
    if (!career()) return box.replaceChildren(head, h('p', {}, 'Company buyouts are for your career game. Head back to your career from the Menu.'));
    const mine = list.length ? h('div', { class: 'card' }, h('b', {}, 'Your companies'), ...list.map((o, i) => h('div', { class: 'row', style: 'margin-top:8px' },
      h('div', {}, h('div', {}, h('b', {}, o.name), ' ', h('span', { class: 'mut' }, o.tk)), h('div', { class: 'mut' }, `Paid ${usd(o.paid)} · worth about ${usd(coValue(o))} · makes ${o.margin >= 0 ? '' : '−'}${usd(Math.abs(o.rev * o.margin / 360 * 100))} a day · earned ${usd(o.earned || 0)} so far`)),
      h('button', { onclick: () => { if (confirm(`Sell ${o.name}? Buyers pay roughly what it is worth, give or take 15%.`)) { const got = sell(i); err = got ? `Sold for ${usd(got)}.` : ''; draw(); } } }, 'Sell')))) : null;
    if (!ok) return box.replaceChildren(head, h('p', {}, `Reach a net worth of ${usd(MIN_NW)} and company owners will start taking your calls. You are at ${usd(nw)}.`), h('p', { class: 'mut' }, 'Then pick any listed company, haggle over a premium to its market value, and take it private. It pays you its profits every game day.'), mine);
    const cos = G.order.map(t => G.companies[t]).filter(c => c?.status === 'active').sort((a, b) => value(a) - value(b));
    if (!pick || !G.companies[pick] || G.companies[pick].status !== 'active') pick = cos[0]?.ticker || '';
    const c = G.companies[pick], v = c ? value(c) : 0, amt = Math.round(v * (1 + prem)), o = c ? owner(pick) : null, t = talks()[pick];
    const sel = h('select', { onchange: e => { pick = e.target.value; err = ''; draw(); } }, ...cos.map(x => { const op = h('option', { value: x.ticker }, `${x.ticker} · ${x.name} · ${usd(value(x))}`); if (x.ticker === pick) op.selected = true; return op; }));
    const slider = h('input', { type: 'range', min: '0', max: '100', step: '1', value: String(Math.round(prem * 100)) });
    const amtEl = h('b', {}, usd(amt)), premEl = h('span', {}, `${Math.round(prem * 100)}%`);
    slider.oninput = () => { prem = Number(slider.value) / 100; premEl.textContent = `${slider.value}%`; amtEl.textContent = usd(Math.round(v * (1 + prem))); };
    const lastAsk = t && t.rounds > 0 ? h('div', { class: 'mut' }, `Last time they asked for about a ${(t.ask * 100).toFixed(0)}% premium.`) : null;
    box.replaceChildren(head, h('div', { class: 'mut', style: 'margin-top:4px' }, `Net worth ${usd(nw)} · cash ${usd(G.player.cash)}`), mine,
      h('div', { class: 'card' }, h('b', {}, 'Make an offer'), h('div', { style: 'margin:8px 0' }, sel),
        c ? h('div', { class: 'mut' }, `Owner: ${o.name}. Market value ${usd(v)}. Makes about ${usd(Math.abs(c.revenue * c.margin))} a year ${c.margin >= 0 ? 'in profit' : 'in losses'}.`) : null, lastAsk,
        h('div', { class: 'row', style: 'margin-top:10px' }, h('span', {}, 'Premium over market value'), premEl), slider,
        h('div', { class: 'row', style: 'margin-top:6px' }, h('span', {}, 'Your offer'), amtEl),
        err ? h('div', { class: err.startsWith('Sold') ? 'up' : 'err', style: 'margin-top:6px' }, err) : null,
        h('div', { style: 'margin-top:10px;display:flex;justify-content:flex-end' }, h('button', { class: 'p', disabled: c ? null : '', onclick: () => {
          const r = offer(pick, prem); if (r.error) { err = r.error; return draw(); } err = ''; close(); boardroom(pick, r); } }, 'Make the offer'))),
      h('div', { class: 'mut' }, 'Shareholders (including you) are paid out at your offer price and the stock stops trading. Your companies count toward your net worth.'));
  }
  function open() { back.classList.add('on'); err = ''; draw(); }
  window.mmEmpire = { open, daily, offer, sell };
  document.addEventListener('click', e => { const t = e.target.closest('[data-act="empire"]'); if (t) { e.preventDefault(); open(); } });
})();
