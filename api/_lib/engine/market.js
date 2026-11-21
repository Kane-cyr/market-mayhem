// The market engine: a factor model anchored to fundamentals.
//   log-return = factor exposure + idiosyncratic noise + pull toward fair value
//              + sentiment + queued news impulses + weather rotation.
// Nothing here ever reads the player's portfolio, so the market cannot target the player.
import { SECTOR_PROFILE } from './data/companies.js';
import { TPD, dayOf, sessionOf, dateOf } from './calendar.js';
import { hashString } from './rng.js';
import { clamp, round, std } from './util.js';

export const WEATHER = {
  sunshine: { id: 'sunshine', name: 'Bullish Sunshine', short: 'Sunny', vol: 0.85, drift: 0.00008, rot: -0.0001, blurb: 'Confidence is high and volatility is subdued. Risk assets are in favour.' },
  fog:      { id: 'fog', name: 'Economic Fog', short: 'Foggy', vol: 1.0, drift: 0, rot: 0, blurb: 'Mixed signals. No clear trend. Visibility is poor.' },
  thunder:  { id: 'thunder', name: 'Financial Thunderstorms', short: 'Storms', vol: 1.25, drift: -0.0001, rot: 0.0003, blurb: 'Fear is rising. Speculative stocks are exposed; defensive sectors hold up better.' },
  panic:    { id: 'panic', name: 'Market-Wide Panic', short: 'Panic', vol: 1.6, drift: -0.00025, rot: 0.0006, blurb: 'Investors are fleeing risk. Correlations spike and liquidity thins out.' },
  recovery: { id: 'recovery', name: 'Recovery Conditions', short: 'Recovery', vol: 1.1, drift: 0.0003, rot: -0.0002, blurb: 'The storm is passing. Dip-buyers are returning and risk appetite is rebuilding.' },
  volatile: { id: 'volatile', name: 'Extreme Volatility', short: 'Volatile', vol: 1.5, drift: 0, rot: 0.0001, blurb: 'Violent swings in both directions. Nobody is sure what comes next.' },
};
const KAPPA = { blue: 0.012, growth: 0.008, spec: 0.004 };
const TIER_VOL = { blue: 0.8, growth: 1, spec: 1.3 }, UP_LEAN = 0.015;
const CUM_DECAY = { MKT: 0.0003, CONS: 0.001, CRYPTO: 0.0006, AIF: 0.0004, GREENF: 0.0004, OIL: 0.0015 };
const SEC_DECAY = 0.0004;
export const FACTORS = ['MKT', 'CONS', 'CRYPTO', 'AIF', 'GREENF', 'OIL'];

export function computeLoads(def) {
  const sp = SECTOR_PROFILE[def.s]; const ex = def.ex || {};
  let rs = sp.rs;
  if (def.s !== 'Banking') rs += 0.3 * (def.d - 0.7) + 0.6 * def.g; else rs += 0.1 * (def.d - 1.2);
  return {
    rs: ex.rs ?? round(rs, 2), os: ex.os ?? sp.os, cs: ex.cs ?? sp.cs, cr: ex.cr ?? sp.cr,
    beta: ex.beta ?? sp.beta, def: ex.def ?? sp.def, th: { ...sp.th, ...(ex.th || {}) },
  };
}

export function fundamentalValue(c, macro) {
  const sps = c.revenue / c.shares;
  const g = clamp(c.growth, 0, 1.2);
  const earnVal = Math.max(0, sps * c.margin * (11 + 48 * Math.min(g, 0.6)));
  const salesVal = sps * (1.2 + 11 * g) * (1 + 0.35 * clamp(c.margin, -1, 0));
  const w = clamp((c.margin - 0.03) / 0.09, 0, 1);
  const fv = Math.max(w * earnVal + (1 - w) * salesVal, sps * 0.1);
  return fv * Math.exp(-0.06 * (macro.rate - 3.5) * c.loads.rs) * c.fvScale;
}

export function effectiveValue(state, c) {
  const L = c.loads, cum = state.cum;
  const adj = L.beta * cum.MKT + L.os * cum.OIL + L.cs * cum.CONS + L.cr * cum.CRYPTO
    + (L.th.AI || 0) * cum.AIF + (L.th.GREEN || 0) * cum.GREENF + (cum.S[c.sector] || 0) + c.info;
  let prem = 0;
  for (const k in L.th) prem += L.th[k] * Math.log(state.premium[k] || 1);
  return c.fv * Math.exp(adj + prem);
}

