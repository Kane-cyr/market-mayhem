// The crowd: every signed-in player's career trades move prices in everyone else's market.
// Each player reports how much of each company they bought or sold (as a share of its market value);
// the server adds up everyone else's flow, and this script turns it into a push on the price over the
// next game day. Your own trades never move your own market, so a pump and dump needs other people.
// Ranked runs, duels and challenges are never touched.
(() => {
  'use strict';
  const K = 10, MAX = 0.25;
  const token = () => { try { return localStorage.getItem('mm.token') || ''; } catch { return ''; } };
  const S = () => window.__mm?.G?.S;
  let since = null, busy = false;
  try { since = localStorage.getItem('mm.crowd.since'); } catch { /* ignore */ }

  function myFlows(G) {
    const out = {};
    for (const x of G.player.log || []) {
      if (x.cr || !['buy', 'sell', 'short', 'cover'].includes(x.type)) continue;
      x.cr = 1;
      const c = G.companies[x.ticker]; if (!c) continue;
      const cap = c.price * c.shares * 100; if (!(cap > 0)) continue;
      const sign = x.type === 'buy' || x.type === 'cover' ? 1 : -1;
      out[x.ticker] = (out[x.ticker] || 0) + sign * Math.abs(x.total || 0) / cap;
    }
    for (const k in out) out[k] = Math.max(-1, Math.min(1, out[k]));
    return out;
  }
  async function tick() {
    const G = S(); if (busy || !G || G.mode || !token() || document.visibilityState !== 'visible') return;
    busy = true;
    try {
      const first = !since, flows = myFlows(G); if (first) for (const k in flows) delete flows[k]; // never replay old trades
      const r = await fetch('/api/game?op=crowd', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token() }, body: JSON.stringify({ flows, since }) });
      if (!r.ok) { busy = false; return; }
      const j = await r.json(); since = j.now; try { localStorage.setItem('mm.crowd.since', since); } catch { /* ignore */ }
      const H = S(); if (!H || H.mode) { busy = false; return; }
      let moved = 0;
      for (const [tk, sum] of Object.entries(j.crowd || {})) {
        const c = H.companies[tk]; if (!c || c.status !== 'active') continue;
        const L = sum <= -0.4 ? Math.max(-0.9, sum * 0.85) : Math.max(-MAX, Math.min(MAX, sum * K)); if (Math.abs(L) < 0.002) continue; // a rug pull (big negative flow) crashes far harder than normal selling
        H.impulses.push({ t: tk, rem: Math.log(1 + L), left: 6, start: H.t }); moved++;
        if (Math.abs(L) >= 0.03) window.__mm.news({ cat: 'Markets', sev: Math.abs(L) >= 0.1 ? 5 : 4, status: 'confirmed', tickers: [tk], source: 'Trading floor',
          head: L <= -0.3 ? `RUG PULL: ${c.name} collapses as a big holder dumps everything` : L > 0 ? `Traders pile into ${c.name}: heavy buying from other players` : `Traders dump ${c.name}: heavy selling from other players`,
          body: `Real players have been ${L > 0 ? 'buying' : 'selling'} ${tk} hard. Expect the price to ${L > 0 ? 'climb' : 'slide'} over the next day.`, impact: { co: {} } });
      }
      if (moved) { window.__mm.save(); window.__mm.render(); }
    } catch { /* offline */ }
    busy = false;
  }
  setInterval(tick, 20000); setTimeout(tick, 4000);
})();
