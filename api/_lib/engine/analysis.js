// Research reports, portfolio analytics and market selectors used by the UI.
import { hashString } from './rng.js';
import { dayOf, TPD } from './calendar.js';
import { effectiveValue, financialCondition, volRating, sentimentLabel, dayChange } from './market.js';
import { netWorth, positions } from './trading.js';
import { hasFeature } from './progress.js';
import { clamp, round, std } from './util.js';

const level = (v, lo, hi) => (Math.abs(v) < lo ? 'Low' : Math.abs(v) < hi ? 'Moderate' : 'High');

export function companyReport(S, ticker) {
  const c = S.companies[ticker]; if (!c) return null;
  const cap = c.price * c.shares, sps = c.revenue / c.shares, eps = sps * c.margin;
  const cond = financialCondition(c, S.macro);
  const base = {
    cap, pe: eps > 0 ? c.price / eps : null, ps: c.price / sps, eps, rev: c.revenue, margin: c.margin, growth: c.growth, debtEq: c.debtEq,
    divYield: c.div, cash: c.cash, condition: cond, volLabel: volRating(c.vol), sentLabel: sentimentLabel(c.sentiment), beta: c.loads.beta,
    ret5: pastReturn(c, 5), ret20: pastReturn(c, 20), ret60: pastReturn(c, 60),
  };
  if (!hasFeature(S, 'research')) return { ...base, locked: true };
  const noise = ((hashString(ticker + Math.floor(dayOf(S.t) / 15)) % 1000) / 1000 - 0.5) * 0.18;
  const fv = effectiveValue(S, c) * Math.exp(noise);
  const lo = fv * 0.88, hi = fv * 1.12; const gap = c.price / fv - 1;
  base.fair = { lo, hi, mid: fv, verdict: gap > 0.12 ? 'Overvalued' : gap < -0.12 ? 'Undervalued' : 'Fairly valued', gap };
  base.analyst = { rating: clamp(Math.round(3 - gap * 6 + (c.rep - 60) / 40), 1, 5), note: 'Analyst view is an estimate and can be wrong: valuation noise is built into every report.' };
  if (hasFeature(S, 'analytics')) {
    const L = c.loads;
    base.exposures = [
      { k: 'Interest rates', v: level(L.rs, 0.4, 0.9), dir: L.rs > 0 ? 'Hurt by higher rates' : 'Helped by higher rates' },
      { k: 'Oil prices', v: level(L.os, 0.25, 0.7), dir: L.os > 0 ? 'Helped by higher oil' : L.os < 0 ? 'Hurt by higher oil' : 'Neutral' },
      { k: 'Consumer cycle', v: level(L.cs, 0.35, 0.8), dir: 'Tracks consumer confidence' },
      { k: 'Crypto', v: level(L.cr, 0.15, 0.5), dir: 'Linked to digital-asset prices' },
      { k: 'AI theme', v: level(L.th.AI || 0, 0.2, 0.6), dir: 'Moves with AI sentiment' },
      { k: 'Market beta', v: level(L.beta - 0.7, 0.2, 0.5), dir: `Beta ${L.beta.toFixed(2)}` },
    ];
  }
  if (hasFeature(S, 'scenarios')) {
    const L = c.loads;
    base.scenarios = [
      { name: 'Rates +1 point', v: Math.exp(-0.06 * L.rs) - 1 },
      { name: 'Oil +20%', v: L.os * Math.log(1.2) * 0.8 },
      { name: 'Recession (growth −4pts)', v: L.beta * -0.12 + L.cs * -0.05 },
      { name: 'Market-wide panic', v: L.beta * -0.2 + L.def * 0.04 },
      { name: 'AI bubble bursts', v: (L.th.AI || 0) * -0.35 },
      { name: 'Crypto collapse', v: (L.cr + (L.th.CRYPTO || 0)) * -0.3 },
    ];
  }
  return base;
}

export function pastReturn(c, days) { const d = c.daily; if (d.length <= days) return d.length ? c.price / d[0][0] - 1 : 0; return c.price / d[d.length - 1 - days][3] - 1; }

