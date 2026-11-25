// The phone: messages with other players (with seen receipts, money, gifts and shared insider tips),
// plus contacts for the loan sharks, insiders and influencers, who text back.
(() => {
  'use strict';
  const token = () => { try { return localStorage.getItem('mm.token') || ''; } catch { return ''; } };
  const me = () => { try { return (localStorage.getItem('mm.nick') || '').toLowerCase(); } catch { return ''; } };
  const S = () => window.__mm?.G?.S;
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
  const usd = c => '$' + Math.round(c / 100).toLocaleString('en-US');

  // ----- contacts who text back -----
  const NPCS = [
    { id: 'vinnie', name: "Vinnie 'The Calculator'", group: 'Loan sharks', icon: '🦈', kind: 'shark' },
    { id: 'tony', name: 'Big Tony', group: 'Loan sharks', icon: '🦈', kind: 'shark' },
    { id: 'knuckles', name: 'Knuckles', group: 'Loan sharks', icon: '🦈', kind: 'shark' },
    { id: 'broker', name: 'Your broker', group: 'Loan sharks', icon: '💼', kind: 'shark' },
    { id: 'dave', name: 'Dodgy Dave', group: 'Insiders', icon: '🕵️', kind: 'insider' },
    { id: 'clerk', name: 'The Night Clerk', group: 'Insiders', icon: '🕵️', kind: 'insider' },
    { id: 'banker', name: 'Silvia Marrow', group: 'Insiders', icon: '🕵️', kind: 'insider' },
    { id: 'director', name: 'The Director', group: 'Insiders', icon: '🕵️', kind: 'insider' },
    { id: 'maya', name: 'Maya @MoonMathMaya', group: 'Influencers', icon: '📣', kind: 'infl', lines: ['omg yes. this is going to 10x. you are early. tell nobody (tell everybody)', 'Conviction > research. Are you buying or crying?', 'I only do collabs with people who HOLD.'] },
    { id: 'oracle', name: 'Harriet @OracleOfOak', group: 'Influencers', icon: '📣', kind: 'infl', lines: ['Patience, dear. The market rewards the bored.', 'I do not do hot tips. I do decades.', 'Buy good businesses. Then go outside.'] },
    { id: 'quant', name: 'Dr. Marchetti @QuietQuant', group: 'Influencers', icon: '📣', kind: 'infl', lines: ['Send data, not vibes.', 'Your Sharpe ratio called. It wants to talk.', 'Mean reversion is undefeated. So far.'] },
    { id: 'baron', name: 'Cornelius @BearBaron', group: 'Influencers', icon: '📣', kind: 'infl', lines: ['Everything is overvalued. Including your optimism.', 'Short it. Short all of it.', 'I have been bearish since before you were born and I will be right eventually.'] },
  ];
  const npcKey = id => `mm.npc.${me()}.${id}`;
  const npcLoad = id => { try { return JSON.parse(localStorage.getItem(npcKey(id)) || '[]'); } catch { return []; } };
  const npcSave = (id, list) => { try { localStorage.setItem(npcKey(id), JSON.stringify(list.slice(-60))); } catch { /* ignore */ } };
  function npcReply(n, text) {
    const G = S(); const t = text.toLowerCase(); const actions = [];
    if (!G) return { text: '…', actions };
    if (n.kind === 'shark') {
      const l = G.player.loans?.list?.find(x => x.shark === n.id);
      if (l) {
        const days = Math.round((l.due - G.t) / 6 * 10) / 10;
        if (G.player.cash > 0) actions.push({ label: `Pay ${G.player.cash >= l.owed ? 'it all' : 'what I can'}`, run: () => { const r = window.__mm.act('repay', l.id, l.owed); return r.ok ? (r.cleared ? 'Pleasure doing business. Do not be a stranger.' : `Got ${usd(r.paid)}. You still owe me ${usd(l.owed)}.`) : r.error; } });
        if (/time|please|sorry|later|week|beg/.test(t)) return { text: `Begging over text? Cute. ${usd(l.owed)}. ${days > 0 ? days + ' days.' : 'Today.'} Then I come over.`, actions };
        return { text: `You owe me ${usd(l.owed)}. ${days > 0 ? `${days} days left.` : 'You are LATE.'} Do not make me come to your office.`, actions };
      }
      if (n.id === 'broker') return { text: 'All square with us. Keep your shorts under control and it stays that way.', actions };
      actions.push({ label: 'See what they will lend', run: () => { close(); location.hash = '#loans'; return null; } });
      return { text: /money|loan|cash|borrow|lend/.test(t) ? 'Now we are talking. Come by the office and we will sort you out.' : 'You only text me when you need money. So. Do you need money?', actions };
    }
    if (n.kind === 'insider') {
      const I = G.player.insider;
      if (!I?.unlocked) return { text: 'Who is this? How did you get this number?', actions };
      if (!(I.met || ['dave']).includes(n.id)) return { text: 'We have not been introduced. Go through the proper channels.', actions };
      actions.push({ label: 'Buy a tip', run: () => { close(); location.hash = '#insider'; return null; } });
      return { text: I.heat >= 50 ? 'Not on this line. The Commission is listening. Meet me in person.' : /tip|know|info|secret|news/.test(t) ? 'Maybe I know something. It will cost you. Come find me.' : 'Keep it short. Phones are not safe.', actions };
    }
    return { text: n.lines[(text.length + G.t) % n.lines.length], actions };
  }

  document.head.append(el('style', {}, `
  #mmm-back{position:fixed;inset:0;background:rgba(5,8,14,.72);z-index:9000;display:none;align-items:flex-start;justify-content:center;padding:5vh 12px;overflow:auto}
  #mmm-back.on{display:flex}
  #mmm{width:min(480px,100%);height:min(660px,88vh);display:flex;flex-direction:column;background:var(--panel,#161a25);color:var(--text,#d1d4dc);border:1px solid var(--line2,#2f3545);border-radius:12px;font:14px/1.45 system-ui,sans-serif;overflow:hidden}
  #mmm .hd{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--line,#232836)}#mmm .hd b{flex:1;font-size:16px}
  #mmm button{cursor:pointer;border:1px solid var(--line2,#2f3545);background:transparent;color:inherit;border-radius:8px;padding:6px 12px;font:inherit}
  #mmm button.p{background:#2962ff;border-color:#2962ff;color:#fff}
  #mmm .body{flex:1;overflow:auto;padding:10px 14px}
  #mmm .conv{display:flex;gap:10px;align-items:center;padding:9px 6px;border-bottom:1px solid var(--line,#232836);cursor:pointer;border-radius:8px}#mmm .conv:hover{background:var(--panel2,#1f2430)}
  #mmm .conv .n{font-weight:600}#mmm .conv .l{color:var(--mute,#8a8fa0);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px}
  #mmm .grp{font:700 11px system-ui;letter-spacing:.08em;color:var(--mute,#8a8fa0);margin:12px 0 2px;text-transform:uppercase}
  #mmm .dot{background:#2962ff;color:#fff;border-radius:999px;font:700 11px system-ui;padding:1px 7px;margin-left:auto}
  #mmm .bub{max-width:78%;padding:8px 11px;border-radius:14px;margin:4px 0;white-space:pre-wrap;word-break:break-word}
  #mmm .bub.me{margin-left:auto;background:#2962ff;color:#fff;border-bottom-right-radius:4px}#mmm .bub.them{background:var(--panel3,#2a2e39);border-bottom-left-radius:4px}
  #mmm .bub.special{background:#3b2f0f;border:1px solid #f7c94866;color:#fff}
  #mmm .t{font-size:10px;opacity:.7;margin-top:2px}#mmm .seen{text-align:right;font-size:11px;color:var(--mute,#8a8fa0);margin:-2px 2px 4px}
  #mmm .ft{display:flex;gap:8px;padding:10px 14px;border-top:1px solid var(--line,#232836)}
  #mmm .tools{display:flex;gap:6px;padding:8px 14px 0;flex-wrap:wrap}#mmm .tools button{padding:4px 10px;font-size:13px}
  #mmm .form{padding:8px 14px;display:flex;flex-direction:column;gap:6px;border-top:1px solid var(--line,#232836);background:var(--bg2,#131722)}
  #mmm input,#mmm textarea,#mmm select{flex:1;min-width:0;background:var(--bg,#0f121a);color:inherit;border:1px solid var(--line2,#2f3545);border-radius:8px;padding:8px 10px;font:inherit;resize:none}
  #mmm .err{color:#f7525f;font-size:13px;padding:0 14px 8px}#mmm .mut{color:var(--mute,#8a8fa0);font-size:12px}
  #mmm .typing{color:var(--mute,#8a8fa0);font-style:italic;font-size:12px}
  #mmm .qa{display:flex;gap:6px;flex-wrap:wrap;margin:2px 0 8px}#mmm .qa button{font-size:12px;padding:4px 10px;border-color:#2962ff;color:#7fa3ff}
  [data-act="msgs"]{position:relative}`));
  const badgeCss = el('style', {}); document.head.append(badgeCss);

  const back = el('div', { id: 'mmm-back' }), box = el('div', { id: 'mmm', role: 'dialog', 'aria-label': 'Messages' });
  back.append(box); document.body.append(back);
  back.addEventListener('mousedown', e => { if (e.target === back) close(); });
  document.addEventListener('keydown', e => { if (back.classList.contains('on') && e.key === 'Escape') { close(); e.stopPropagation(); } }, true);
  box.addEventListener('keydown', e => e.stopPropagation()); // typing here must not trigger the game's hotkeys

  let view = 'list', withNick = '', npc = null, rows = [], thread = null, err = '', tool = '', typing = false;
  const close = () => { back.classList.remove('on'); view = 'list'; tool = ''; };
  function setUnread(n) { badgeCss.textContent = n ? `[data-act="msgs"]::after{content:"${Math.min(n, 99)}";position:absolute;top:0;right:0;background:#f23645;color:#fff;border-radius:999px;font:700 10px system-ui;padding:0 5px;line-height:15px}` : ''; }

  function drawList() {
    const nick = el('input', { placeholder: 'Message a trader by username', maxlength: '16' });
    const groups = {}; for (const n of NPCS) (groups[n.group] ||= []).push(n);
    box.replaceChildren(
      el('div', { class: 'hd' }, el('b', {}, '📱 Phone'), el('button', { 'aria-label': 'Close', onclick: close }, '×')),
      el('div', { class: 'ft', style: 'border-top:0;border-bottom:1px solid var(--line,#232836)' }, nick, el('button', { class: 'p', onclick: () => { const n = nick.value.trim(); if (n) openThread(n); } }, 'Open')),
      err ? el('div', { class: 'err', style: 'padding-top:8px' }, err) : null,
      el('div', { class: 'body' },
        el('div', { class: 'grp' }, 'Traders'),
        ...(rows.length ? rows.map(r => el('div', { class: 'conv', onclick: () => openThread(r.nickname) },
          el('div', { style: 'min-width:0' }, el('div', { class: 'n' }, r.nickname), el('div', { class: 'l' }, (r.mine ? 'You: ' : '') + r.last)),
          r.unread ? el('span', { class: 'dot' }, r.unread) : el('span', { class: 'mut', style: 'margin-left:auto' }, ago(r.at)))) : [el('div', { class: 'mut' }, 'No chats yet. Type a username above, or press Message on a trader\'s office.')]),
        ...Object.entries(groups).flatMap(([g, list]) => [el('div', { class: 'grp' }, g), ...list.map(n => { const last = npcLoad(n.id).at(-1); return el('div', { class: 'conv', onclick: () => openNpc(n) }, el('span', { style: 'font-size:20px' }, n.icon), el('div', { style: 'min-width:0' }, el('div', { class: 'n' }, n.name), el('div', { class: 'l' }, last ? (last.mine ? 'You: ' : '') + last.body : 'Tap to text'))); })])));
  }

  // ----- a chat with another player -----
  function toolForm() {
    const G = S();
    if (tool === 'money') {
      const amt = el('input', { type: 'number', min: '1', step: '1', placeholder: 'Amount in $' }), note = el('input', { placeholder: 'Note (optional)', maxlength: '140' });
      return el('div', { class: 'form' }, el('div', { class: 'mut' }, G && !G.mode ? `You have ${usd(G.player.cash)} in cash.` : 'Money can only be sent from your career game.'), el('div', { style: 'display:flex;gap:6px' }, amt, note),
        el('div', { style: 'display:flex;gap:6px;justify-content:flex-end' }, el('button', { onclick: () => { tool = ''; drawThread(); } }, 'Cancel'), el('button', { class: 'p', onclick: async () => {
          const c = Math.round(Number(amt.value) * 100), H = S();
          if (!H || H.mode) { err = 'Open your career game to send money.'; return drawThread(); }
          if (!(c >= 100) || c > H.player.cash) { err = 'Enter an amount you actually have.'; return drawThread(); }
          window.__mm.save(); await window.__mm.push();
          try { await api('send_money', { nick: withNick, amount: c, note: note.value }); H.player.cash -= c; H.player.log.push({ type: 'gift_out', t: H.t, total: c, src: withNick }); window.__mm.save(); window.__mm.render(); tool = ''; err = ''; await loadThread(); } catch (e) { err = e.message; drawThread(); }
        } }, 'Send money')));
    }
    if (tool === 'gift') {
      const owned = (G?.player.life?.owned || []).filter(o => !o.pledged);
      const sel = el('select', {}, ...owned.map(o => el('option', { value: String(o.uid) }, `${o.id} (${usd(o.paid)})`)));
      return el('div', { class: 'form' }, el('div', { class: 'mut' }, owned.length ? 'Give away one of your toys. They get it, you lose it.' : 'You have no toys to give. Buy some in Lifestyle.'), owned.length ? sel : null,
        el('div', { style: 'display:flex;gap:6px;justify-content:flex-end' }, el('button', { onclick: () => { tool = ''; drawThread(); } }, 'Cancel'), owned.length ? el('button', { class: 'p', onclick: async () => {
          const H = S(); if (!H || H.mode) { err = 'Open your career game to send gifts.'; return drawThread(); }
          const o = H.player.life.owned.find(x => x.uid === Number(sel.value)); if (!o) return;
          window.__mm.save(); await window.__mm.push();
          try { await api('send_gift', { nick: withNick, item: o.id, paid: o.paid }); H.player.life.owned = H.player.life.owned.filter(x => x !== o); window.__mm.save(); window.__mm.render(); tool = ''; err = ''; await loadThread(); } catch (e) { err = e.message; drawThread(); }
        } }, 'Send gift') : null));
    }
    if (tool === 'tip') {
      const tips = (G?.player.insider?.tips || []).filter(x => x.expires > G.t).slice().reverse();
      const sel = el('select', {}, ...tips.map((x, i) => el('option', { value: String(i) }, x.text)));
      return el('div', { class: 'form' }, el('div', { class: 'mut' }, tips.length ? 'Pass one of your insider tips along. Their market may not play out the same way.' : 'You have no live insider tips. Buy one from your contacts first.'), tips.length ? sel : null,
        el('div', { style: 'display:flex;gap:6px;justify-content:flex-end' }, el('button', { onclick: () => { tool = ''; drawThread(); } }, 'Cancel'), tips.length ? el('button', { class: 'p', onclick: async () => {
          const x = tips[Number(sel.value)]; if (!x) return;
          try { await api('send', { nick: withNick, text: `🕵️ Insider tip: ${x.text}` }); tool = ''; err = ''; await loadThread(); } catch (e) { err = e.message; drawThread(); }
        } }, 'Share tip') : null));
    }
    return null;
  }
  function drawThread() {
    const input = el('textarea', { rows: '2', maxlength: '500', placeholder: 'Write a message…' });
    const send = async () => {
      const text = input.value.trim(); if (!text) return; input.disabled = true;
      try { await api('send', { nick: withNick, text }); input.value = ''; err = ''; await loadThread(); } catch (e) { err = e.message; drawThread(); }
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    const msgs = thread?.messages || [], lastMine = msgs.map(m => m.mine).lastIndexOf(true);
    const body = el('div', { class: 'body' }, ...(msgs.length ? msgs.flatMap((m, i) => [el('div', { class: 'bub ' + (/^(💸|🎁|🕵️)/u.test(m.body) ? 'special ' : '') + (m.mine ? 'me' : 'them') }, m.body, el('div', { class: 't' }, ago(m.at))), i === lastMine ? el('div', { class: 'seen' }, m.seen ? 'Seen' : 'Delivered') : null]) : [el('div', { class: 'mut' }, thread ? 'Say hello to ' + thread.nickname + '.' : 'Loading…')]));
    const tb = (k, label) => el('button', { onclick: () => { tool = tool === k ? '' : k; err = ''; drawThread(); } }, label);
    box.replaceChildren(
      el('div', { class: 'hd' }, el('button', { onclick: () => { view = 'list'; err = ''; tool = ''; loadList(); } }, '‹'), el('b', {}, thread?.nickname || withNick), el('button', { 'aria-label': 'Close', onclick: close }, '×')),
      body, err ? el('div', { class: 'err' }, err) : null,
      el('div', { class: 'tools' }, tb('money', '💸 Send money'), tb('gift', '🎁 Send a gift'), tb('tip', '🕵️ Share a tip')), toolForm(),
      el('div', { class: 'ft' }, input, el('button', { class: 'p', onclick: send }, 'Send')));
    body.scrollTop = body.scrollHeight; if (!tool) setTimeout(() => input.focus(), 0);
  }

  // ----- a chat with a contact -----
  function drawNpc() {
    const list = npcLoad(npc.id), input = el('textarea', { rows: '2', maxlength: '300', placeholder: `Text ${npc.name}…` });
    const send = () => {
      const text = input.value.trim(); if (!text || typing) return;
      list.push({ mine: true, body: text, at: new Date().toISOString() }); npcSave(npc.id, list); typing = true; drawNpc();
      setTimeout(() => { const r = npcReply(npc, text); list.push({ mine: false, body: r.text, at: new Date().toISOString() }); npcSave(npc.id, list); typing = false; lastActions = r.actions; if (view === 'npc') drawNpc(); }, 900 + Math.random() * 900);
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    const body = el('div', { class: 'body' }, ...(list.length ? list.map(m => el('div', { class: 'bub ' + (m.mine ? 'me' : 'them') }, m.body, el('div', { class: 't' }, ago(m.at)))) : [el('div', { class: 'mut' }, `${npc.name} is in your contacts. Send them a text.`)]),
      typing ? el('div', { class: 'typing' }, `${npc.name} is typing…`) : null,
      lastActions.length && !typing ? el('div', { class: 'qa' }, ...lastActions.map(a => el('button', { onclick: () => { const t = a.run(); lastActions = []; if (t) { list.push({ mine: false, body: t, at: new Date().toISOString() }); npcSave(npc.id, list); } if (view === 'npc') drawNpc(); } }, a.label))) : null);
    box.replaceChildren(
      el('div', { class: 'hd' }, el('button', { onclick: () => { view = 'list'; lastActions = []; drawList(); } }, '‹'), el('b', {}, `${npc.icon} ${npc.name}`), el('button', { 'aria-label': 'Close', onclick: close }, '×')),
      body, el('div', { class: 'ft' }, input, el('button', { class: 'p', onclick: send }, 'Send')));
    body.scrollTop = body.scrollHeight; setTimeout(() => input.focus(), 0);
  }
  let lastActions = [];
  function openNpc(n) { view = 'npc'; npc = n; lastActions = []; drawNpc(); }

  async function loadList() { try { const r = await api('inbox'); rows = r.rows; setUnread(r.unread); } catch (e) { err = e.message; } if (view === 'list' && back.classList.contains('on')) drawList(); }
  async function loadThread() { try { thread = await api('thread', { nick: withNick }); withNick = thread.nickname; err = err || ''; } catch (e) { err = e.message; thread = null; view = 'list'; return drawList(); } if (view === 'thread') drawThread(); loadList(); }
  function openThread(nick) { view = 'thread'; withNick = nick; thread = null; err = ''; tool = ''; drawThread(); loadThread(); }
  function open(nick) {
    if (!token()) { back.classList.add('on'); box.replaceChildren(el('div', { class: 'hd' }, el('b', {}, '📱 Phone'), el('button', { onclick: close }, '×')), el('div', { class: 'body' }, 'Sign in from the Menu to message other traders.')); return; }
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
      if (back.classList.contains('on')) { if (view === 'thread' && !tool) loadThread(); else if (view === 'list') drawList(); }
    } catch { /* offline */ }
  }
  function toast(msg) {
    const t = el('div', { style: 'position:fixed;right:14px;bottom:120px;z-index:9100;background:#161a25;color:#fff;border:1px solid #2962ff;border-radius:10px;padding:10px 14px;font:14px system-ui;cursor:pointer;max-width:300px', onclick: () => { t.remove(); open(); } }, msg + ' (tap to read)');
    document.body.append(t); setTimeout(() => t.remove(), 12000);
  }
  setInterval(poll, 20000); setTimeout(poll, 2500);
})();
