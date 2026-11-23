// Player-to-player messages. Opens from the 💬 button, or "Message" on a trader's office page.
(() => {
  'use strict';
  const token = () => { try { return localStorage.getItem('mm.token') || ''; } catch { return ''; } };
  async function api(op, body, get) {
    const r = await fetch('/api/game?op=' + op + (get ? '&' + new URLSearchParams(body || {}) : ''), {
      method: get ? 'GET' : 'POST', headers: { 'content-type': 'application/json', ...(token() ? { authorization: 'Bearer ' + token() } : {}) },
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
  const ago = d => { const m = (Date.now() - new Date(d)) / 6e4; return m < 1 ? 'now' : m < 60 ? Math.round(m) + 'm' : m < 1440 ? Math.round(m / 60) + 'h' : Math.round(m / 1440) + 'd'; };

  document.head.append(el('style', {}, `
  #mmm-back{position:fixed;inset:0;background:rgba(5,8,14,.72);z-index:9000;display:none;align-items:flex-start;justify-content:center;padding:6vh 12px;overflow:auto}
  #mmm-back.on{display:flex}
  #mmm{width:min(480px,100%);height:min(620px,84vh);display:flex;flex-direction:column;background:var(--panel,#161a25);color:var(--text,#d1d4dc);border:1px solid var(--line2,#2f3545);border-radius:12px;font:14px/1.45 system-ui,sans-serif;overflow:hidden}
  #mmm .hd{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--line,#232836)}#mmm .hd b{flex:1;font-size:16px}
  #mmm button{cursor:pointer;border:1px solid var(--line2,#2f3545);background:transparent;color:inherit;border-radius:8px;padding:6px 12px;font:inherit}
  #mmm button.p{background:#2962ff;border-color:#2962ff;color:#fff}
  #mmm .body{flex:1;overflow:auto;padding:10px 14px}
  #mmm .conv{display:flex;gap:10px;align-items:center;padding:9px 6px;border-bottom:1px solid var(--line,#232836);cursor:pointer;border-radius:8px}#mmm .conv:hover{background:var(--panel2,#1f2430)}
  #mmm .conv .n{font-weight:600}#mmm .conv .l{color:var(--mute,#8a8fa0);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px}
  #mmm .dot{background:#2962ff;color:#fff;border-radius:999px;font:700 11px system-ui;padding:1px 7px;margin-left:auto}
  #mmm .bub{max-width:78%;padding:8px 11px;border-radius:14px;margin:4px 0;white-space:pre-wrap;word-break:break-word}
  #mmm .bub.me{margin-left:auto;background:#2962ff;color:#fff;border-bottom-right-radius:4px}#mmm .bub.them{background:var(--panel3,#2a2e39);border-bottom-left-radius:4px}
  #mmm .t{font-size:10px;opacity:.7;margin-top:2px}
  #mmm .ft{display:flex;gap:8px;padding:10px 14px;border-top:1px solid var(--line,#232836)}
  #mmm input,#mmm textarea{flex:1;min-width:0;background:var(--bg,#0f121a);color:inherit;border:1px solid var(--line2,#2f3545);border-radius:8px;padding:8px 10px;font:inherit;resize:none}
  #mmm .err{color:#f7525f;font-size:13px;padding:0 14px 8px}#mmm .mut{color:var(--mute,#8a8fa0);font-size:12px}
  [data-act="msgs"]{position:relative}`));
  const badgeCss = el('style', {}); document.head.append(badgeCss);

  const back = el('div', { id: 'mmm-back' }), box = el('div', { id: 'mmm', role: 'dialog', 'aria-label': 'Messages' });
  back.append(box); document.body.append(back);
  back.addEventListener('mousedown', e => { if (e.target === back) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && back.classList.contains('on')) { close(); e.stopPropagation(); } }, true);

  let view = 'list', withNick = '', rows = [], thread = null, err = '', unread = 0;
  const close = () => { back.classList.remove('on'); view = 'list'; };

  function setUnread(n) {
    unread = n;
    badgeCss.textContent = n ? `[data-act="msgs"]::after{content:"${Math.min(n, 99)}";position:absolute;top:0;right:0;background:#f23645;color:#fff;border-radius:999px;font:700 10px system-ui;padding:0 5px;line-height:15px}` : '';
  }
  function drawList() {
    const nick = el('input', { placeholder: 'Message a trader by username', maxlength: '16' });
    box.replaceChildren(
      el('div', { class: 'hd' }, el('b', {}, '💬 Messages'), el('button', { 'aria-label': 'Close', onclick: close }, '×')),
      el('div', { class: 'ft', style: 'border-top:0;border-bottom:1px solid var(--line,#232836)' }, nick, el('button', { class: 'p', onclick: () => { const n = nick.value.trim(); if (n) openThread(n); } }, 'Open')),
      err ? el('div', { class: 'err', style: 'padding-top:8px' }, err) : null,
      el('div', { class: 'body' }, ...(rows.length ? rows.map(r => el('div', { class: 'conv', onclick: () => openThread(r.nickname) },
        el('div', { style: 'min-width:0' }, el('div', { class: 'n' }, r.nickname), el('div', { class: 'l' }, (r.mine ? 'You: ' : '') + r.last)),
        r.unread ? el('span', { class: 'dot' }, r.unread) : el('span', { class: 'mut', style: 'margin-left:auto' }, ago(r.at)))) : [el('div', { class: 'mut' }, 'No messages yet. Type a username above, or open a trader from the leaderboard and press Message.')])));
  }
  function drawThread() {
    const input = el('textarea', { rows: '2', maxlength: '500', placeholder: 'Write a message…' });
    const send = async () => {
      const text = input.value.trim(); if (!text) return; input.disabled = true;
      try { await api('send', { nick: withNick, text }); input.value = ''; err = ''; await loadThread(); } catch (e) { err = e.message; drawThread(); }
    };
    input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    const body = el('div', { class: 'body' }, ...(thread?.messages?.length ? thread.messages.map(m => el('div', { class: 'bub ' + (m.mine ? 'me' : 'them') }, m.body, el('div', { class: 't' }, ago(m.at)))) : [el('div', { class: 'mut' }, thread ? 'Say hello to ' + thread.nickname + '.' : 'Loading…')]));
    box.replaceChildren(
      el('div', { class: 'hd' }, el('button', { onclick: () => { view = 'list'; err = ''; loadList(); } }, '‹'), el('b', {}, thread?.nickname || withNick), el('button', { 'aria-label': 'Close', onclick: close }, '×')),
      body, err ? el('div', { class: 'err' }, err) : null, el('div', { class: 'ft' }, input, el('button', { class: 'p', onclick: send }, 'Send')));
    body.scrollTop = body.scrollHeight; setTimeout(() => input.focus(), 0);
  }
  async function loadList() { try { const r = await api('inbox'); rows = r.rows; setUnread(r.unread); } catch (e) { err = e.message; } if (view === 'list' && back.classList.contains('on')) drawList(); }
  async function loadThread() { try { thread = await api('thread', { nick: withNick }); withNick = thread.nickname; err = ''; } catch (e) { err = e.message; thread = null; view = 'list'; return drawList(); } if (view === 'thread') drawThread(); loadList(); }
  function openThread(nick) { view = 'thread'; withNick = nick; thread = null; err = ''; drawThread(); loadThread(); }
  function open(nick) {
    if (!token()) { back.classList.add('on'); box.replaceChildren(el('div', { class: 'hd' }, el('b', {}, '💬 Messages'), el('button', { onclick: close }, '×')), el('div', { class: 'body' }, 'Sign in from the Menu to message other traders.')); return; }
    back.classList.add('on'); err = '';
    if (nick) openThread(nick); else { view = 'list'; drawList(); loadList(); }
  }
  window.mmMsgs = { open };
  document.addEventListener('click', e => { const t = e.target.closest('[data-act="msgs"],[data-act="msg-new"]'); if (!t) return; e.preventDefault(); open(t.dataset.act === 'msg-new' ? t.dataset.nick : ''); });

  // new message alerts
  let lastUnread = null;
  async function poll() {
    if (!token() || document.visibilityState !== 'visible') return;
    try {
      const r = await api('inbox'); rows = r.rows; setUnread(r.unread);
      if (lastUnread != null && r.unread > lastUnread) { const who = r.rows.find(x => x.unread); toast('💬 New message' + (who ? ' from ' + who.nickname : '')); }
      lastUnread = r.unread;
      if (back.classList.contains('on')) { if (view === 'thread') loadThread(); else drawList(); }
    } catch { /* offline */ }
  }
  function toast(msg) {
    const t = el('div', { style: 'position:fixed;right:14px;bottom:120px;z-index:9100;background:#161a25;color:#fff;border:1px solid #2962ff;border-radius:10px;padding:10px 14px;font:14px system-ui;cursor:pointer;max-width:300px', onclick: () => { t.remove(); open(); } }, msg + ' (tap to read)');
    document.body.append(t); setTimeout(() => t.remove(), 12000);
  }
  setInterval(poll, 20000); setTimeout(poll, 2500);
})();