export function brandFor(def) {
  const h = hashString(def.t);
  const shapes = ['hex', 'circle', 'diamond', 'shield', 'squircle', 'triangle', 'ring', 'bars'];
  return { hue: (SECTOR_PROFILE[def.s].hue + (h % 41) - 20 + 360) % 360, hue2: (h >> 8) % 360, shape: shapes[h % shapes.length], mono: def.t.slice(0, 2) };
}

export function createCompany(def, state, listedTick = 0, ipo = false) {
  const rng = state.rng.market;
  const loads = computeLoads(def);
  const shares = (def.cap * 1e9) / def.p;
  const burn = def.m < 0 ? (def.rev * 1e9 * -def.m) / 360 : 0;
  const c = {
    ticker: def.t, name: def.n, sector: def.s, tier: def.k, desc: def.desc,
    competitors: def.comp || [], suppliers: def.sup || [], brand: brandFor(def),
    price: def.p, shares, revenue: def.rev * 1e9, margin: def.m, growth: def.g, debtEq: def.d,
    vol: def.v, div: def.div || 0, rep: def.rep, sentiment: rng.normal(0, 0.1), loads,
    cash: burn > 0 ? burn * 360 * (def.k === 'spec' ? rng.float(2.6, 3.8) : rng.float(3, 5)) : def.rev * 1e9 * 0.12,
    status: 'active', emerging: def.cap < 6, listedTick, ipo,
    fvScale: 1, fv: def.p, info: 0, buzz: 0,
    reportOffset: rng.int(0, 89), divOffset: rng.int(0, 89),
    prevClose: def.p, dayOpen: def.p, dayHigh: def.p, dayLow: def.p, ret1: 0,
    ticks: [def.p], daily: [], newsIds: [], lastReport: null, takeover: null, ipoPrice: ipo ? def.p : null,
  };
  const raw = fundamentalValue(c, state.macro);
  const miss = c.tier === 'blue' ? 0.05 : c.tier === 'growth' ? 0.09 : 0.17;
  c.fvScale = (def.p / raw) * Math.exp(rng.normal(0, miss));
  c.fv = fundamentalValue(c, state.macro);
  return c;
}

export const activeList = state => state.order.map(t => state.companies[t]);
export function totalCap(state) { let s = 0; for (const t of state.order) { const c = state.companies[t]; s += c.price * c.shares; } return s; }
export function indexLevel(state) { return totalCap(state) / state.idx.divisor; }

/** queue a news/event price impulse (log-return) for one company */
export function applyImpulse(state, ticker, amount, o = {}) {
  const c = state.companies[ticker];
  if (!c || c.status !== 'active' || !isFinite(amount) || amount === 0) return;
  const persist = o.persist ?? 0.85;
  c.info += persist * amount;
  state.impulses.push({ t: ticker, rem: amount, rate: o.rate ?? 0.5, start: state.t + (o.delay || 0) });
  if (o.sentiment !== false) c.sentiment = clamp(c.sentiment + 3 * amount, -1, 1);
  c.buzz += 1 + Math.abs(amount) * 25;
}

function driftTotals(state) {
  const tot = {}; const t = state.t;
  for (const d of state.drifts) if (d.until > t && d.from <= t) tot[d.key] = (tot[d.key] || 0) + d.v;
  return tot;
}

