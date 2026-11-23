// Loan sharks. Borrow fast, pay ridiculous daily interest, and if you miss the deadline the
// collectors come round: first a late fee and a "friendly visit", then they take your cash and
// sell your shares. All money is integer cents and cash never goes negative.
// Loans never touch market prices: repossessions sell at the normal quoted price.
import { TPD } from './calendar.js';
import { netWorth, positions, sell } from './trading.js';
import { award } from './progress.js';
import { setBrokerDebt } from './shorts.js';
import { seizeItems, ITEMS } from './lifestyle.js';

export const SHARKS = [
  { id: 'vinnie', name: "Vinnie 'The Calculator'", who: 'Vinnie', rate: 0.015, days: 15, mult: 0.5, min: 250000, blurb: 'Slow and steady, like a glacier made of interest.' },
  { id: 'tony', name: "Big Tony's Easy Money", who: 'Big Tony', rate: 0.03, days: 10, mult: 1, min: 500000, blurb: 'No credit check. No questions. Just vibes and 3% a day.' },
  { id: 'knuckles', name: 'Knuckles & Sons Capital', who: 'Knuckles', rate: 0.06, days: 6, mult: 3, min: 2000000, blurb: 'Three times your net worth, six days to pay. What could go wrong?' },
  // not a lender you can visit: margin-call shortfalls land here
  { id: 'broker', name: 'Pemberton Prime Brokerage', who: 'Your broker', rate: 0.004, days: 10, mult: 0, min: 0, hidden: true, blurb: 'You owe us for that squeeze.' },
];
/** a margin-call shortfall becomes debt to the broker, chased like any other loan */
setBrokerDebt((S, amount) => {
  const L = ensureLoans(S), ex = L.list.find(l => l.shark === 'broker');
  if (ex) ex.owed += amount; else L.list.push({ id: ++L.ids, shark: 'broker', principal: amount, owed: amount, rate: 0.004, taken: S.t, due: S.t + 10 * TPD, strikes: 0 });
  S.player.notifications.push({ t: S.t, kind: 'warn', text: `Your broker covered a ${'$' + Math.round(amount / 100).toLocaleString('en-US')} shortfall. Pay it back within 10 days.` });
});
const LATE_FEE = 0.25, BAN_DAYS = 60;
// Collateral: watches, staplers, yachts and houses can be pledged. Each adds 60% of what you paid to how
// much a shark will lend. Sharks are aggressive: at the deadline they bust into your office and you
// either pay on the spot or beg for two more days (30% more each time, twice at most).
export const COLLATERAL = 0.6, RESPOND_DAYS = 1, BEG_DAYS = 2, BEG_FEE = 0.3, MAX_BEGS = 2;
const err = error => ({ ok: false, error });
export const ensureLoans = S => (S.player.loans ||= { list: [], ids: 0, banUntil: -1, history: [] });
export const debtOf = S => (S.player.loans?.list || []).reduce((a, l) => a + l.owed, 0);
const cleanPledge = pledge => (Array.isArray(pledge) ? [...new Set(pledge.filter(u => Number.isInteger(u)))] : []).slice(0, 30);
export function pledgeValue(S, pledge) {
  const owned = S.player.life?.owned || []; let v = 0;
  for (const u of cleanPledge(pledge)) { const o = owned.find(x => x.uid === u && !x.pledged); if (o) v += Math.round(o.paid * COLLATERAL); }
  return v;
}
export function limitFor(S, sh, pledge) {
  const nw = netWorth(S); const equity = Math.max(0, nw.total);
  return Math.max(sh.min, Math.round(equity * sh.mult)) + pledgeValue(S, pledge);
}
const release = (S, l) => { for (const o of S.player.life?.owned || []) if (o.pledged === l.id) delete o.pledged; };
const money = c => '$' + Math.round(c / 100).toLocaleString('en-US');

export function borrow(S, sharkId, amount, pledge) {
  const L = ensureLoans(S), p = S.player, sh = SHARKS.find(x => x.id === sharkId);
  if (!sh || sh.hidden) return err('Nobody by that name works here.');
  if (L.banUntil > S.t) return err('Word got around. No shark will lend to you right now.');
  if (L.list.some(l => l.shark === sh.id)) return err(`${sh.who} wants the last loan back first.`);
  if (!Number.isInteger(amount) || amount < 10000) return err('Borrow at least $100.');
  const uids = cleanPledge(pledge), owned = p.life?.owned || [];
  for (const u of uids) { const o = owned.find(x => x.uid === u); if (!o) return err('You do not own that item.'); if (o.pledged) return err('That item is already pledged.'); }
  const lim = limitFor(S, sh, uids); if (amount > lim) return err(`${sh.who} will lend you at most $${(lim / 100).toLocaleString('en-US')}.`);
  const loan = { id: ++L.ids, shark: sh.id, principal: amount, owed: amount, rate: sh.rate, taken: S.t, due: S.t + sh.days * TPD, strikes: 0, pledge: uids, begs: 0, demand: null };
  for (const o of owned) if (uids.includes(o.uid)) o.pledged = loan.id;
  L.list.push(loan); p.cash += amount;
  p.log.push({ type: 'loan', t: S.t, total: amount, src: sh.id }); if (p.log.length > 600) p.log.shift();
  return { ok: true, loan };
}

