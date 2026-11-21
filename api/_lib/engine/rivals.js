// Rival investors: they trade the same market with simple, distinct strategies.
import { RIVALS } from './data/rivals.js';
import { dayOf } from './calendar.js';
import { effectiveValue } from './market.js';
import { clamp, std } from './util.js';

export function createRivals(S) {
  const r = S.rng.rivals;
  return RIVALS.map(d => ({ ...d, cash: d.start, holdings: {}, nw: [d.start], lastNW: d.start, offset: r.int(0, d.period - 1), fav: d.fav || [], trades: 0 }));
}

export function rivalNetWorth(S, rv) {
  let v = rv.cash; for (const t in rv.holdings) { const c = S.companies[t]; if (c) v += rv.holdings[t] * c.price; }
  return v;
}

function ret(c, n) { const d = c.daily; if (d.length <= n) return 0; return c.price / d[d.length - 1 - n][3] - 1; }
function vol(c) { const d = c.daily.slice(-20); if (d.length < 5) return c.vol / 4; const r = []; for (let i = 1; i < d.length; i++) r.push(Math.log(d[i][3] / d[i - 1][3])); return std(r); }

function score(S, rv, c, rng) {
  const noise = rng.normal(0, 0.02);
  switch (rv.style) {
    case 'momentum': return ret(c, 20) + 0.5 * ret(c, 5) + noise;
    case 'value': return Math.log(effectiveValue(S, c) / c.price) * (rng.chance(0.15) ? -1 : 1) + noise;
    case 'contrarian': return -ret(c, 10) * 0.8 + 0.4 * Math.log(effectiveValue(S, c) / c.price) + noise;
    case 'yolo': return vol(c) * 40 * (c.sentiment + 0.5) + ret(c, 5) + rng.normal(0, 0.15);
    case 'defensive': return (c.loads.def * 0.15) - vol(c) * 8 + (c.div * 2) + noise;
    case 'dividend': return c.div * 10 + (c.margin > 0.03 ? 0.2 : -1) - vol(c) * 3 + noise;
    case 'sector': return (rv.fav.includes(c.sector) ? 0.5 : 0) + ret(c, 20) * 0.5 + noise;
    case 'macro': return (S.macro.rate > 4 ? -c.loads.rs : c.loads.rs) * 0.05 + c.loads.def * (S.macro.fear > 45 ? 0.1 : -0.03) + 0.5 * ret(c, 20) + noise;
    case 'index': default: return Math.log(c.price * c.shares) * 0.01 + noise * 0.1;
  }
}

export function rivalsDaily(S) {
  const day = dayOf(S.t), rng = S.rng.rivals;
  const cos = S.order.map(t => S.companies[t]);
  for (const rv of S.rivals) {
    const nw = rivalNetWorth(S, rv);
    if ((day + rv.offset) % rv.period === 0 && day > 1) {
      const pool = rv.tier === 'rising' ? cos : cos.filter(c => c.price * c.shares > 5e9 || rv.style === 'sector');
      const ranked = pool.map(c => ({ c, s: score(S, rv, c, rng) })).sort((a, b) => b.s - a.s).slice(0, rv.picks);
      const target = new Set(ranked.map(x => x.c.ticker));
      for (const t of Object.keys(rv.holdings)) if (!target.has(t)) { const c = S.companies[t]; if (c && c.status === 'active') { rv.cash += rv.holdings[t] * c.price * 0.998; rv.trades++; } delete rv.holdings[t]; }
      const total = rivalNetWorth(S, rv);
      const per = total / ranked.length * 0.995;
      for (const { c } of ranked) {
        const have = (rv.holdings[c.ticker] || 0) * c.price; const diff = per - have;
        if (diff > per * 0.15 && rv.cash > diff) { rv.holdings[c.ticker] = (rv.holdings[c.ticker] || 0) + (diff * 0.998) / c.price; rv.cash -= diff; rv.trades++; }
        else if (diff < -per * 0.25) { const sellSh = (-diff) / c.price; rv.holdings[c.ticker] -= sellSh; rv.cash += -diff * 0.998; }
      }
      rv.cash = Math.max(0, rv.cash);
    }
    rv.lastNW = rivalNetWorth(S, rv); rv.nw.push(Math.round(rv.lastNW)); if (rv.nw.length > 720) rv.nw.shift();
    void nw;
  }
}
export { clamp };