export function stepMarket(state) {
  const rng = state.rng.market, t = state.t, w = WEATHER[state.weather.id], fx = state.fx;
  const dr = driftTotals(state), shock = state.fxShock;
  const volM = w.vol * (1 + 0.2 * Math.max(0, state.macro.fear - 50) / 50);

  // --- systematic factors
  const jz = rng.chance(0.0012 * w.vol) ? rng.normal(0, 0.03) : 0, jump = jz < 0 ? jz * 1.5 : jz * 0.7; // market-wide shocks: crashes cut deeper than rallies
  fx.MKT = 0.15 * fx.MKT + (dr.MKT || 0) + w.drift + 0.0004 * state.mktSent + volM * 0.0026 * rng.normal() + jump + (shock.MKT || 0);
  fx.CONS = 0.2 * fx.CONS + (dr.CONS || 0) + 0.0001 * (state.macro.growth - 2.6) + 0.002 * rng.normal() + (shock.CONS || 0);
  fx.CRYPTO = 0.1 * fx.CRYPTO + (dr.CRYPTO || 0) + 0.009 * volM * rng.normal() + (shock.CRYPTO || 0);
  fx.AIF = 0.12 * fx.AIF + (dr.AIF || 0) + 0.006 * volM * rng.normal() + (shock.AIF || 0);
  fx.GREENF = 0.1 * fx.GREENF + (dr.GREENF || 0) + 0.004 * rng.normal() + (shock.GREENF || 0);
  const mo = state.macro;
  const oilRet = 0.01 * Math.log(mo.oilTarget / mo.oil) + 0.0045 * volM * rng.normal() + (dr.OIL || 0) + (shock.OIL || 0);
  fx.OIL = oilRet; mo.oil = clamp(mo.oil * Math.exp(oilRet), 20, 260);
  for (const s in fx.S) fx.S[s] = 0.1 * fx.S[s] + (dr['S:' + s] || 0) + 0.0022 * volM * rng.normal() + (shock['S:' + s] || 0);
  state.fxShock = {};
  for (const k of FACTORS) state.cum[k] = state.cum[k] * (1 - CUM_DECAY[k]) + fx[k];
  for (const s in fx.S) state.cum.S[s] = (state.cum.S[s] || 0) * (1 - SEC_DECAY) + fx.S[s];
  for (const s in state.premium) {
    const tg = state.premiumTarget[s] ?? 1;
    state.premium[s] *= Math.exp(0.012 * Math.log(tg / state.premium[s]));
  }

  // --- impulses this tick
  const imp = {}, pump = {};
  if (state.impulses.length) {
    const keep = [];
    for (const p of state.impulses) {
      if (p.start > t) { keep.push(p); continue; }
      if (p.left != null) { const a = p.rem / p.left; pump[p.t] = (pump[p.t] || 0) + a; p.rem -= a; if (--p.left > 0) keep.push(p); continue; } // Market God pump: even drift over p.left ticks
      const a = p.rem * p.rate;
      imp[p.t] = (imp[p.t] || 0) + a; p.rem -= a;
      if (Math.abs(p.rem) > 2e-5) keep.push(p);
    }
    state.impulses = keep;
  }

  // --- companies
  // Candle microstructure (wicks, opening gaps, volume) uses its own RNG stream, so it never
  // changes the price path. The first session of each day opens with a gap from the previous close.
  const mic = state.rng.micro, s0 = sessionOf(t) === 0, SESS_VOL = [1.6, 1.05, 0.8, 0.8, 1, 1.45];
  const godVol = state.god?.vol ?? 1, godLuck = state.player ? state.god?.luck ?? 0 : 0;
  let capNum = 0, sentNum = 0;
  for (const tk of state.order) {
    const c = state.companies[tk], L = c.loads;
    const F = L.beta * fx.MKT + L.os * fx.OIL + L.cs * fx.CONS + L.cr * fx.CRYPTO
      + (L.th.AI || 0) * fx.AIF + (L.th.GREEN || 0) * fx.GREENF + fx.S[c.sector];
    const volC = w.vol * (c.tier === 'spec' ? 1 + 0.6 * (w.vol - 1) : c.tier === 'growth' ? 1 + 0.25 * (w.vol - 1) : 1);
    // Blue chips are calm, speculative names are wild. Most sessions lean slightly up,
    // but company-specific shocks are lopsided: drops land harder than pops.
    // god mode (admin-controlled, per player): scales volatility and tilts the player's own positions
    const sigma = c.vol * 0.021 * volC * TIER_VOL[c.tier] * godVol;
    let I = sigma * (rng.normal() + UP_LEAN);
    if (godLuck) { const pl = state.player; if (pl.holdings[c.ticker]) I += godLuck * 0.25 * sigma; else if (pl.shorts?.[c.ticker]) I -= godLuck * 0.25 * sigma; }
    if (rng.chance(0.0035 * (c.vol / 0.3) * w.vol)) { const z = rng.normal(); I += sigma * (z < 0 ? z * 6 : z * 3); }
    const dev = Math.log(effectiveValue(state, c) / c.price);
    const corr = clamp(KAPPA[c.tier] * dev, -0.03, 0.03);
    const rot = L.def * w.rot;
    const nonSent = F + I + corr + rot + (dr['T:' + tk] || 0) + (imp[tk] || 0);
    const r = clamp(nonSent + 0.0006 * c.sentiment, -0.4, 0.4) + (pump[tk] || 0);
    c.info = c.info * (1 - 0.0008) + 0.6 * I;
    const np = Math.max(0.01, round(c.price * Math.exp(r), 4));
    const bo = round(s0 ? c.price * Math.exp(r * 0.6) : c.price, 4);
    const wu = Math.abs(mic.normal(0, 0.55)) * sigma, wd = Math.abs(mic.normal(0, 0.55)) * sigma;
    const bh = round(Math.max(bo, np) * Math.exp(wu), 4), bl = round(Math.min(bo, np) * Math.exp(-wd), 4);
    const z = Math.abs(r) / Math.max(sigma, 1e-4);
    const bv = Math.round(c.shares * 0.0025 / TPD * SESS_VOL[sessionOf(t)] * (0.55 + 0.45 * z + 0.02 * Math.min(c.buzz, 60)) * Math.exp(mic.normal(0, 0.28)));
    c.ret1 = Math.log(np / c.price);
    c.price = np;
    c.sentiment = clamp(c.sentiment * 0.992 + 3 * nonSent, -1, 1);
    c.buzz *= 0.996;
    if (s0) { c.dayOpen = bo; c.dayHigh = bh; c.dayLow = bl; c.dayVol = bv; }
    else { if (bh > c.dayHigh) c.dayHigh = bh; if (bl < c.dayLow) c.dayLow = bl; c.dayVol = (c.dayVol || 0) + bv; }
    c.ticks.push(np); if (c.ticks.length > 144) c.ticks.shift();
    (c.bars ||= []).push([bo, bh, bl, np, bv]); if (c.bars.length > 240) c.bars.shift();
    const cap = np * c.shares; capNum += cap; sentNum += cap * c.sentiment;
  }
  state.mktSent = clamp(0.6 * (sentNum / capNum) + 0.4 * mo.confidence, -1, 1);

  // --- index + fear
  const lvl = round(capNum / state.idx.divisor, 3);
  state.idx.level = lvl; state.idx.ticks.push(lvl); if (state.idx.ticks.length > 720) state.idx.ticks.shift();
  updateFear(state);
}

