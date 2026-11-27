import test from 'node:test';
import assert from 'node:assert/strict';
import { createWeekly, replayRun, buyShares, sellShares, placeOrder, godSync, advance, shortShares } from '../api/_lib/engine/game.js';
import { netWorth } from '../api/_lib/engine/trading.js';

const WEEK = '2026-W40';
const god = cash => ({ ver: 0, vol: 1, luck: 0, cash: cash ? [{ id: 1, amount: cash }] : [], events: [] });

// The browser game has no upper limit on an order (Max with very large balances buys more than 2^53 shares).
// The server replays ranked runs with its own copy of the engine, so it must accept exactly the same orders.
function cheapest(S) {
  return Object.values(S.companies).filter(c => c.status === 'active').sort((a, b) => a.price - b.price)[0].ticker;
}

test('orders above 2^53 shares replay on the server exactly as the game played them', () => {
  const S = createWeekly(WEEK);
  godSync(S, god(1e30));
  const tk = cheapest(S);
  const shares = 2 ** 60;
  const b = buyShares(S, tk, shares);
  assert.equal(b?.ok, true, b?.error);
  advance(S, 6);
  const s = sellShares(S, tk, 2 ** 59);
  assert.equal(s?.ok, true, s?.error);
  const o = placeOrder(S, { ticker: tk, side: 'sell', type: 'limit', shares: 2 ** 58, price: 1e9 });
  assert.equal(o?.ok, true, o?.error);
  advance(S, S.mode.endT - S.t);

  const R = replayRun({ week: WEEK }, S.actions);
  assert.equal(netWorth(R).total, netWorth(S).total);
});

test('share counts must still be positive whole numbers', () => {
  const S = createWeekly(WEEK);
  const tk = cheapest(S);
  for (const bad of [0, -1, 1.5, NaN, Infinity, '10', null]) assert.equal(buyShares(S, tk, bad).ok, false, String(bad));
  assert.equal(S.actions?.length || 0, 0, 'rejected orders are not logged');
});

test('an order whose cost is not a finite number is refused, as in the game', () => {
  const S = createWeekly(WEEK);
  godSync(S, god(1e300));
  const tk = cheapest(S);
  const r = buyShares(S, tk, 1e308);
  assert.equal(r.ok, false);
});

test('a short closed by a takeover is bought back at the takeover price with no fee (trading is fee-free)', () => {
  const S = createWeekly('2026-W03'); // PLSI is acquired on day 10 of this week
  godSync(S, god(1e8));
  advance(S, 6);
  const r = shortShares(S, 'PLSI', 100);
  assert.equal(r?.ok, true, r?.error);
  advance(S, S.mode.endT - S.t);
  assert.notEqual(S.companies.PLSI.status, 'active');
  assert.equal(S.player.shorts?.PLSI, undefined, 'the short was closed');
  const close = S.player.log.filter(l => l.type === 'cover' && l.ticker === 'PLSI').at(-1);
  assert.ok(close, 'the forced cover is in the trade log');
  assert.equal(S.player.fees, 0, 'no fee was charged anywhere in the run');
  const R = replayRun({ week: '2026-W03' }, S.actions);
  assert.equal(netWorth(R).total, netWorth(S).total);
});