export function repay(S, loanId, amount) {
  const L = ensureLoans(S), p = S.player, l = L.list.find(x => x.id === loanId);
  if (!l) return err('No such loan.');
  const pay = Math.min(l.owed, p.cash, Math.floor(amount ?? l.owed)); if (!(pay > 0)) return err('You have no cash to pay with.');
  p.cash -= pay; l.owed -= pay;
  p.log.push({ type: 'repay', t: S.t, total: pay, src: l.shark }); if (p.log.length > 600) p.log.shift();
  if (l.owed <= 0) { release(S, l); L.list = L.list.filter(x => x !== l); L.history.push({ t: S.t, shark: l.shark, outcome: 'repaid', principal: l.principal }); award(S, 'shark_bait'); }
  return { ok: true, paid: pay, cleared: l.owed <= 0 };
}

/** they take everything they can: on the spot you hand over cash first; a raid takes toys first */
function collect(S, l, onSpot) {
  const L = S.player.loans, p = S.player, sh = SHARKS.find(x => x.id === l.shark), scenes = (p.scenes ||= []);
  let took = 0; const lost = [];
  const fromCash = () => { const c = Math.min(p.cash, l.owed); p.cash -= c; l.owed -= c; took += c; };
  // you did not pay: the collateral is forfeited outright, and they still collect every cent on top
  if (!onSpot && p.life) for (const o of [...p.life.owned]) if (o.pledged === l.id) { lost.push(ITEMS.find(i => i.id === o.id)?.name || o.id); p.life.owned = p.life.owned.filter(x => x !== o); }
  if (onSpot) fromCash();
  const toys = seizeItems(S, l.owed, l.id), t2 = Math.min(toys.raised, Math.max(0, l.owed)); l.owed -= t2; took += t2;
  if (!onSpot) fromCash();
  const sold = [];
  for (const x of positions(S)) {
    if (l.owed <= 0) break; const h = p.holdings[x.ticker]; if (!h) continue;
    const r = sell(S, x.ticker, h.shares, { source: 'collector' }); if (!r.ok) continue;
    sold.push(x.ticker); fromCash();
  }
  const left = Math.max(0, l.owed); release(S, l); L.list = L.list.filter(x => x !== l);
  if (left > 0) L.banUntil = S.t + BAN_DAYS * TPD;
  L.history.push({ t: S.t, shark: l.shark, outcome: left > 0 ? 'written off' : onSpot ? 'paid on the spot' : 'repossessed', took, left });
  p.log.push({ type: 'repossessed', t: S.t, total: took, src: l.shark }); if (p.log.length > 600) p.log.shift();
  p.notifications.push({ t: S.t, kind: 'warn', text: `${sh.who} ${lost.length ? `kept your ${lost.join(', ')} and ` : ''}took ${money(took)}${toys.items.length ? `, your ${toys.items.slice(0, 3).join(', ')}` : ''}${sold.length ? ` and sold your ${sold.slice(0, 3).join(', ')}` : ''}.${left > 0 ? ' Every shark in town has blacklisted you.' : ''}` });
  if (!onSpot) scenes.push({ kind: 'collect2', t: S.t, shark: sh.id, took, sold, left, toys: [...lost, ...toys.items] });
  return { took, left, toys: [...lost, ...toys.items], sold };
}

/** the shark is in your office: hand it over now (cash, then collateral, toys and shares) */
export function sharkPay(S, loanId) {
  const l = S.player.loans?.list.find(x => x.id === loanId); if (!l) return err('No such loan.');
  const r = collect(S, l, true); if (r.left <= 0) award(S, 'shark_bait');
  return { ok: true, ...r };
}
/** beg for two more days: costs 30% more each time, and they only listen twice */
export function sharkBeg(S, loanId) {
  const l = S.player.loans?.list.find(x => x.id === loanId); if (!l) return err('No such loan.');
  if (l.demand == null) return err('Nobody is asking yet.');
  if ((l.begs || 0) >= MAX_BEGS) { const r = collect(S, l, true); return { ok: true, refused: true, ...r }; }
  l.begs = (l.begs || 0) + 1; l.owed = Math.round(l.owed * (1 + BEG_FEE)); l.due = S.t + BEG_DAYS * TPD; l.demand = null; l.warned = false;
  S.player.rep = Math.max(0, (S.player.rep || 0) - 15);
  S.player.notifications.push({ t: S.t, kind: 'warn', text: `${SHARKS.find(x => x.id === l.shark).who} gave you ${BEG_DAYS} more days. You now owe ${money(l.owed)}, and your face hurts.` });
  return { ok: true, owed: l.owed, due: l.due };
}

/** daily: compound interest; at the deadline the shark busts in; ignore them and they take everything */
export function loansDaily(S) {
  const L = S.player.loans; if (!L || !L.list.length) return;
  const p = S.player, scenes = (p.scenes ||= []);
  for (const l of [...L.list]) {
    l.owed = Math.round(l.owed * (1 + l.rate));
    if (!l.warned && S.t < l.due && l.due - S.t <= TPD) { l.warned = true; p.notifications.push({ t: S.t, kind: 'warn', text: `${SHARKS.find(x => x.id === l.shark).who} wants ${money(l.owed)} by tomorrow. Pay up or they come round.` }); }
    if (S.t < l.due) continue;
    const sh = SHARKS.find(x => x.id === l.shark);
    if (l.demand == null) { // they bust in
      l.strikes++; if (l.strikes === 1) l.owed = Math.round(l.owed * (1 + LATE_FEE));
      l.demand = S.t; l.due = S.t + RESPOND_DAYS * TPD;
      p.notifications.push({ t: S.t, kind: 'warn', text: `${sh.who} is in your office. Pay ${money(l.owed)} now or beg for time.` });
      scenes.push({ kind: 'shakedown', t: S.t, shark: sh.id, owed: l.owed, loan: l.id, begs: l.begs || 0 });
      award(S, 'kneecaps');
      continue;
    }
    collect(S, l, false); // you ignored them
  }
  if (scenes.length > 10) scenes.splice(0, scenes.length - 10);
}