function updateFear(state) {
  const tks = state.idx.ticks, mo = state.macro;
  const n = Math.min(30, tks.length - 1);
  const rets = []; for (let i = tks.length - n; i < tks.length; i++) rets.push(Math.log(tks[i] / tks[i - 1]));
  const rv = n > 5 ? std(rets) : 0.0035;
  const hi = Math.max(...tks.slice(-240));
  const dd = Math.max(0, (hi - tks[tks.length - 1]) / hi * 100);
  state.idx.dd = dd; state.idx.rv = rv;
  const stress = (mo.stress.banking + mo.stress.crypto * 0.4);
  const target = clamp(15 + Math.min(dd, 30) * 1.1 + Math.max(0, rv - 0.0036) * 5000 + stress * 0.3 + mo.fearBoost, 5, 99);
  mo.fear = round(0.9 * mo.fear + 0.1 * target, 2);
  mo.fearBoost *= 0.97;
}

/** Daily fundamentals, dividends, earnings. Called at the first session of each day. */
export function dailyFundamentals(state, hooks) {
  const day = dayOf(state.t), dq = day % 90, mo = state.macro;
  state.drifts = state.drifts.filter(d => d.until > state.t);
  for (const tk of [...state.order]) {
    const c = state.companies[tk];
    const gEff = c.growth + 0.012 * c.loads.cs * (mo.growth - 2.6);
    c.revenue *= Math.exp(gEff / 360);
    c.cash += (c.revenue * c.margin) / 360;
    c.fv = fundamentalValue(c, mo);
    c.rep = clamp(c.rep + (c.sentiment * 0.03), 5, 99);
    if (c.takeover && c.takeover.until < state.t) c.takeover = null;
    if (dq === c.reportOffset && day - (c.listedDay ?? -999) > 20) hooks.earnings(state, c);
    if (dq === c.divOffset && c.div > 0 && c.margin > 0.03) hooks.dividend(state, c);
    if (c.margin < 0) hooks.cashCheck(state, c);
  }
}

export function closeDay(state) {
  const day = dayOf(state.t);
  for (const tk of state.order) {
    const c = state.companies[tk];
    c.daily.push([round(c.dayOpen, 4), round(c.dayHigh, 4), round(c.dayLow, 4), round(c.price, 4), Math.round(c.dayVol || 0)]);
    if (c.daily.length > 1500) c.daily.shift();
    c.prevClose = c.price; c.dayOpen = c.price; c.dayHigh = c.price; c.dayLow = c.price;
  }
  state.idx.daily.push(state.idx.level); if (state.idx.daily.length > 1500) state.idx.daily.shift();
  state.idx.prevClose = state.idx.level;
  // sector indices (cap-weighted daily returns compounded)
  for (const s in state.secIdx) {
    let num = 0, den = 0;
    for (const tk of state.order) { const c = state.companies[tk]; if (c.sector !== s) continue; const d = c.daily[c.daily.length - 1]; if (!d || c.daily.length < 2) continue; const prev = c.daily[c.daily.length - 2][3]; const cap = prev * c.shares; num += cap * (d[3] / prev - 1); den += cap; }
    const si = state.secIdx[s]; si.level = round(si.level * (1 + (den ? num / den : 0)), 3); si.daily.push(si.level); if (si.daily.length > 1500) si.daily.shift();
  }
  state.macroHist.push({ day, rate: mo2(state).rate, infl: round(mo2(state).inflation, 2), growth: round(mo2(state).growth, 2), unemp: round(mo2(state).unemployment, 2), oil: round(mo2(state).oil, 1), fear: round(mo2(state).fear, 1), conf: round(mo2(state).confidence, 3) });
  if (state.macroHist.length > 1500) state.macroHist.shift();
}
const mo2 = s => s.macro;

