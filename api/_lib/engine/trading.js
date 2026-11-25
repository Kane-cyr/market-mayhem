// Player trading. All money is held as INTEGER CENTS so balances can never drift or duplicate.
import { WEATHER } from './market.js';
import { TPD } from './calendar.js';
import { clamp, round } from './util.js';

export const MAX_ORDERS = 20, MAX_SHARES = Infinity; // no limit on how many shares an order can trade
// Trading is fee-free. Runs started before that change are replayed with the old rules (see game.js).
export const RULES = { legacyFees: false };
const FEE_RATE = 0.001, MIN_FEE = 100;
const SPREAD_BPS = { blue: 6, growth: 12, spec: 35 };

export function createPlayer(cashCents) {
  return {
    cash: cashCents, startCash: cashCents, holdings: {}, orders: [], log: [], realized: 0, fees: 0, dividends: 0,
    watchlist: ['NRLT', 'VLTD', 'PGEN', 'HVEX'], following: [],
    stats: { trades: 0, wins: 0, losses: 0, streak: 0, bestStreak: 0, dividendCount: 0, orderFills: 0, peakNW: cashCents, maxDD: 0, bestPct: 0, worstPct: 0 },
    achievements: {}, rep: 0, level: 0, nwHistory: [], prevDayNW: cashCents, startDay: 0,
    dd: { peak: cashCents, trough: cashCents, active: false, depth: 0 },
    challenges: { offers: [], active: null, done: [], failed: [] }, lastClose: null, ids: { order: 0 }, notifications: [],
  };
}

const validShares = n => Number.isInteger(n) && n > 0 && n <= MAX_SHARES;
const err = error => ({ ok: false, error });

export function quote(S, ticker) {
  const c = S.companies[ticker];
  if (!c || c.status !== 'active') return null;
  const w = WEATHER[S.weather.id];
  const hs = (SPREAD_BPS[c.tier] / 10000) * Math.pow(w.vol, 1.3) / 2;
  const mid = c.price * 100;
  return { mid, bid: Math.max(1, Math.floor(mid * (1 - hs))), ask: Math.ceil(mid * (1 + hs)), halfSpread: hs, spreadBps: hs * 2e4 };
}

function execPrice(S, c, side, shares) {
  const q = quote(S, c.ticker);
  const notional = shares * c.price;
  const adv = Math.max(c.price * c.shares * 0.003, 1e6);
  const impact = Math.min(0.05, 0.1 * notional / adv);
  const hs = q.halfSpread + impact;
  const px = side === 'buy' ? Math.ceil(q.mid * (1 + hs)) : Math.max(1, Math.floor(q.mid * (1 - hs)));
  return { px, impactBps: impact * 1e4, spreadBps: q.spreadBps };
}
const feeFor = gross => RULES.legacyFees ? Math.max(MIN_FEE, Math.round(gross * FEE_RATE)) : 0;

export function preview(S, ticker, side, shares) {
  const c = S.companies[ticker];
  if (!c || c.status !== 'active') return err('This stock is not currently tradable.');
  if (!validShares(shares)) return err('Enter a whole number of shares (at least 1).');
  const e = execPrice(S, c, side, shares); const gross = e.px * shares; const fee = feeFor(gross);
  return { ok: true, px: e.px, gross, fee, total: side === 'buy' ? gross + fee : gross - fee, impactBps: e.impactBps, spreadBps: e.spreadBps };
}

export function buy(S, ticker, shares, o = {}) {
  const p = S.player; const pv = preview(S, ticker, 'buy', shares);
  if (!pv.ok) return pv;
  if (pv.total > p.cash) return err('Not enough cash for that order.');
  const c = S.companies[ticker];
  p.cash -= pv.total; p.fees += pv.fee;
  const h = p.holdings[ticker] || (p.holdings[ticker] = { shares: 0, cost: 0, since: S.t, emerging: c.emerging, panicBuy: false, buyPx: 0 });
  h.buyPx = (h.buyPx * h.shares + pv.px * shares) / (h.shares + shares);
  h.shares += shares; h.cost += pv.gross + pv.fee;
  if (S.weather.id === 'panic' || S.weather.id === 'thunder') h.panicBuy = true;
  p.log.push({ type: 'buy', t: S.t, ticker, shares, price: pv.px, fee: pv.fee, total: pv.total, src: o.source || 'manual' });
  if (p.log.length > 600) p.log.shift();
  p.stats.firstTrade = p.stats.firstTrade ?? S.t;
  return { ok: true, side: 'buy', ticker, shares, price: pv.px, fee: pv.fee, total: pv.total };
}

export function sell(S, ticker, shares, o = {}) {
  const p = S.player, h = p.holdings[ticker];
  if (!h) return err('You do not own this stock.');
  if (!validShares(shares)) return err('Enter a whole number of shares (at least 1).');
  if (shares > h.shares) return err(`You only own ${h.shares} shares.`);
  const pv = preview(S, ticker, 'sell', shares);
  if (!pv.ok) return pv;
  const basis = shares === h.shares ? h.cost : Math.round(h.cost * shares / h.shares);
  p.cash += pv.total; p.fees += pv.fee;
  const info = { heldTicks: S.t - h.since, panicBuy: h.panicBuy, emerging: h.emerging, buyPx: h.buyPx, sector: S.companies[ticker].sector };
  h.shares -= shares; h.cost -= basis;
  if (h.shares === 0) delete p.holdings[ticker];
  const pnl = recordClose(S, ticker, shares, pv.total, basis, pv.fee, 'sell', pv.px / 100, info, o.source);
  return { ok: true, side: 'sell', ticker, shares, price: pv.px, fee: pv.fee, total: pv.total, pnl };
}

