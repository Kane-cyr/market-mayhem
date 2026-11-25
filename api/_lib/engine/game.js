// Game orchestration: create, step, advance, trade wrappers, save/load.
import { RNG, makeStreams, STREAMS, hashString } from './rng.js';
import { TPD, dayOf, sessionOf } from './calendar.js';
import { COMPANIES, RESERVE, SECTORS } from './data/companies.js';
import { createCompany, stepMarket, dailyFundamentals, closeDay, updateWeather, totalCap, WEATHER } from './market.js';
import { createMacro, dailyMacro, scheduledMacro } from './macro.js';
import { processQueue, randomNews, publishCustom } from './news.js';
import { createEvents, eventsTick, rollEvents } from './events.js';
import { createInfluencers, assignAgendas, socialTick, socialDaily } from './social.js';
import { createRivals, rivalsDaily, rivalNetWorth } from './rivals.js';
import { corporateHooks, maybeIPO } from './corporate.js';
import * as trading from './trading.js';
import { progressDaily, afterTrade, acceptChallenge } from './progress.js';
import { insiderDaily, onTrade, isSuspended, buyTip, meet } from './insider.js';
import { loansDaily, borrow, repay, sharkPay, sharkBeg } from './loans.js';
import { shortsDaily, short as shortSell, cover as coverShort } from './shorts.js';
import { explainMoves } from './explain.js';
import { lifeDaily, buyItem, pawnItem, hype as hypeStock } from './lifestyle.js';
import { hashString as hs2 } from './rng.js';
import { applyGod, godTick } from './god.js';
import { ensureLife } from './lifestyle.js';

export const SAVE_VERSION = 1;
export const START_CASH = 10000;

export function createGame({ seed = 1, startCash = START_CASH, warmupDays = 120 } = {}) {
  const S = {
    version: SAVE_VERSION, seed, t: -1, startTick: 0, rng: makeStreams(seed), companies: {}, order: [], macro: createMacro(),
    weather: { id: 'fog', since: 0, prev: 'fog' }, fx: { MKT: 0, CONS: 0, CRYPTO: 0, AIF: 0, GREENF: 0, OIL: 0, S: {} },
    cum: { MKT: 0, CONS: 0, CRYPTO: 0, AIF: 0, GREENF: 0, OIL: 0, S: {} }, fxShock: {},
    premium: { AI: 1, CRYPTO: 1, GREEN: 1 }, premiumTarget: { AI: 1, CRYPTO: 1, GREEN: 1 },
    drifts: [], impulses: [], queue: [], news: [], posts: [], ids: {}, mktSent: 0, fundingStress: 0, suppressMajor: true, newsMult: 1, tplBoost: {},
    stats: { newsCount: 0, dividendsDeclared: 0, bankruptcies: 0, ipos: 0, majorEvents: 0 },
    idx: { divisor: 1, level: 1000, ticks: [], daily: [], prevClose: 1000, dd: 0, rv: 0.0035 }, secIdx: {}, macroHist: [],
    events: createEvents(), reserve: RESERVE.map(d => ({ ...d })), player: null, rivals: [], influencers: [],
  };
  for (const s of SECTORS) { S.fx.S[s] = 0; S.cum.S[s] = 0; S.secIdx[s] = { level: 100, daily: [] }; }
  for (const d of COMPANIES) { const c = createCompany(d, S, 0); S.companies[c.ticker] = c; S.order.push(c.ticker); }
  S.order.sort();
  S.idx.divisor = totalCap(S) / 1000; S.idx.ticks.push(1000);
  S.player = trading.createPlayer(Math.round(startCash * 100));
  S.influencers = createInfluencers(S); assignAgendas(S);
  S.rivals = createRivals(S);
  for (let i = 0; i < warmupDays * TPD; i++) step(S);
  // begin the player's session
  S.suppressMajor = false;
  S.startTick = S.t; S.startDay = dayOf(S.t);
  S.player = trading.createPlayer(Math.round(startCash * 100)); S.player.startDay = dayOf(S.t);
  ensureLife(S); // created up front so UI visits never change the simulation
  S.player.prevDayNW = S.player.cash; S.player.nwHistory = [S.player.cash];
  for (const r of S.rivals) { r.baseNW = rivalNetWorth(S, r); r.nw = [Math.round(r.baseNW)]; }
  S.news = S.news.slice(-60);
  return S;
}

export function step(S) {
  S.t++;
  const s = sessionOf(S.t);
  if (s === 0) dayStart(S);
  processQueue(S);
  scheduledMacro(S);
  eventsTick(S);
  randomNews(S);
  socialTick(S);
  godTick(S);
  stepMarket(S);
  const fills = trading.processOrders(S);
  if (fills.length) { afterTrade(S); for (const f of fills) onTrade(S, f.res); }
  if (s === TPD - 1) dayClose(S);
}