export function updateWeather(state) {
  const mo = state.macro, idx = state.idx, d = idx.daily;
  const ret10 = d.length > 10 ? d[d.length - 1] / d[d.length - 11] - 1 : 0;
  const prev = state.weather.id, since = dayOf(state.t) - state.weather.since;
  const fear = mo.fear, dd = idx.dd || 0;
  let next;
  const wasStorm = prev === 'panic' || prev === 'thunder';
  if (fear >= 75 || (prev === 'panic' && fear >= 60)) next = 'panic';
  else if (wasStorm && ret10 > 0.02 && fear < 58) next = 'recovery';
  else if (prev === 'recovery' && since < 7 && fear < 52) next = 'recovery';
  else if (fear >= 52 || (prev === 'thunder' && fear >= 45) || dd >= 20) next = 'thunder';
  else if (idx.rv > 0.0068 && Math.abs(ret10) < 0.05) next = 'volatile';
  else if (ret10 >= 0.02 && fear < 38) next = 'sunshine';
  else next = 'fog';
  const minStay = prev === 'panic' ? 2 : 3;
  if (next !== prev && (since >= minStay || next === 'panic')) {
    state.weather = { id: next, since: dayOf(state.t), prev };
    return { from: prev, to: next };
  }
  return null;
}

export function financialCondition(c, macro) {
  const burn = c.margin < 0 ? (c.revenue * -c.margin) / 360 : 0;
  const runway = burn > 0 ? c.cash / burn : Infinity;
  let score = 50 + c.margin * 90 + c.growth * 14 - Math.max(0, c.debtEq - 0.8) * 12 + (c.rep - 60) * 0.3;
  if (runway < 365) score -= (365 - runway) / 10;
  score = clamp(score, 0, 100);
  const label = score >= 75 ? 'Excellent' : score >= 58 ? 'Strong' : score >= 42 ? 'Stable' : score >= 26 ? 'Strained' : 'Distressed';
  return { score: Math.round(score), label, runwayDays: runway === Infinity ? null : Math.round(runway) };
}
export function volRating(v) { return v < 0.2 ? 'Low' : v < 0.35 ? 'Moderate' : v < 0.55 ? 'High' : v < 0.8 ? 'Very high' : 'Extreme'; }
export function sentimentLabel(s) { return s > 0.55 ? 'Euphoric' : s > 0.2 ? 'Bullish' : s > -0.2 ? 'Neutral' : s > -0.55 ? 'Bearish' : 'Fearful'; }
export const dayChange = c => c.price / c.prevClose - 1;

/** remove a company from the market (acquisition / bankruptcy), settling every holder */
export function delistCompany(state, c, kind, settlePrice, hooks) {
  if (c.status !== 'active') return;
  const capBefore = totalCap(state);
  c.status = kind; c.delistTick = state.t; c.settle = round(settlePrice, 4);
  state.order = state.order.filter(t => t !== c.ticker);
  state.impulses = state.impulses.filter(p => p.t !== c.ticker);
  const capAfter = totalCap(state);
  state.idx.divisor *= capAfter / capBefore;
  c.price = Math.max(0.0001, settlePrice);
  hooks.settle(state, c);
}
export function listCompany(state, def, ipoPrice) {
  const capBefore = totalCap(state);
  const c = createCompany({ ...def, p: ipoPrice }, state, state.t, true);
  c.listedDay = dayOf(state.t);
  state.companies[c.ticker] = c; state.order.push(c.ticker); state.order.sort();
  state.fx.S[c.sector] = state.fx.S[c.sector] ?? 0; state.cum.S[c.sector] = state.cum.S[c.sector] ?? 0;
  const capAfter = totalCap(state);
  state.idx.divisor *= capAfter / capBefore;
  return c;
}
export { dateOf };