/** shared bookkeeping for any closing trade (sell, acquisition, bankruptcy) */
export function recordClose(S, ticker, shares, proceeds, basis, fee, kind, price, info = {}, src) {
  const p = S.player; const pnl = proceeds - basis; const pct = basis > 0 ? pnl / basis : 0;
  p.realized += pnl; p.stats.trades++;
  if (pnl > 0) { p.stats.wins++; p.stats.streak++; p.stats.bestStreak = Math.max(p.stats.bestStreak, p.stats.streak); } else { p.stats.losses++; p.stats.streak = 0; }
  p.stats.bestPct = Math.max(p.stats.bestPct, pct); p.stats.worstPct = Math.min(p.stats.worstPct, pct);
  p.log.push({ type: kind, t: S.t, ticker, shares, price: Math.round(price * 100), fee, total: proceeds, pnl, pct: round(pct, 4), src: src || 'manual' });
  if (p.log.length > 600) p.log.shift();
  p.lastClose = { t: S.t, ticker, pnl, pct, kind, ...info };
  return pnl;
}

export function placeOrder(S, o) {
  const p = S.player; const c = S.companies[o.ticker];
  if (!c || c.status !== 'active') return err('This stock is not currently tradable.');
  if (!['buy', 'sell'].includes(o.side) || !['limit', 'stop'].includes(o.type)) return err('Invalid order type.');
  if (!validShares(o.shares)) return err('Enter a whole number of shares (at least 1).');
  if (!(o.price > 0) || !isFinite(o.price)) return err('Enter a valid trigger price.');
  if (p.orders.length >= MAX_ORDERS) return err('You have too many open orders.');
  if (o.side === 'sell') { const h = p.holdings[o.ticker]; const pending = p.orders.filter(x => x.ticker === o.ticker && x.side === 'sell').reduce((a, x) => a + x.shares, 0); if (!h || o.shares + pending > h.shares) return err('Those shares are not available to sell.'); }
  const order = { id: ++p.ids.order, ticker: o.ticker, side: o.side, type: o.type, shares: o.shares, price: round(o.price, 2), created: S.t, expires: S.t + TPD * 30, startPrice: c.price };
  p.orders.push(order);
  return { ok: true, order };
}
export function cancelOrder(S, id) {
  const i = S.player.orders.findIndex(o => o.id === id);
  if (i < 0) return err('Order not found.');
  S.player.orders.splice(i, 1); return { ok: true };
}

export function processOrders(S) {
  const p = S.player; if (!p.orders.length) return [];
  const fills = [];
  for (const o of [...p.orders]) {
    const c = S.companies[o.ticker];
    if (!c || c.status !== 'active') { p.orders = p.orders.filter(x => x.id !== o.id); continue; }
    if (o.expires < S.t) { p.orders = p.orders.filter(x => x.id !== o.id); p.notifications.push({ t: S.t, text: `Order expired: ${o.side} ${o.shares} ${o.ticker} @ $${o.price.toFixed(2)}` }); continue; }
    const px = c.price;
    const hit = (o.type === 'limit' && ((o.side === 'buy' && px <= o.price) || (o.side === 'sell' && px >= o.price)))
      || (o.type === 'stop' && ((o.side === 'sell' && px <= o.price) || (o.side === 'buy' && px >= o.price)));
    if (!hit) continue;
    p.orders = p.orders.filter(x => x.id !== o.id);
    const res = o.side === 'buy' ? buy(S, o.ticker, o.shares, { source: 'order' }) : sell(S, o.ticker, o.shares, { source: 'order' });
    if (res.ok) { p.stats.orderFills++; fills.push({ order: o, res }); p.notifications.push({ t: S.t, text: `${o.type === 'stop' ? 'Stop' : 'Limit'} order filled: ${o.side} ${o.shares} ${o.ticker} @ $${(res.price / 100).toFixed(2)}`, kind: 'fill' }); }
    else p.notifications.push({ t: S.t, text: `Order cancelled (${res.error}): ${o.side} ${o.shares} ${o.ticker}`, kind: 'warn' });
  }
  return fills;
}

export function positions(S) {
  const p = S.player; const out = []; let total = 0;
  for (const t of Object.keys(p.holdings)) {
    const h = p.holdings[t], c = S.companies[t]; if (!c) continue;
    const value = Math.round(h.shares * c.price * 100); total += value;
    out.push({ ticker: t, shares: h.shares, value, cost: h.cost, pnl: value - h.cost, pct: h.cost ? (value - h.cost) / h.cost : 0, avg: h.cost / h.shares / 100, since: h.since, sector: c.sector, dayPnl: Math.round(h.shares * (c.price - c.prevClose) * 100) });
  }
  for (const x of out) x.weight = total ? x.value / total : 0;
  return out.sort((a, b) => b.value - a.value);
}
export function netWorth(S) {
  const p = S.player; let pos = 0;
  for (const t in p.holdings) { const c = S.companies[t]; if (c) pos += Math.round(p.holdings[t].shares * c.price * 100); }
  const debt = (p.loans?.list || []).reduce((a, l) => a + l.owed, 0); // loan-shark debt counts against you
  let shorts = 0; for (const t in p.shorts || {}) { const c = S.companies[t]; if (c) shorts += Math.round(p.shorts[t].shares * c.price * 100); } // what it costs to buy your shorts back
  return { cash: p.cash, positions: pos, debt, shorts, total: p.cash + pos - debt - shorts };
}
export const sectorWeights = S => { const w = {}; for (const x of positions(S)) w[x.sector] = (w[x.sector] || 0) + x.value; return w; };
export { clamp };
