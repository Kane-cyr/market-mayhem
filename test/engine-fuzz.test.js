// Randomised whole-run checks of the server engine (the copy that verifies ranked runs): hundreds of mixed actions per market,
// valid and invalid, across several weekly markets and balances from $10k to septillions. Expected behaviour, checked
// independently of how each action is implemented:
//  - money and share counts never become NaN or infinite, and long positions are never negative;
//  - a refused action changes nothing and is not logged;
//  - replaying the log reproduces the run to the exact cent (what ranked verification relies on).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWeekly, replayRun, perform, advance } from '../api/_lib/engine/game.js';
import { netWorth } from '../api/_lib/engine/trading.js';
import { ITEMS } from '../api/_lib/engine/lifestyle.js';
import { SHARKS } from '../api/_lib/engine/loans.js';
import { CONTACTS } from '../api/_lib/engine/insider.js';

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
// the financial state: a refused action must leave all of it untouched (it may still create empty bookkeeping records)
const snapshot = S => { const p = S.player; return JSON.stringify({ cash: p.cash, holdings: p.holdings, shorts: p.shorts || {}, orders: p.orders, loans: p.loans?.list || [], owned: p.life?.owned || [], tips: p.insider?.tips || [], realized: p.realized, c: Object.fromEntries(Object.entries(S.companies).map(([k, c]) => [k, [c.price, c.status]])) }); };

function checkMoney(S, where) {
  const p = S.player;
  assert.ok(Number.isFinite(p.cash), `${where}: cash is ${p.cash}`);
  for (const [tk, h] of Object.entries(p.holdings)) {
    assert.ok(Number.isFinite(h.shares) && h.shares > 0, `${where}: ${tk} holding ${h.shares}`);
    assert.ok(Number.isFinite(h.cost), `${where}: ${tk} cost ${h.cost}`);
  }
  for (const [tk, s] of Object.entries(p.shorts || {})) assert.ok(Number.isFinite(s.shares) && s.shares > 0, `${where}: ${tk} short ${s.shares}`);
  assert.ok(Number.isFinite(netWorth(S).total), `${where}: net worth ${netWorth(S).total}`);
}

function randomRun(week, seed, grant) {
  const r = rng(seed), S = createWeekly(week), pick = a => a[Math.floor(r() * a.length)];
  if (grant) perform(S, 'god', { ver: 0, vol: 1, luck: 0, cash: [{ id: 1, amount: grant }], events: [] });
  const tickers = () => Object.values(S.companies).filter(c => c.status === 'active').map(c => c.ticker);
  const qty = () => pick([1, 2, 7, 50, 1000, Math.floor(S.player.cash / 100 / 50) || 1, 0, -3, 1.5, 2 ** 60]);
  let refused = 0;
  while (S.t < S.mode.endT) {
    for (let i = 0; i < 1 + Math.floor(r() * 4); i++) {
      const tk = pick(tickers()), own = Object.keys(S.player.holdings), shorts = Object.keys(S.player.shorts || {});
      const action = pick([
        ['buy', tk, qty()], ['buy', tk, qty()], ['sell', pick(own.length ? own : [tk]), qty()],
        ['sell', pick(own.length ? own : [tk]), S.player.holdings[own[0]]?.shares || 1],
        ['short', tk, qty()], ['cover', pick(shorts.length ? shorts : [tk]), qty()],
        ['order', { ticker: tk, side: pick(['buy', 'sell']), type: pick(['limit', 'stop']), shares: qty(), price: S.companies[tk].price * pick([0.9, 1.1]) }],
        ['cancel', (S.player.orders[0] || {}).id ?? 1], ['hype', tk],
        ['item', pick(ITEMS).id], ['pawn', (S.player.life?.owned?.[0] || {}).uid ?? 1],
        ['borrow', pick(SHARKS.filter(s => !s.hidden)).id, pick([250000, 1e6, 5e7]), pick([[], own.slice(0, 1)])],
        ['repay', (S.player.loans?.list?.[0] || {}).id ?? 1, pick([1000, 1e9])],
        ['tip', pick(CONTACTS).id],
      ]);
      const before = snapshot(S), logged = (S.actions || []).length;
      const res = perform(S, ...action);
      if (res?.ok === false) {
        refused++;
        assert.equal(snapshot(S), before, `refused ${action[0]} changed the game: ${res.error}`);
        assert.equal((S.actions || []).length, logged, 'refused action was logged');
      }
      checkMoney(S, `${week} t=${S.t} after ${action[0]}`);
    }
    advance(S, 1 + Math.floor(r() * 6));
    checkMoney(S, `${week} t=${S.t} after market moves`);
  }
  return { S, refused };
}

for (const [week, seed, grant] of [['2026-W10', 1, 0], ['2026-W23', 7, 0], ['2026-W31', 42, 1e10], ['2026-W44', 99, 2.8e26], ['2027-W02', 3, 5e13]]) {
  test(`random runs ${week} (grant ${grant ? '$' + (grant / 100).toExponential(1) : 'none'}): money stays valid and the replay is exact`, () => {
   let total = 0;
   for (let k = 0; k < 8; k++) {
    const { S, refused } = randomRun(week, seed * 1000 + k, grant); total += S.actions.length + refused;
    assert.ok(S.actions.length >= 3, `the run did something (${S.actions.length} actions)`);
    assert.ok(refused > 0, 'invalid actions were tried');
    console.log(`   ${week}: ${S.actions.length} actions logged, ${refused} refused, final net worth ${netWorth(S).total}`);
    const R = replayRun({ week }, S.actions);
    assert.equal(netWorth(R).total, netWorth(S).total);
    assert.equal(R.player.cash, S.player.cash);
   }
   console.log(`   ${week}: ${total} actions tried over 8 runs`);
  });
}
