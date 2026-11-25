// Short selling: borrow shares, sell them now, buy them back later. Profit if the price falls;
// unlimited loss if it rises. The broker wants equity of at least 50% of your short exposure to open
// a short, and margin-calls you (force-covers everything) if equity drops below 30%.
// All money is integer cents. Cash never goes negative: if a forced cover cannot be paid for, the
// broker sells your shares, and any shortfall becomes a broker loan that the collectors will chase.
import { preview, recordClose, sell, positions } from './trading.js';
import { TPD } from './calendar.js';

export const SHORT_UNLOCK_LEVEL = 1, INIT_MARGIN = 0.5, MAINT_MARGIN = 0.3, BORROW_FEE_DAY = 0.0006;
const err = error => ({ ok: false, error });
const validShares = n => Number.isInteger(n) && n > 0;

export const shortsOf = S => (S.player.shorts ||= {});
import { RULES } from './trading.js';
export function shortValue(S) {
  let v = 0; const sh = S.player.shorts || {};
  for (const t in sh) { const c = S.companies[t]; if (c) v += Math.round(sh[t].shares * c.price * 100); }
  return v;
}
export function shortPositions(S) {
  const out = [], sh = S.player.shorts || {};
  for (const t in sh) { const c = S.companies[t]; if (!c) continue; const x = sh[t], value = Math.round(x.shares * c.price * 100);
    out.push({ ticker: t, shares: x.shares, value, proceeds: x.proceeds, pnl: x.proceeds - value, pct: x.proceeds ? (x.proceeds - value) / x.proceeds : 0, avg: x.proceeds / x.shares / 100, since: x.since, sector: c.sector }); }
  return out.sort((a, b) => b.value - a.value);
}
// equity: what you would have if every position closed now (mirrors netWorth without importing it)
function equity(S) {
  const p = S.player; let v = p.cash;
  for (const t in p.holdings) { const c = S.companies[t]; if (c) v += Math.round(p.holdings[t].shares * c.price * 100); }
  v -= (p.loans?.list || []).reduce((a, l) => a + l.owed, 0);
  return v - shortValue(S);
}

export function previewShort(S, ticker, shares) {
  const p = S.player;
  if ((p.level ?? 0) < SHORT_UNLOCK_LEVEL) return err('Short selling unlocks at Active Trader ($12K net worth).');
  if (p.holdings[ticker]) return err('Sell your shares before shorting this stock.');
  const pv = preview(S, ticker, 'sell', shares); if (!pv.ok) return pv;
  const after = shortValue(S) + Math.round(shares * S.companies[ticker].price * 100), eq = equity(S) - pv.fee;
  if (eq < after * INIT_MARGIN) return err(`Your broker needs equity of at least 50% of your shorts. Max about ${Math.max(0, Math.floor((eq / INIT_MARGIN - shortValue(S)) / (S.companies[ticker].price * 100)))} shares.`);
  return pv;
}

export function short(S, ticker, shares) {
  if (!validShares(shares)) return err('Enter a whole number of shares (at least 1).');
  const pv = previewShort(S, ticker, shares); if (!pv.ok) return pv;
  const p = S.player, sh = shortsOf(S), x = sh[ticker] || (sh[ticker] = { shares: 0, proceeds: 0, since: S.t });
  p.cash += pv.total; p.fees += pv.fee; x.shares += shares; x.proceeds += pv.total;
  p.log.push({ type: 'short', t: S.t, ticker, shares, price: pv.px, fee: pv.fee, total: pv.total, src: 'manual' }); if (p.log.length > 600) p.log.shift();
  p.stats.firstTrade = p.stats.firstTrade ?? S.t;
  return { ok: true, side: 'short', ticker, shares, price: pv.px, fee: pv.fee, total: pv.total };
}