function dayStart(S) {
  dailyFundamentals(S, corporateHooks);
  dailyMacro(S);
  maybeIPO(S);
  rollEvents(S);
  socialDaily(S);
}

function dayClose(S) {
  explainMoves(S);
  closeDay(S);
  const ch = updateWeather(S);
  if (ch && S.t > TPD * 10) {
    const w = WEATHER[ch.to];
    publishCustom(S, { cat: 'Markets', sev: ch.to === 'panic' ? 4 : 2, status: 'confirmed', head: `Market weather: ${w.name}`, body: w.blurb, tickers: [], impact: {}, source: 'Mayhem Weather Desk' });
    if (S.player) S.player.notifications.push({ t: S.t, kind: 'weather', text: `Market weather turns: ${w.name}` });
  }
  rivalsDaily(S);
  loansDaily(S);
  shortsDaily(S);
  lifeDaily(S);
  progressDaily(S);
  insiderDaily(S);
  if (S.player.notifications.length > 80) S.player.notifications.splice(0, S.player.notifications.length - 80);
}

/** advance n ticks; returns { ticks, stopped } and optionally halts when a major event breaks */
export function advance(S, n, { stopOnMajor = false } = {}) {
  const n0 = S.news.length; let done = 0; let stopped = null;
  for (let i = 0; i < n; i++) {
    if (S.mode?.kind === 'weekly' && S.t >= S.mode.endT) { S.mode.done = true; break; }
    step(S); done++;
    if (S.mode?.kind === 'weekly' && S.t >= S.mode.endT) { S.mode.done = true; break; }
    if (stopOnMajor) {
      for (let k = Math.max(0, S.news.length - 4); k < S.news.length; k++) { const it = S.news[k]; if (it.major && it.t === S.t && S.news.length > n0) { stopped = it; break; } }
      if (stopped) break;
    }
  }
  return { ticks: done, stopped };
}

// ---- player actions (with progression hooks)
const SUSPENDED = { ok: false, error: 'Your account is suspended from buying by the Securities Commission.' };
const OVER = { ok: false, error: 'This challenge has finished.' };
// Every action that can change the outcome goes through ACTIONS. In a weekly run each successful
// call is logged as [tick, name, ...args] so the server can replay the run and verify the score.
const ACTIONS = {
  buy: (S, ticker, shares) => { if (S.mode?.done) return OVER; if (isSuspended(S)) return SUSPENDED; const r = trading.buy(S, ticker, shares); if (r.ok) { afterTrade(S); onTrade(S, r); } return r; },
  sell: (S, ticker, shares) => { if (S.mode?.done) return OVER; const r = trading.sell(S, ticker, shares); if (r.ok) { afterTrade(S); onTrade(S, r); } return r; },
  order: (S, o) => { if (S.mode?.done) return OVER; if (o?.side === 'buy' && isSuspended(S)) return SUSPENDED; return trading.placeOrder(S, o); },
  cancel: (S, id) => trading.cancelOrder(S, id),
  short: (S, t, n) => { if (S.mode?.done) return OVER; if (isSuspended(S)) return SUSPENDED; const r = shortSell(S, t, n); if (r.ok) { afterTrade(S); onTrade(S, r); } return r; },
  cover: (S, t, n) => { if (S.mode?.done) return OVER; const r = coverShort(S, t, n); if (r.ok) { afterTrade(S); onTrade(S, r); } return r; },
  hype: (S, t) => { if (S.mode?.done) return OVER; return hypeStock(S, t); },
  tip: (S, id) => buyTip(S, id), meet: (S, id) => meet(S, id), borrow: (S, id, amt, pledge) => borrow(S, id, amt, pledge), repay: (S, id, amt) => repay(S, id, amt), sharkpay: (S, id) => sharkPay(S, id), sharkbeg: (S, id) => sharkBeg(S, id),
  item: (S, id) => buyItem(S, id), pawn: (S, uid) => pawnItem(S, uid), challenge: (S, id) => acceptChallenge(S, id),
  god: (S, payload) => { applyGod(S, payload); return { ok: true }; },
};
export function perform(S, name, ...args) {
  const fn = ACTIONS[name]; if (!fn) return { ok: false, error: 'Unknown action.' };
  const r = fn(S, ...args);
  if (S.mode?.kind === 'weekly' && r?.ok !== false) { const a = (S.actions ||= []); a.push([S.t, name, ...JSON.parse(JSON.stringify(args))]); }
  return r;
}
export const buyShares = (S, t, n) => perform(S, 'buy', t, n);
export const sellShares = (S, t, n) => perform(S, 'sell', t, n);
export const placeOrder = (S, o) => perform(S, 'order', o);
export const shortShares = (S, t, n) => perform(S, 'short', t, n);
export const coverShares = (S, t, n) => perform(S, 'cover', t, n);
export const hype = (S, t) => perform(S, 'hype', t);
const wrap = name => (S, ...a) => perform(S, name, ...a);
const _buyTip = wrap('tip'), _meet = wrap('meet'), _borrow = wrap('borrow'), _repay = wrap('repay'), _buyItem = wrap('item'), _pawnItem = wrap('pawn'), _accept = wrap('challenge');
export { _buyTip as buyTip, _meet as meet, _borrow as borrow, _repay as repay, _buyItem as buyItem, _pawnItem as pawnItem, _accept as acceptChallenge };
export const godSync = (S, payload) => perform(S, 'god', payload);

