// 1v1 duels panel. Lives outside the game's own renderer so it never gets wiped by a redraw.
// Talks to /api/game (duels, duel_create, duel_accept, duel_decline) and starts a duel run through window.__mm.startDuel.
(() => {
  'use strict';
  const token = () => { try { return localStorage.getItem('mm.token') || ''; } catch { return ''; } };
  const me = () => { try { return localStorage.getItem('mm.nick') || ''; } catch { return ''; } };
  async function api(op, body, get) {
    const r = await fetch('/api/game?op=' + op + (get ? '&' + new URLSearchParams(body || {}) : ''), {
      method: get ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', ...(token() ? { authorization: 'Bearer ' + token() } : {}) },
      body: get ? undefined : JSON.stringify(body || {}),
    });
    const j = await r.json().catch(() => ({ error: 'The server sent something odd.' }));
    if (!r.ok) throw Object.assign(new Error(j.error || 'Request failed'), j);
    return j;
  }
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) if (v == null || v === false) continue; else k === 'class' ? (n.className = v) : k.startsWith('on') ? n.addEventListener(k.slice(2), v) : k === 'style' ? (n.style.cssText = v) : n.setAttribute(k, v);
    for (const c of kids.flat()) if (c != null) n.append(c.nodeType ? c : document.createTextNode(String(c)));
    return n;
  };
  const pct = r => (r >= 0 ? '+' : '') + (r * 100).toFixed(1) + '%';

  const css = el('style', {}, `
  #mmd-back{position:fixed;inset:0;background:rgba(5,8,14,.72);z-index:9000;display:none;align-items:flex-start;justify-content:center;padding:6vh 12px;overflow:auto}
  #mmd-back.on{display:flex}
  #mmd{width:min(520px,100%);background:var(--panel,#161a25);color:var(--text,#d1d4dc);border:1px solid var(--line2,#2f3545);border-radius:12px;padding:16px;font:14px/1.45 system-ui,sans-serif}
  #mmd h2{margin:0 0 4px;font-size:18px}#mmd .sub{color:var(--mute,#8a8fa0);font-size:12px;margin-bottom:12px}
  #mmd .row{display:flex;gap:8px;margin-bottom:12px;height:auto;cursor:auto;border-left:0}
  #mmd input{flex:1;min-width:0;background:var(--bg,#0f121a);color:inherit;border:1px solid var(--line2,#2f3545);border-radius:8px;padding:8px 10px;font:inherit}
  #mmd button{cursor:pointer;border:1px solid var(--line2,#2f3545);background:transparent;color:inherit;border-radius:8px;padding:7px 12px;font:inherit}
  #mmd button.p{background:#2962ff;border-color:#2962ff;color:#fff}#mmd button.g{background:#089981;border-color:#089981;color:#fff}
  #mmd button:disabled{opacity:.5;cursor:default}
  #mmd .mmc{border:1px solid var(--line,#232836);border-radius:10px;padding:10px 12px;margin-bottom:8px;background:var(--bg2,#131722)}
  #mmd .mmt{display:flex;justify-content:space-between;align-items:center;gap:8px}
  #mmd .vs{font-weight:600}#mmd .mut{color:var(--mute,#8a8fa0);font-size:12px}
  #mmd .win{color:#22ab94}#mmd .lose{color:#f7525f}#mmd .acts{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
  #mmd .err{color:#f7525f;font-size:13px;margin:-6px 0 10px}
  #mmd .x{border:0;font-size:20px;padding:0 6px}`);
  document.head.append(css);

  const back = el('div', { id: 'mmd-back' });
  const box = el('div', { id: 'mmd', role: 'dialog', 'aria-label': '1v1 duels' });
  back.append(box); document.body.append(back);
  back.addEventListener('mousedown', e => { if (e.target === back) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && back.classList.contains('on')) close(); });

  let duels = [], chals = [], err = '', busy = false;
  const close = () => back.classList.remove('on');

  async function load() {
    if (!token()) { duels = []; return; }
    try { [duels, chals] = await Promise.all([api('duels').then(r => r.duels), api('challenges').then(r => r.challenges).catch(() => [])]); } catch (e) { err = e.message; }
  }
  async function act(op, body, after) {
    if (busy) return; busy = true; err = ''; draw();
    try { await api(op, body); await load(); after?.(); } catch (e) { err = e.message; }
    busy = false; draw();
  }

  function card(d) {
    const oppRet = d.opp.ret != null, meRet = d.me.ret != null;
    let status, acts = [];
    if (d.status === 'pending') {
      if (d.mine) { status = 'Waiting for ' + d.opponent + ' to accept'; acts.push(el('button', { onclick: () => act('duel_decline', { id: d.id }) }, 'Cancel')); }
      else { status = d.opponent + ' challenged you'; acts.push(el('button', { class: 'g', onclick: () => act('duel_accept', { id: d.id }) }, 'Accept'), el('button', { onclick: () => act('duel_decline', { id: d.id }) }, 'Decline')); }
    } else if (d.status === 'active') {
      if (d.winner) status = d.winner === 'draw' ? 'Draw' : d.winner === 'me' ? 'You won' : 'You lost' + (d.result === 'forfeit' ? '' : '');
      else if (d.me.state === 'done') status = 'You finished. Waiting for ' + d.opponent;
      else if (d.me.state === 'void') status = 'Your run was not accepted';
      else { status = d.me.state === 'playing' ? 'Your run is in progress' : 'Ready to play'; acts.push(el('button', { class: 'p', onclick: () => { if (!window.__mm?.startDuel) return; close(); window.__mm.startDuel(d.id); } }, d.me.state === 'playing' ? 'Resume' : 'Play now')); }
    } else status = d.status === 'declined' ? 'Declined' : 'Cancelled';
    const line = (label, v, win) => el('span', { class: win == null ? '' : win ? 'win' : 'lose' }, label + ' ' + (v != null ? pct(v) : '–'));
    const bothDone = d.winner && d.result === 'done';
    return el('div', { class: 'mmc' },
      el('div', { class: 'mmt' }, el('span', { class: 'vs' }, 'You vs ' + d.opponent),
        el('span', { class: 'mut' }, d.winner === 'me' ? '🏆' : d.winner === 'opp' ? '' : '')),
      el('div', { class: 'mut' }, status),
      bothDone ? el('div', { style: 'margin-top:6px;display:flex;gap:14px' }, line('You', d.me.ret, d.winner === 'draw' ? null : d.winner === 'me'), line(d.opponent, d.opp.ret, d.winner === 'draw' ? null : d.winner === 'opp')) : null,
      d.result === 'forfeit' ? el('div', { class: 'mut' }, 'Decided by forfeit.') : null,
      acts.length ? el('div', { class: 'acts' }, acts) : null);
  }

  const usd = c => '$' + Math.round(c / 100).toLocaleString('en-US');
  function chalCard(c) {
    const mine = c.rows.find(r => r.me) || { state: 'waiting' }, least = c.goal === 'least';
    const btn = mine.state === 'waiting' || mine.state === 'playing'
      ? el('button', { class: 'p', onclick: () => { if (!window.__mm?.startChallenge) return; close(); window.__mm.startChallenge(c.id); } }, mine.state === 'playing' ? 'Resume' : 'Play now') : null;
    return el('div', { class: 'mmc', style: 'border-color:#f7a60066' },
      el('div', { class: 'mmt' }, el('span', { class: 'vs' }, '⚡ ' + c.title), el('span', { class: 'mut' }, c.days + ' game day' + (c.days === 1 ? '' : 's'))),
      el('div', { class: 'mut' }, `Start with ${usd(c.startCash)}. ${least ? 'Finish with the LEAST money to win.' : 'Finish with the MOST money to win.'}${c.prize ? ' Prize: ' + usd(c.prize) + '.' : ''}`),
      el('div', { style: 'margin-top:6px;font-size:13px' }, ...c.rows.slice(0, 6).map((r, i) => el('div', { style: 'display:flex;justify-content:space-between;gap:8px' + (r.me ? ';font-weight:700' : '') },
        el('span', {}, (r.nw != null ? '#' + (i + 1) + ' ' : '') + r.nickname + (r.me ? ' (you)' : '')),
        el('span', { class: 'mut' }, r.nw != null ? usd(r.nw) : r.state === 'playing' ? 'playing' : r.state === 'void' ? 'not accepted' : 'not started')))),
      btn ? el('div', { class: 'acts' }, btn) : el('div', { class: 'mut', style: 'margin-top:6px' }, mine.state === 'done' ? 'Your run is in. Results are final when the Market God ends the challenge.' : ''));
  }

  let nickInput;
  function draw() {
    const signed = !!token();
    const list = el('datalist', { id: 'mmd-list' });
    box.replaceChildren(...[
      el('div', { class: 'mmt' }, el('h2', {}, '⚔ 1v1 duels'), el('button', { class: 'x', 'aria-label': 'Close', onclick: close }, '×')),
      el('div', { class: 'sub' }, 'Challenge another trader. You both get the same market, the same prices and the same $10,000 for 24 game days. Whoever finishes with the higher % return wins.'),
      signed ? el('div', { class: 'row' },
        (nickInput = el('input', { placeholder: 'Their username', list: 'mmd-list', maxlength: '16', autocomplete: 'off', value: nickInput?.value || '' })), list,
        el('button', { class: 'p', disabled: busy ? '' : null, onclick: () => { const nick = nickInput.value.trim(); if (!nick) return; act('duel_create', { nick }, () => { nickInput.value = ''; }); } }, 'Challenge'))
        : el('div', { class: 'mmc' }, 'Sign in from the Menu to challenge other traders.'),
      err ? el('div', { class: 'err' }, err) : null,
      ...(signed && chals.length ? [el('div', { class: 'vs', style: 'margin:4px 0 8px' }, '⚡ Market God challenges'), ...chals.map(chalCard), el('div', { class: 'vs', style: 'margin:14px 0 8px' }, '⚔ Your duels')] : []),
      ...(signed ? (duels.length ? duels.map(card) : [el('div', { class: 'mut' }, 'No duels yet. Type a username above, or open a trader from the leaderboard and press Challenge.')]) : []),
    ].filter(Boolean));
    if (signed && !draw.names) { draw.names = []; api('players', {}, true).then(r => { draw.names = r.rows.map(x => x.nickname).filter(n => n.toLowerCase() !== me().toLowerCase()); const l = document.getElementById('mmd-list'); if (l) l.replaceChildren(...draw.names.map(n => el('option', { value: n }))); }).catch(() => {}); }
    else if (draw.names) list.replaceChildren(...draw.names.map(n => el('option', { value: n })));
  }

  async function open(nick) {
    err = ''; back.classList.add('on'); draw(); await load(); draw();
    if (nick && nickInput) { nickInput.value = nick; nickInput.focus(); }
  }
  window.mmDuels = { open };

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-act="duels"],[data-act="duel-new"]'); if (!t) return;
    e.preventDefault(); open(t.dataset.act === 'duel-new' ? t.dataset.nick : '');
  });

  // tell the player when someone challenges them
  let known = null;
  async function poll() {
    if (!token() || document.visibilityState !== 'visible') return;
    try {
      const cs = await api('challenges').then(r => r.challenges).catch(() => []);
      for (const c of cs) if (!known?.has('c' + c.id) && (c.rows.find(r => r.me) || {}).state === 'waiting') toast('⚡ The Market God has a challenge for you: ' + c.title);
      chals = cs;
      const ds = (await api('duels')).duels, inc = new Set(ds.filter(d => d.status === 'pending' && !d.mine).map(d => d.id));
      if (known) for (const d of ds) if (inc.has(d.id) && !known.has(d.id)) toast('⚔ ' + d.opponent + ' challenged you to a 1v1');
      for (const d of ds) if (known && d.status === 'active' && d.mine && !known.has('a' + d.id) && d.me.state === 'waiting') toast('⚔ ' + d.opponent + ' accepted your duel');
      known = new Set([...inc, ...ds.filter(d => d.status === 'active').map(d => 'a' + d.id), ...cs.map(c => 'c' + c.id)]);
      duels = ds; if (back.classList.contains('on')) draw();
    } catch { /* offline or signed out */ }
  }
  function toast(msg) {
    const t = el('div', { style: 'position:fixed;right:14px;bottom:70px;z-index:9100;background:#161a25;color:#fff;border:1px solid #2962ff;border-radius:10px;padding:10px 14px;font:14px system-ui;cursor:pointer;max-width:300px', onclick: () => { t.remove(); open(); } }, msg + ' (tap to open)');
    document.body.append(t); setTimeout(() => t.remove(), 12000);
  }
  setInterval(poll, 30000); setTimeout(poll, 3000);
})();
