// Trading history: every trade, dividend, loan, tip and purchase in the current game, newest first,
// with filters and running totals. Opens from the 📜 button.
(() => {
  'use strict';
  const S = () => window.__mm?.G?.S;
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) if (v == null || v === false) continue; else k === 'class' ? (n.className = v) : k.startsWith('on') ? n.addEventListener(k.slice(2), v) : k === 'style' ? (n.style.cssText = v) : n.setAttribute(k, v);
    for (const c of kids.flat()) if (c != null) n.append(c.nodeType ? c : document.createTextNode(String(c)));
    return n;
  };
  const usd = c => (c < 0 ? '−$' : '$') + (Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const MONTHS = ['Aurelis', 'Brumal', 'Cindrel', 'Dovane', 'Embrel', 'Fenmoor', 'Gildara', 'Hesper', 'Ivaren', 'Jessamar', 'Kestral', 'Lunaris'];
  const SESS = ['Open', 'Morning', 'Midday', 'Afternoon', 'Late', 'Close'];
  const date = t => { const day = Math.floor(t / 6), doy = ((day % 360) + 360) % 360; return `${doy % 30 + 1} ${MONTHS[Math.floor(doy / 30)].slice(0, 3)} YE${41 + Math.floor(day / 360)}, ${SESS[((t % 6) + 6) % 6]}`; };
  const LABEL = { buy: 'Bought', sell: 'Sold', short: 'Shorted', cover: 'Covered', dividend: 'Dividend', loan: 'Borrowed', repay: 'Repaid loan', repossessed: 'Repossessed', tip: 'Bought a tip', flex: 'Bought toy', acquire: 'Bought company', divest: 'Sold company', gift_out: 'Sent money' };
  const GROUPS = { all: () => true, trades: x => ['buy', 'sell', 'short', 'cover'].includes(x.type), income: x => ['dividend', 'divest'].includes(x.type), money: x => ['loan', 'repay', 'repossessed', 'tip', 'flex', 'acquire'].includes(x.type) };

  document.head.append(el('style', {}, `
  #mmh-back{position:fixed;inset:0;background:rgba(5,8,14,.72);z-index:9000;display:none;align-items:flex-start;justify-content:center;padding:4vh 12px;overflow:auto}
  #mmh-back.on{display:flex}
  #mmh{width:min(820px,100%);background:var(--panel,#161a25);color:var(--text,#d1d4dc);border:1px solid var(--line2,#2f3545);border-radius:12px;font:13px/1.45 system-ui,sans-serif}
  #mmh .hd{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--line,#232836)}#mmh .hd b{flex:1;font-size:16px}
  #mmh button{cursor:pointer;border:1px solid var(--line2,#2f3545);background:transparent;color:inherit;border-radius:8px;padding:5px 10px;font:inherit}#mmh button.on{background:#2962ff;border-color:#2962ff;color:#fff}
  #mmh .bar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;padding:10px 14px;height:auto;overflow:visible;border-radius:0;background:none;margin-top:0}#mmh input{background:var(--bg,#0f121a);color:inherit;border:1px solid var(--line2,#2f3545);border-radius:8px;padding:6px 9px;font:inherit;width:110px}
  #mmh .sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;padding:0 14px 10px}#mmh .sum div{background:var(--bg2,#131722);border-radius:8px;padding:8px 10px}#mmh .sum b{display:block;font-size:16px;font-family:ui-monospace,monospace}
  #mmh table{width:100%;border-collapse:collapse}#mmh th{font-size:11px;color:var(--mute,#8a8fa0);text-align:left;font-weight:500;padding:6px 8px;border-bottom:1px solid var(--line,#232836);position:sticky;top:0;background:var(--panel,#161a25)}
  #mmh td{padding:6px 8px;border-bottom:1px solid var(--line,#232836)}#mmh .mono{font-family:ui-monospace,monospace}#mmh .up{color:#22ab94}#mmh .down{color:#f7525f}#mmh .mut{color:var(--mute,#8a8fa0)}
  #mmh .wrap{max-height:60vh;overflow:auto}`));
  const back = el('div', { id: 'mmh-back' }), box = el('div', { id: 'mmh', role: 'dialog', 'aria-label': 'Trading history' });
  back.append(box); document.body.append(back);
  back.addEventListener('mousedown', e => { if (e.target === back) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && back.classList.contains('on')) close(); });
  const close = () => back.classList.remove('on');
  let group = 'all', q = '';

  function draw() {
    const G = S(); if (!G) return;
    const log = (G.player.log || []).filter(GROUPS[group]).filter(x => !q || (x.ticker || '').includes(q.toUpperCase())).slice().reverse();
    const all = G.player.log || [];
    const realized = all.reduce((a, x) => a + (x.pnl != null ? x.pnl : 0), 0), divs = all.filter(x => x.type === 'dividend').reduce((a, x) => a + (x.amount || 0), 0);
    const trades = all.filter(x => ['buy', 'sell', 'short', 'cover'].includes(x.type)), wins = trades.filter(x => x.pnl > 0).length, closed = trades.filter(x => x.pnl != null).length;
    const tab = (k, label) => el('button', { class: group === k ? 'on' : '', onclick: () => { group = k; draw(); } }, label);
    const search = el('input', { placeholder: 'Ticker', value: q, maxlength: '5' }); search.addEventListener('input', () => { q = search.value; draw(); search.focus(); search.setSelectionRange(q.length, q.length); });
    box.replaceChildren(
      el('div', { class: 'hd' }, el('b', {}, '📜 Trading history'), el('span', { class: 'mut' }, G.mode ? (String(G.mode.id).startsWith('duel-') ? '1v1 duel' : String(G.mode.id).startsWith('chal-') ? 'Challenge' : 'Weekly challenge ' + G.mode.id) : 'Career'), el('button', { onclick: close, 'aria-label': 'Close' }, '×')),
      el('div', { class: 'sum' },
        el('div', {}, el('span', { class: 'mut' }, 'Realised profit'), el('b', { class: realized >= 0 ? 'up' : 'down' }, usd(realized))),
        el('div', {}, el('span', { class: 'mut' }, 'Dividends'), el('b', { class: 'up' }, usd(divs))),
        el('div', {}, el('span', { class: 'mut' }, 'Trades'), el('b', {}, String(trades.length))),
        el('div', {}, el('span', { class: 'mut' }, 'Winning closes'), el('b', {}, closed ? `${wins}/${closed} (${Math.round(wins / closed * 100)}%)` : '—'))),
      el('div', { class: 'bar' }, tab('all', 'Everything'), tab('trades', 'Trades'), tab('income', 'Income'), tab('money', 'Loans, tips & spending'), el('span', { style: 'flex:1' }), search),
      el('div', { class: 'wrap' }, log.length ? el('table', {}, el('tr', {}, ...['When', 'What', 'Stock', 'Shares', 'Price', 'Amount', 'Profit/loss'].map(t => el('th', {}, t))),
        ...log.map(x => el('tr', {}, el('td', { class: 'mut' }, date(x.t)), el('td', {}, LABEL[x.type] || x.type), el('td', {}, el('b', {}, x.ticker || '')),
          el('td', { class: 'mono' }, x.shares ? Number(x.shares).toLocaleString('en-US') : ''), el('td', { class: 'mono' }, x.price ? usd(x.price) : ''),
          el('td', { class: 'mono' }, x.total != null ? usd(x.total) : x.amount != null ? usd(x.amount) : ''),
          el('td', { class: 'mono ' + (x.pnl == null ? '' : x.pnl >= 0 ? 'up' : 'down') }, x.pnl == null ? '' : usd(x.pnl) + (x.pct != null ? ` (${(x.pct * 100).toFixed(1)}%)` : '')))))
        : el('div', { class: 'bar mut' }, 'Nothing here yet. Your trades show up as you make them.')),
      el('div', { class: 'bar mut' }, `Showing the last ${Math.min(all.length, 600)} entries of this game.`));
  }
  function open() { back.classList.add('on'); draw(); }
  window.mmHistory = { open };
  document.addEventListener('click', e => { const t = e.target.closest('[data-act="history"]'); if (t) { e.preventDefault(); open(); } });
})();