export function portfolioAnalytics(S) {
  const p = S.player, h = p.nwHistory;
  const rets = []; for (let i = 1; i < h.length; i++) if (h[i - 1] > 0) rets.push(h[i] / h[i - 1] - 1);
  const idx = S.idx.daily; const ir = []; for (let i = Math.max(1, idx.length - rets.length); i < idx.length; i++) ir.push(idx[i] / idx[i - 1] - 1);
  const n = Math.min(rets.length, ir.length); const rr = rets.slice(-n), ii = ir.slice(-n);
  let beta = null; if (n > 8) { const mr = rr.reduce((a, b) => a + b, 0) / n, mi = ii.reduce((a, b) => a + b, 0) / n; let cov = 0, v = 0; for (let k = 0; k < n; k++) { cov += (rr[k] - mr) * (ii[k] - mi); v += (ii[k] - mi) ** 2; } beta = v > 0 ? cov / v : null; }
  const vol = rets.length > 4 ? std(rets) * Math.sqrt(360) : null;
  const mean = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const sharpe = vol ? (mean * 360 - 0.03) / vol : null;
  let peak = 0, mdd = 0; for (const x of h) { peak = Math.max(peak, x); if (peak) mdd = Math.max(mdd, 1 - x / peak); }
  const pos = positions(S); const hhi = pos.reduce((a, x) => a + x.weight ** 2, 0);
  const secs = {}; for (const x of pos) secs[x.sector] = (secs[x.sector] || 0) + x.weight;
  const closes = p.log.filter(l => ['sell', 'acquired', 'bankrupt'].includes(l.type));
  const wins = closes.filter(l => l.pnl > 0), losses = closes.filter(l => l.pnl <= 0);
  const nw = netWorth(S);
  return { beta, vol, sharpe, maxDD: mdd, hhi, sectors: secs, positions: pos, winRate: closes.length ? wins.length / closes.length : null,
    avgWin: wins.length ? wins.reduce((a, l) => a + l.pnl, 0) / wins.length : 0, avgLoss: losses.length ? losses.reduce((a, l) => a + l.pnl, 0) / losses.length : 0,
    trades: closes.length, realized: p.realized, unrealized: pos.reduce((a, x) => a + x.pnl, 0), fees: p.fees, dividends: p.dividends, nw,
    bestDay: rets.length ? Math.max(...rets) : 0, worstDay: rets.length ? Math.min(...rets) : 0 };
}

// ---- selectors
export const companies = S => S.order.map(t => S.companies[t]);
export function movers(S, n = 5) {
  const cs = companies(S).map(c => ({ c, ch: dayChange(c) })).sort((a, b) => b.ch - a.ch);
  return { up: cs.slice(0, n), down: cs.slice(-n).reverse() };
}
export function trending(S, n = 6) { return companies(S).map(c => ({ c, score: c.buzz + Math.abs(dayChange(c)) * 40 })).sort((a, b) => b.score - a.score).slice(0, n).map(x => x.c); }
export function sectorStats(S) {
  const out = {};
  for (const c of companies(S)) { const o = out[c.sector] || (out[c.sector] = { sector: c.sector, cap: 0, num: 0, n: 0, sent: 0, ticks: 0 }); const cap = c.price * c.shares; o.cap += cap; o.num += cap * dayChange(c); o.n++; o.sent += c.sentiment * cap; }
  for (const k in out) { out[k].ch = out[k].num / out[k].cap; out[k].sent = out[k].sent / out[k].cap; }
  return Object.values(out).sort((a, b) => b.cap - a.cap);
}
export function mostRecentNews(S, { channel = 'public', n = 20, ticker } = {}) {
  const out = []; for (let i = S.news.length - 1; i >= 0 && out.length < n; i--) { const x = S.news[i]; if (x.channel !== channel) continue; if (ticker && !x.tickers.includes(ticker)) continue; out.push(x); }
  return out;
}
export function postsFor(S, { ticker, infl, n = 30 } = {}) {
  const out = []; for (let i = S.posts.length - 1; i >= 0 && out.length < n; i--) { const x = S.posts[i]; if (ticker && !x.tickers.includes(ticker)) continue; if (infl && x.infl !== infl) continue; out.push(x); }
  return out;
}
export function opinionOn(S, ticker) {
  const rec = S.posts.filter(p => p.tickers.includes(ticker) && S.t - p.t < TPD * 20 && p.dir);
  const byInf = {}; for (const p of rec) byInf[p.infl] = p;
  const list = Object.values(byInf); const bull = list.filter(p => p.dir > 0).length, bear = list.filter(p => p.dir < 0).length;
  return { list, bull, bear };
}
export function leaderboard(S) {
  const nw = netWorth(S).total / 100; const p = S.player;
  const rows = S.rivals.map(r => { const v = (r.cash + Object.keys(r.holdings).reduce((a, t) => a + (S.companies[t] ? r.holdings[t] * S.companies[t].price : 0), 0)); return { id: r.id, name: r.name, tier: r.tier, style: r.style, bio: r.bio, nw: v, base: r.baseNW ?? r.start, hue: r.hue, ret: v / (r.baseNW ?? r.start) - 1, spark: r.nw.slice(-60), trades: r.trades }; });
  rows.push({ id: 'player', name: 'You', tier: 'player', style: 'player', bio: 'The rising star. That is you.', nw, base: p.startCash / 100, hue: 150, ret: nw / (p.startCash / 100) - 1, spark: p.nwHistory.slice(-60).map(x => x / 100), trades: p.stats.trades });
  return rows.sort((a, b) => b.nw - a.nw);
}
export { round };
