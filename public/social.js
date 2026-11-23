// The players' feed: post about stocks, like, repost, comment, and edit or delete your own posts.
// A post that tags a stock as bullish or bearish (and every like or repost it gets) pushes that stock
// in other players' markets, through the same crowd flow as real trades.
(() => {
  'use strict';
  const token = () => { try { return localStorage.getItem('mm.token') || ''; } catch { return ''; } };
  async function api(op, body) {
    const r = await fetch('/api/game?op=' + op, { method: 'POST', headers: { 'content-type': 'application/json', ...(token() ? { authorization: 'Bearer ' + token() } : {}) }, body: JSON.stringify(body || {}) });
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
  const ago = d => { const m = (Date.now() - new Date(d)) / 6e4; return m < 1 ? 'now' : m < 60 ? Math.round(m) + 'm' : m < 1440 ? Math.round(m / 60) + 'h' : Math.round(m / 1440) + 'd'; };
  const face = (look, size) => { const d = el('span', { class: 'mmsf' }); try { d.innerHTML = (window.__mm?.avatar(look || {}, 80) || '').replace(/viewBox="[^"]*"/, 'viewBox="-58 -80 116 130"').replace(/width="[^"]*" height="[^"]*"/, `width="${size}" height="${size}"`); } catch { /* ignore */ } return d; };
  function bodyText(t) { // highlight $TICKERS
    const out = []; let last = 0;
    for (const m of t.matchAll(/\$[A-Z]{2,5}\b/g)) { out.push(t.slice(last, m.index), el('b', { class: 'tk' }, m[0])); last = m.index + m[0].length; }
    out.push(t.slice(last)); return out;
  }

  document.head.append(el('style', {}, `
  #mms-back{position:fixed;inset:0;background:rgba(5,8,14,.72);z-index:9000;display:none;align-items:flex-start;justify-content:center;padding:4vh 12px;overflow:auto}
  #mms-back.on{display:flex}
  #mms{width:min(560px,100%);background:var(--panel,#161a25);color:var(--text,#d1d4dc);border:1px solid var(--line2,#2f3545);border-radius:12px;font:14px/1.45 system-ui,sans-serif}
  #mms .hd{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--line,#232836)}#mms .hd b{flex:1;font-size:16px}
  #mms button{cursor:pointer;border:1px solid var(--line2,#2f3545);background:transparent;color:inherit;border-radius:8px;padding:5px 10px;font:inherit}
  #mms button.p{background:#2962ff;border-color:#2962ff;color:#fff}#mms button.on{border-color:#2962ff;background:#2962ff22}
  #mms textarea,#mms input,#mms select{width:100%;background:var(--bg,#0f121a);color:inherit;border:1px solid var(--line2,#2f3545);border-radius:8px;padding:8px 10px;font:inherit;resize:vertical;box-sizing:border-box}
  #mms .cmp{padding:12px 14px;border-bottom:1px solid var(--line,#232836);display:flex;flex-direction:column;gap:8px}
  #mms .row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
  #mms .post{padding:12px 14px;border-bottom:1px solid var(--line,#232836);display:flex;gap:10px}
  #mms .post .main{flex:1;min-width:0}#mms .nm{font-weight:700;cursor:pointer}#mms .mut{color:var(--mute,#8a8fa0);font-size:12px}
  #mms .txt{margin:3px 0 6px;white-space:pre-wrap;word-break:break-word}#mms .tk{color:#2962ff}
  #mms .acts{display:flex;gap:4px;flex-wrap:wrap}#mms .acts button{border:0;padding:3px 8px;color:var(--mute,#8a8fa0)}#mms .acts button.liked{color:#f23645}
  #mms .chip{display:inline-block;font:700 11px system-ui;border-radius:999px;padding:1px 8px;margin-left:6px}
  #mms .bull{background:#08998133;color:#22ab94}#mms .bear{background:#f2364533;color:#f7525f}
  #mms .rp{border:1px solid var(--line2,#2f3545);border-radius:10px;padding:8px 10px;margin:4px 0 6px}
  #mms .cm{margin-top:6px;padding:8px;background:var(--bg2,#131722);border-radius:8px}#mms .cm div{margin:2px 0}
  #mms .err{color:#f7525f;font-size:13px}.mmsf svg{display:block;border-radius:50%;background:#3a4155}`));
  const back = el('div', { id: 'mms-back' }), box = el('div', { id: 'mms', role: 'dialog', 'aria-label': 'Trader feed' });
  back.append(box); document.body.append(back);
  back.addEventListener('mousedown', e => { if (e.target === back) close(); });
  document.addEventListener('keydown', e => { if (back.classList.contains('on') && e.target.closest?.('#mms')) e.stopPropagation(); if (e.key === 'Escape' && back.classList.contains('on')) close(); }, true);

  let posts = [], err = '', stance = 0, openCm = {}, editing = null, draft = '', tick = '';
  const close = () => back.classList.remove('on');
  async function load() { try { posts = (await api('sfeed')).posts; err = ''; } catch (e) { err = e.message; } draw(); }
  async function act(op, body) { try { await api(op, body); err = ''; } catch (e) { err = e.message; } await load(); }

  function postEl(x) {
    const stanceChip = x.ticker && x.stance ? el('span', { class: 'chip ' + (x.stance > 0 ? 'bull' : 'bear') }, `${x.stance > 0 ? '🚀 Bullish' : '🔻 Bearish'} $${x.ticker}`) : null;
    const goOffice = n => () => { close(); location.hash = '#office-' + n; };
    const main = el('div', { class: 'main' },
      el('div', {}, el('span', { class: 'nm', onclick: goOffice(x.nickname) }, x.nickname), stanceChip, el('span', { class: 'mut' }, ' · ' + ago(x.at) + (x.edited ? ' · edited' : ''))));
    if (editing === x.id) {
      const ta = el('textarea', { rows: '3', maxlength: '280' }); ta.value = x.body;
      main.append(ta, el('div', { class: 'row', style: 'margin-top:6px' }, el('button', { class: 'p', onclick: () => { editing = null; act('post_edit', { id: x.id, body: ta.value }); } }, 'Save'), el('button', { onclick: () => { editing = null; draw(); } }, 'Cancel')));
    } else if (!(x.repost && x.body === '🔁')) main.append(el('div', { class: 'txt' }, bodyText(x.body)));
    if (x.repost) main.append(el('div', { class: 'rp' }, el('div', { class: 'mut' }, '🔁 reposted'), el('div', {}, el('span', { class: 'nm', onclick: goOffice(x.repost.nickname) }, x.repost.nickname), el('span', { class: 'mut' }, ' · ' + ago(x.repost.at))), el('div', { class: 'txt' }, bodyText(x.repost.body))));
    const target = x.repost || x;
    main.append(el('div', { class: 'acts' },
      el('button', { class: target.liked ? 'liked' : '', onclick: () => act('like', { id: target.id, on: !target.liked }), title: 'Like' }, `${target.liked ? '♥' : '♡'} ${target.likes}`),
      el('button', { onclick: () => act('repost', { id: target.id }), title: 'Repost', disabled: target.mine ? '' : null }, `🔁 ${target.reposts}`),
      el('button', { onclick: async () => { if (openCm[target.id]) { delete openCm[target.id]; return draw(); } openCm[target.id] = { list: null }; draw(); try { openCm[target.id].list = (await api('comments', { id: target.id })).comments; } catch (e) { openCm[target.id].list = []; err = e.message; } draw(); }, title: 'Comments' }, `💬 ${target.comments}`),
      x.mine && !x.repost ? el('button', { onclick: () => { editing = x.id; draw(); } }, '✏️ Edit') : null,
      x.mine ? el('button', { onclick: () => { if (confirm('Delete this post?')) act('post_delete', { id: x.id }); } }, '🗑') : null));
    const cm = openCm[target.id];
    if (cm) {
      const inp = el('input', { placeholder: 'Write a comment…', maxlength: '280' });
      const send = () => { const b = inp.value.trim(); if (!b) return; act('comment', { id: target.id, body: b }).then(async () => { openCm[target.id] = { list: (await api('comments', { id: target.id })).comments }; draw(); }); };
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
      main.append(el('div', { class: 'cm' }, ...(cm.list == null ? [el('div', { class: 'mut' }, 'Loading…')] : cm.list.length ? cm.list.map(c => el('div', {}, el('b', {}, c.nickname + ' '), c.body, el('span', { class: 'mut' }, ' · ' + ago(c.at)))) : [el('div', { class: 'mut' }, 'No comments yet.')]),
        el('div', { class: 'row', style: 'margin-top:6px' }, el('div', { style: 'flex:1' }, inp), el('button', { class: 'p', onclick: send }, 'Reply'))));
    }
    return el('div', { class: 'post' }, face(x.avatar, 40), main);
  }
  function draw() {
    if (!token()) return box.replaceChildren(el('div', { class: 'hd' }, el('b', {}, '📣 Trader feed'), el('button', { onclick: close }, '×')), el('div', { class: 'cmp' }, 'Sign in from the Menu to see and write posts.'));
    const ta = el('textarea', { rows: '3', maxlength: '280', placeholder: 'What are you buying? Tag a stock like $WOOF…' }); ta.value = draft;
    ta.addEventListener('input', () => { draft = ta.value; const m = ta.value.match(/\$([A-Z]{2,5})\b/); if (m && !tick) { tick = m[1]; } });
    const tk = el('input', { placeholder: 'Stock (optional)', maxlength: '5', style: 'width:110px', value: tick }); tk.addEventListener('input', () => { tick = tk.value.toUpperCase().replace(/[^A-Z]/g, ''); });
    const seg = (v, label) => el('button', { class: stance === v ? 'on' : '', onclick: () => { stance = v; draw(); } }, label);
    box.replaceChildren(
      el('div', { class: 'hd' }, el('b', {}, '📣 Trader feed'), el('button', { onclick: load, title: 'Refresh' }, '↻'), el('button', { onclick: close, 'aria-label': 'Close' }, '×')),
      el('div', { class: 'cmp' }, ta, el('div', { class: 'row' }, tk, seg(1, '🚀 Bullish'), seg(-1, '🔻 Bearish'), seg(0, 'Just talking'), el('span', { style: 'flex:1' }),
        el('button', { class: 'p', onclick: async () => { const b = draft.trim(); if (!b) return; try { await api('post', { body: b, ticker: tick, stance }); draft = ''; tick = ''; stance = 0; err = ''; } catch (e) { err = e.message; } load(); } }, 'Post')),
        el('div', { class: 'mut' }, 'A bullish or bearish post about a stock pushes its price in other players\' markets. Every like and repost pushes harder.'),
        err ? el('div', { class: 'err' }, err) : null),
      ...(posts.length ? posts.map(postEl) : [el('div', { class: 'cmp mut' }, 'Nobody has posted yet. Be first.')]));
  }
  function open() { back.classList.add('on'); draw(); load(); }
  window.mmSocial = { open };
  document.addEventListener('click', e => { const t = e.target.closest('[data-act="feed"]'); if (t) { e.preventDefault(); open(); } });
  setInterval(() => { if (back.classList.contains('on') && document.visibilityState === 'visible' && editing == null && !document.activeElement?.closest?.('#mms')) load(); }, 30000);
})();
