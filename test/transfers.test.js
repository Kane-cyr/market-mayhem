import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryDb } from '../api/_lib/db.js';
import { handleGame } from '../api/_lib/core.js';
import { makeToken } from '../api/_lib/auth.js';

async function pair(cash = 500000000) { // the sender's career game reports $5M cash
  const db = memoryDb();
  const a = await db.createPlayer('sender' + Math.floor(Math.random() * 1e5), 'hash');
  const b = await db.createPlayer('receiver' + Math.floor(Math.random() * 1e5), 'hash');
  await db.setProfile(a.id, {}, { live: { mode: 'career', cash }, career: { items: ['watch'] } });
  const h = { authorization: 'Bearer ' + makeToken(a.id) };
  return { db, a, b, call: (op, body) => handleGame(db, op, body, h) };
}
const total = async (db, pid) => (await db.pendingCash(pid)).reduce((s, c) => s + Number(c.amount_cents), 0);

test('money can be sent, and the sender\'s reported cash goes down by the amount', async () => {
  const { db, a, b, call } = await pair();
  const r = await call('send_money', { nick: b.nickname, amount: 2500000 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await total(db, b.id), 2500000);
  assert.equal((await db.player(a.id)).profile.live.cash, 500000000 - 2500000);
});

test('parallel sends cannot get past the daily cap', async () => {
  const { db, b, call } = await pair();
  const rs = await Promise.all(Array.from({ length: 6 }, () => call('send_money', { nick: b.nickname, amount: 90000000 }))); // 6 x $900k
  assert.equal(rs.filter(r => r.status === 200).length, 1, 'only one $900k send fits under the $1M cap');
  assert.ok(await total(db, b.id) <= 100000000);
});

test('parallel sends cannot spend more than the sender has', async () => {
  const { db, a, b, call } = await pair(5000000); // $50k
  const rs = await Promise.all(Array.from({ length: 5 }, () => call('send_money', { nick: b.nickname, amount: 4000000 }))); // 5 x $40k
  assert.equal(rs.filter(r => r.status === 200).length, 1);
  assert.equal(await total(db, b.id), 4000000);
  assert.equal((await db.player(a.id)).profile.live.cash, 1000000);
});

test('send_money input checks', async () => {
  const { a, b, call } = await pair();
  for (const amount of [0, 50, -100, 'x', 1e30, NaN]) assert.equal((await call('send_money', { nick: b.nickname, amount })).status, 400, String(amount));
  assert.equal((await call('send_money', { nick: a.nickname, amount: 1000 })).status, 400, 'not to yourself');
  assert.equal((await call('send_money', { nick: 'nobody_here', amount: 1000 })).status, 404);
});

test('one owned item cannot be gifted to several people at once', async () => {
  const { db, call } = await pair();
  const others = await Promise.all([1, 2, 3, 4].map(i => db.createPlayer('fan' + i + Math.floor(Math.random() * 1e4), 'hash')));
  const rs = await Promise.all(others.map(o => call('send_gift', { nick: o.nickname, item: 'watch' })));
  assert.equal(rs.filter(r => r.status === 200).length, 1, JSON.stringify(rs.map(r => r.body)));
});

test('the gift value is the shop price, never what the sender claims', async () => {
  const { db, b, call } = await pair();
  await call('send_gift', { nick: b.nickname, item: 'watch', paid: 1e15 });
  const g = await db.pendingGifts(b.id);
  assert.equal(g.length, 1);
  assert.ok(Number(g[0].paid) < 1e15);
});