/** Rebuild a weekly run from its starting god settings and action log. Throws on any malformed or
 * impossible log. Returns the final state; the caller compares net worth with the claimed score. */
export function replayRun({ week, god, days }, actions, { maxActions = 20000 } = {}) {
  if (!Array.isArray(actions) || actions.length > maxActions) throw new Error('Bad action log.');
  const S = createWeekly(week); if (god) applyGod(S, god);
  if (days) S.mode.endT = S.mode.startT + days * TPD; // Market God challenges can be shorter than 24 days
  for (const a of actions) {
    if (!Array.isArray(a) || !Number.isInteger(a[0]) || typeof a[1] !== 'string' || !ACTIONS[a[1]]) throw new Error('Bad action entry.');
    const [t, name, ...args] = a;
    if (t < S.t || t > S.mode.endT) throw new Error('Action out of order.');
    if (t > S.t) advance(S, t - S.t);
    if (S.t !== t) throw new Error('Action after the end of the run.');
    const r = ACTIONS[name](S, ...args);
    if (r?.ok === false) throw new Error(`Action failed on replay: ${name} (${r.error})`);
  }
  advance(S, S.mode.endT - S.t);
  return S;
}

// ---- weekly challenge: everyone plays the same seeded market for 24 days (4 game weeks)
export const WEEKLY_DAYS = 24;
export function weekId(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - y0) / 864e5 + 1) / 7)).padStart(2, '0')}`;
}
export function createWeekly(id = weekId()) {
  const S = createGame({ seed: hs2('weekly:' + id) % 2147483647 || 1 });
  S.mode = { kind: 'weekly', id, startT: S.t, endT: S.t + WEEKLY_DAYS * TPD, done: false };
  return S;
}
export function weeklyResult(S) {
  const p = S.player, nw = trading.netWorth(S).total, ret = nw / p.startCash - 1;
  const closes = p.log.filter(l => l.pnl != null);
  const best = closes.reduce((a, l) => (!a || l.pnl > a.pnl ? l : a), null), worst = closes.reduce((a, l) => (!a || l.pnl < a.pnl ? l : a), null);
  const rivals = S.rivals.map(r => ({ name: r.name, ret: rivalNetWorth(S, r) / r.nw[Math.max(0, r.nw.length - 1 - WEEKLY_DAYS)] - 1 }));
  const rank = 1 + rivals.filter(r => r.ret > ret).length;
  return { id: S.mode?.id, nw, ret, trades: p.log.filter(l => ['buy', 'sell', 'short', 'cover'].includes(l.type)).length, best, worst, rank, of: rivals.length + 1, rivals };
}
export const cancelOrder = (S, id) => perform(S, 'cancel', id);
export function toggleWatch(S, ticker) {
  const w = S.player.watchlist; const i = w.indexOf(ticker);
  if (i >= 0) w.splice(i, 1); else if (S.companies[ticker]) w.push(ticker);
  return w.includes(ticker);
}
export function toggleFollow(S, id) { const f = S.player.following; const i = f.indexOf(id); if (i >= 0) f.splice(i, 1); else f.push(id); return f.includes(id); }

// ---- persistence
export function serialize(S) { return JSON.stringify(S); }
export function deserialize(str) {
  const S = JSON.parse(str);
  if (!S || S.version !== SAVE_VERSION || !S.companies || !S.player || !S.rng) throw new Error('Incompatible or corrupt save file.');
  for (const k of STREAMS) {
    // streams added in later versions are seeded fresh so older saves keep loading
    if (S.rng[k] == null && !['market', 'news', 'social', 'rivals', 'events', 'macro'].includes(k)) { S.rng[k] = new RNG(hashString(`${S.seed}:${k}`)); continue; }
    if (typeof S.rng[k] !== 'number') throw new Error('Corrupt save: random state missing.'); S.rng[k] = RNG.fromJSON(S.rng[k]);
  }
  ensureLife(S);
  if (!Number.isInteger(S.player.cash) || S.player.cash < 0) throw new Error('Corrupt save: invalid cash balance.');
  for (const t in S.player.holdings) { const h = S.player.holdings[t]; if (!Number.isInteger(h.shares) || h.shares <= 0) throw new Error('Corrupt save: invalid holdings.'); }
  return S;
}
export { trading };
