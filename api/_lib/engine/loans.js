// Loan sharks. Borrow fast, pay ridiculous daily interest, and if you miss the deadline the
// collectors come round: first a late fee and a "friendly visit", then they take your cash and
// sell your shares. All money is integer cents and cash never goes negative.
// Loans never touch market prices: repossessions sell at the normal quoted price.
import { TPD } from './calendar.js';
import { netWorth, positions, sell } from './trading.js';
import { award } from './progress.js';
import { setBrokerDebt } from './shorts.js';
import { seizeItems } from './lifestyle.js';

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
const LATE_FEE = 0.25, GRACE_DAYS = 3, BAN_DAYS = 60;
const err = error => ({ ok: false, error });
export const ensureLoans = S => (S.player.loans ||= { list: [], ids: 0, banUntil: -1, history: [] });
export const debtOf = S => (S.player.loans?.list || []).reduce((a, l) => a + l.owed, 0);
export function limitFor(S, sh) {
  const nw = netWorth(S); const equity = Math.max(0, nw.total);
  return Math.max(sh.min, Math.round(equity * sh.mult));
}

export function borrow(S, sharkId, amount) {
  const L = ensureLoans(S), p = S.player, sh = SHARKS.find(x => x.id === sharkId);
  if (!sh || sh.hidden) return err('Nobody by that name works here.');
  if (L.banUntil > S.t) return err('Word got around. No shark will lend to you right now.');
  if (L.list.some(l => l.shark === sh.id)) return err(`${sh.who} wants the last loan back first.`);
  if (!Number.isInteger(amount) || amount < 10000) return err('Borrow at least $100.');
  const lim = limitFor(S, sh); if (amount > lim) return err(`${sh.who} will lend you at most $${(lim / 100).toLocaleString('en-US')}.`);
  const loan = { id: ++L.ids, shark: sh.id, principal: amount, owed: amount, rate: sh.rate, taken: S.t, due: S.t + sh.days * TPD, strikes: 0 };
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
  if (l.owed <= 0) { L.list = L.list.filter(x => x !== l); L.history.push({ t: S.t, shark: l.shark, outcome: 'repaid', principal: l.principal }); award(S, 'shark_bait'); }
  return { ok: true, paid: pay, cleared: l.owed <= 0 };
}

/** daily: compound interest, then deal with anyone who missed their deadline */
export function loansDaily(S) {
  const L = S.player.loans; if (!L || !L.list.length) return;
  const p = S.player, scenes = (p.scenes ||= []);
  for (const l of [...L.list]) {
    l.owed = Math.round(l.owed * (1 + l.rate));
    if (!l.warned && S.t < l.due && l.due - S.t <= TPD) { l.warned = true; p.notifications.push({ t: S.t, kind: 'warn', text: `${SHARKS.find(x => x.id === l.shark).who} wants ${'$' + Math.round(l.owed / 100).toLocaleString('en-US')} by tomorrow. Pay up or they come round.` }); }
    if (S.t < l.due) continue;
    const sh = SHARKS.find(x => x.id === l.shark);
    l.strikes++;
    if (l.strikes === 1) { // the friendly visit
      l.owed = Math.round(l.owed * (1 + LATE_FEE)); l.due = S.t + GRACE_DAYS * TPD; l.warned = false;
      p.notifications.push({ t: S.t, kind: 'warn', text: `${sh.who}'s associates paid you a visit. Late fee added. You have ${GRACE_DAYS} days.` });
      scenes.push({ kind: 'collect1', t: S.t, shark: sh.id, owed: l.owed });
      award(S, 'kneecaps');
      continue;
    }
    // repossession: toys first, then cash, then shares (largest first) until the debt is covered
    const toys = seizeItems(S, l.owed); let took = Math.min(toys.raised, l.owed); l.owed -= took;
    const cashTake = Math.min(p.cash, l.owed); p.cash -= cashTake; l.owed -= cashTake; took += cashTake; const sold = [];
    for (const x of positions(S)) {
      if (l.owed <= 0) break; const h = p.holdings[x.ticker]; if (!h) continue;
      const r = sell(S, x.ticker, h.shares, { source: 'collector' }); if (!r.ok) continue;
      sold.push(x.ticker); const take = Math.min(p.cash, l.owed); p.cash -= take; l.owed -= take; took += take;
    }
    const left = l.owed; L.list = L.list.filter(x => x !== l);
    if (left > 0) L.banUntil = S.t + BAN_DAYS * TPD;
    L.history.push({ t: S.t, shark: l.shark, outcome: left > 0 ? 'written off' : 'repossessed', took, left });
    p.log.push({ type: 'repossessed', t: S.t, total: took, src: l.shark }); if (p.log.length > 600) p.log.shift();
    p.notifications.push({ t: S.t, kind: 'warn', text: `${sh.who} repossessed $${Math.round(took / 100).toLocaleString('en-US')}${sold.length ? ` and sold your ${sold.slice(0, 3).join(', ')}` : ''}.${left > 0 ? ' Every shark in town has blacklisted you.' : ''}` });
    scenes.push({ kind: 'collect2', t: S.t, shark: sh.id, took, sold, left, toys: toys.items });
  }
  if (scenes.length > 10) scenes.splice(0, scenes.length - 10);
}
