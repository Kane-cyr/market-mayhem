// Core money mechanics, checked by outcome: what the player's cash, positions and debts must be afterwards.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWeekly, perform, advance, godSync } from '../api/_lib/engine/game.js';
import { netWorth } from '../api/_lib/engine/trading.js';
import { payDividend } from '../api/_lib/engine/settle.js';
import { SHARKS } from '../api/_lib/engine/loans.js';

const rich = (week = '2026-W20', cash = 1e8) => { const S = createWeekly(week); godSync(S, { ver: 0, vol: 1, luck: 0, cash: [{ id: 1, amount: cash }], events: [] }); return S; };
const firstActive = S => Object.values(S.companies).find(c => c.status === 'active').ticker;

test('buying then selling at once costs only the spread, and the cash moves by exactly the order totals', () => {
  const S = rich(), tk = firstActive(S), c0 = S.player.cash;
  const b = perform(S, 'buy', tk, 100); assert.equal(b.ok, true);
  assert.equal(S.player.cash, c0 - b.total);
  assert.equal(S.player.holdings[tk].shares, 100);
  const s = perform(S, 'sell', tk, 100); assert.equal(s.ok, true);
  assert.equal(S.player.cash, c0 - b.total + s.total);
  assert.equal(S.player.holdings[tk], undefined, 'a fully sold position is removed');
  assert.ok(s.total <= b.total, 'no money is created by a round trip');
  assert.equal(S.player.fees, 0, 'trading is fee-free');
});

test('you cannot buy more than you can pay for or sell more than you own', () => {
  const S = createWeekly('2026-W20'), tk = firstActive(S);
  assert.equal(perform(S, 'buy', tk, 1e9).ok, false);
  assert.equal(perform(S, 'sell', tk, 1).ok, false);
  perform(S, 'buy', tk, 2);
  assert.equal(perform(S, 'sell', tk, 3).ok, false);
  assert.ok(S.player.cash >= 0);
});

test('a limit buy fills once the price is at or below the limit, paying the market price', () => {
  const S = rich(), tk = firstActive(S), px = S.companies[tk].price;
  const o = perform(S, 'order', { ticker: tk, side: 'buy', type: 'limit', shares: 10, price: px * 10 });
  assert.equal(o.ok, true);
  const c0 = S.player.cash; advance(S, 1);
  assert.equal(S.player.orders.length, 0, 'filled and removed');
  assert.equal(S.player.holdings[tk].shares, 10);
  assert.ok(c0 - S.player.cash < 10 * px * 10 * 100, 'paid the market price, not the limit');
});

test('a stop sell triggers when the price falls to the stop, and sold shares cannot be sold twice', () => {
  const S = rich(), tk = firstActive(S);
  perform(S, 'buy', tk, 20);
  assert.equal(perform(S, 'order', { ticker: tk, side: 'sell', type: 'stop', shares: 15, price: S.companies[tk].price * 10 }).ok, true);
  assert.equal(perform(S, 'order', { ticker: tk, side: 'sell', type: 'limit', shares: 6, price: 1e9 }).ok, false, 'only 5 shares are left unreserved');
  advance(S, 1);
  assert.equal(S.player.holdings[tk].shares, 5);
});

test('orders can be cancelled once; unknown orders cannot', () => {
  const S = rich(), tk = firstActive(S);
  const o = perform(S, 'order', { ticker: tk, side: 'buy', type: 'limit', shares: 1, price: 0.01 });
  assert.equal(perform(S, 'cancel', o.order.id).ok, true);
  assert.equal(perform(S, 'cancel', o.order.id).ok, false);
  assert.equal(S.player.orders.length, 0);
});

test('a shark loan pays out the principal, compounds daily, and repaying it in full clears it', () => {
  const S = rich(), sh = SHARKS.find(s => s.id === 'vinnie'), c0 = S.player.cash;
  const b = perform(S, 'borrow', sh.id, 300000, []); assert.equal(b.ok, true, b.error);
  assert.equal(S.player.cash, c0 + 300000);
  assert.equal(perform(S, 'borrow', sh.id, 300000, []).ok, false, 'one loan per shark');
  advance(S, 6);
  const L = S.player.loans.list[0];
  assert.equal(L.owed, Math.round(300000 * (1 + sh.rate)), 'one day of interest');
  const before = S.player.cash, owed = L.owed;
  assert.equal(perform(S, 'repay', L.id, 1e12).ok, true);
  assert.equal(S.player.cash, before - owed, 'pays exactly what is owed, never more');
  assert.equal(S.player.loans.list.length, 0);
});

test('an ignored loan is collected from cash, never leaving a negative balance', () => {
  const S = rich('2026-W20', 2e6), sh = SHARKS.find(s => s.id === 'tony');
  assert.equal(perform(S, 'borrow', sh.id, 500000, []).ok, true);
  perform(S, 'buy', firstActive(S), Math.floor(S.player.cash / 100 / S.companies[firstActive(S)].price / 2));
  advance(S, (sh.days + 4) * 6);
  assert.equal(S.player.loans.list.length, 0, 'the shark collected');
  assert.ok(S.player.cash >= 0, `cash ${S.player.cash}`);
  assert.ok(S.player.loans.history.length >= 1);
  assert.ok(Number.isFinite(netWorth(S).total));
});

test('a dividend pays whole cents per share held', () => {
  const S = rich(), tk = firstActive(S);
  perform(S, 'buy', tk, 333);
  const c0 = S.player.cash;
  payDividend(S, S.companies[tk], 0.0137);
  assert.equal(S.player.cash - c0, Math.floor(333 * 0.0137 * 100));
  assert.equal(S.player.dividends, Math.floor(333 * 0.0137 * 100));
});

test('holders of a company that is taken over are paid the takeover price, and its orders are removed', () => {
  const S = rich('2026-W03'); // PLSI is acquired on day 10
  advance(S, 6);
  assert.equal(perform(S, 'buy', 'PLSI', 50).ok, true);
  perform(S, 'order', { ticker: 'PLSI', side: 'sell', type: 'limit', shares: 10, price: 1e9 });
  const c0 = S.player.cash;
  while (S.companies.PLSI.status === 'active') advance(S, 1);
  assert.equal(S.player.holdings.PLSI, undefined);
  assert.equal(S.player.orders.filter(o => o.ticker === 'PLSI').length, 0);
  assert.equal(S.player.cash - c0, Math.floor(50 * S.companies.PLSI.settle * 100), 'paid shares x settle price');
});