export function previewCover(S, ticker, shares) {
  const x = S.player.shorts?.[ticker]; if (!x) return err('You are not short this stock.');
  if (shares > x.shares) return err(`You are only short ${x.shares} shares.`);
  return preview(S, ticker, 'buy', shares);
}
export function cover(S, ticker, shares, o = {}) {
  if (!validShares(shares)) return err('Enter a whole number of shares (at least 1).');
  const pv = previewCover(S, ticker, shares); if (!pv.ok) return pv;
  const p = S.player; if (pv.total > p.cash) return err('Not enough cash to buy the shares back.');
  return doCover(S, ticker, shares, pv.total, pv.px, pv.fee, o.source || 'manual');
}
function doCover(S, ticker, shares, cost, px, fee, src) {
  const p = S.player, sh = shortsOf(S), x = sh[ticker];
  const basis = shares === x.shares ? x.proceeds : Math.round(x.proceeds * shares / x.shares);
  p.cash -= cost; p.fees += fee; x.shares -= shares; x.proceeds -= basis;
  if (x.shares === 0) delete sh[ticker];
  // for a short, the "proceeds" of the round trip are what you received when opening; "basis" is the buy-back cost
  const pnl = recordClose(S, ticker, shares, basis, cost, fee, 'cover', px / 100, { sector: S.companies[ticker]?.sector, short: true }, src);
  if (pnl > 0 && basis > 0 && pnl / basis >= 0.25) award(S, 'big_short');
  return { ok: true, side: 'cover', ticker, shares, price: px, fee, total: cost, pnl };
}

// Hooked in by progress.js to avoid a circular import.
let award = () => {};
export function setAward(fn) { award = fn; }
let toBroker = () => {};
export function setBrokerDebt(fn) { toBroker = fn; }

/** buy back a short no matter what: sell longs to raise cash, and turn any shortfall into broker debt */
function forceCover(S, ticker, priceCents, src) {
  const p = S.player, x = p.shorts?.[ticker]; if (!x) return;
  const fee = Math.max(100, Math.round(x.shares * priceCents * 0.001)), cost = x.shares * priceCents + fee;
  for (const q of positions(S)) { if (p.cash >= cost) break; const h = p.holdings[q.ticker]; if (h) sell(S, q.ticker, h.shares, { source: 'margin' }); }
  if (p.cash >= cost) { doCover(S, ticker, x.shares, cost, priceCents, fee, src); return; }
  const short = cost - p.cash; // pay what we can, the broker lends the rest
  doCover(S, ticker, x.shares, p.cash, priceCents, fee, src);
  toBroker(S, short);
}

/** every tick: margin call if equity falls below 30% of short exposure */
export function marginCheck(S) {
  const sh = S.player.shorts; if (!sh || !Object.keys(sh).length) return;
  const val = shortValue(S); if (!val) return;
  const eq = equity(S), p = S.player;
  if (eq >= val * MAINT_MARGIN) { if (eq < val * 0.4 && p.marginWarn !== Math.floor(S.t / TPD)) { p.marginWarn = Math.floor(S.t / TPD); p.notifications.push({ t: S.t, kind: 'warn', text: 'Margin warning: your shorts are moving against you. Below 30% equity the broker covers everything.' }); } return; }
  const names = Object.keys(sh);
  for (const t of names) { const c = S.companies[t]; if (c) forceCover(S, t, Math.ceil(c.price * 100 * 1.002), 'margin'); }
  p.notifications.push({ t: S.t, kind: 'warn', text: `MARGIN CALL. Your broker bought back ${names.join(', ')} at market.` });
  (p.scenes ||= []).push({ kind: 'margin', t: S.t, tickers: names });
  award(S, 'squeezed');
}

/** daily borrow fee, charged on the value of your shorts */
export function shortsDaily(S) {
  const val = shortValue(S); if (!val) return;
  if (!RULES.legacyFees) return; // no borrow fee any more
  const p = S.player, fee = Math.min(p.cash, Math.round(val * BORROW_FEE_DAY));
  if (fee > 0) { p.cash -= fee; p.fees += fee; }
}

/** dividends: a short seller pays the dividend to the lender */
export function shortDividend(S, c, dps) {
  const x = S.player.shorts?.[c.ticker]; if (!x) return;
  const owe = Math.min(S.player.cash, Math.floor(x.shares * dps * 100)); S.player.cash -= owe;
}

/** delisting: bankruptcies close shorts at the (near zero) settle price; takeovers at the bid */
export function settleShort(S, c) {
  if (!S.player.shorts?.[c.ticker]) return;
  forceCover(S, c.ticker, Math.max(1, Math.round(c.settle * 100)), c.status === 'acquired' ? 'acquired' : 'bankrupt');
}
