import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryDb } from '../api/_lib/db.js';
import { handleGame, handleAdmin } from '../api/_lib/core.js';
import { makeToken, readToken, hashPin, checkPin } from '../api/_lib/auth.js';

const ip = n => ({ 'x-forwarded-for': `203.0.113.${n}` });
const PRIVATE_OPS = ['me', 'claim', 'ack', 'profile', 'start', 'sync', 'sync_ack', 'submit', 'send_money', 'send_gift', 'send', 'inbox', 'thread', 'follow', 'feed', 'rugpull', 'crowd', 'duels', 'duel_create', 'challenges', 'post'];

test('every private op refuses requests without a valid session', async () => {
  const db = memoryDb(), p = await db.createPlayer('victim', hashPin('1234'));
  const good = makeToken(p.id), [id, exp, sig] = good.split('.');
  const forged = [
    {}, { authorization: 'Bearer ' }, { authorization: 'Bearer nonsense' },
    { authorization: `Bearer ${id}.${exp}.AAAA${sig.slice(4)}` },                    // tampered signature
    { authorization: `Bearer ${id}.${Number(exp) + 1e9}.${sig}` },                  // extended expiry
    { authorization: `Bearer 00000000-0000-0000-0000-000000000000.${exp}.${sig}` }, // someone else's id
    { authorization: `Bearer ${id}.${Date.now() - 1000}.${sig}` },                  // expired
  ];
  for (const op of PRIVATE_OPS) for (const h of forged) {
    const r = await handleGame(db, op, {}, h);
    assert.equal(r.status, 401, `${op} with ${JSON.stringify(h)} -> ${r.status}`);
  }
  assert.equal(readToken(good), p.id);
});

test('banned players are refused everywhere after sign-in', async () => {
  const db = memoryDb(), p = await db.createPlayer('baddie', hashPin('1234'));
  await db.updatePlayer(p.id, { banned: true, ban_reason: 'cheating' });
  for (const op of PRIVATE_OPS) assert.equal((await handleGame(db, op, {}, { authorization: 'Bearer ' + makeToken(p.id) })).status, 403, op);
  assert.equal((await handleGame(db, 'login', { nickname: 'baddie', pin: '1234' }, ip(1))).status, 403);
});

test('PINs are salted and hashed; five wrong PINs lock the account even with the right PIN', async () => {
  const db = memoryDb();
  const reg = await handleGame(db, 'register', { nickname: 'lockme', pin: '4321' }, ip(2));
  assert.equal(reg.status, 200);
  const stored = (await db.playerByNick('lockme')).pin_hash;
  assert.ok(!stored.includes('4321') && stored !== hashPin('4321'), 'salted, not reversible');
  assert.ok(checkPin('4321', stored) && !checkPin('4322', stored));
  for (let i = 0; i < 5; i++) assert.equal((await handleGame(db, 'login', { nickname: 'lockme', pin: '0000' }, ip(10 + i))).status, 401);
  assert.equal((await handleGame(db, 'login', { nickname: 'lockme', pin: '4321' }, ip(30))).status, 429, 'locked out');
});

test('wrong PINs and sign-ups are rate limited per connection', async () => {
  const db = memoryDb();
  let last; for (let i = 0; i < 40; i++) last = await handleGame(db, 'login', { nickname: 'ghost' + i, pin: '1111' }, ip(50));
  assert.equal(last.status, 429);
  let reg; for (let i = 0; i < 40; i++) reg = await handleGame(db, 'register', { nickname: 'spam' + i, pin: '1111' }, ip(51));
  assert.equal(reg.status, 429);
  assert.equal((await handleGame(db, 'register', { nickname: 'fresh_ip', pin: '1111' }, ip(52))).status, 200, 'other connections are unaffected');
});

test('the admin API needs the admin password, and wrong guesses are rate limited', async () => {
  const db = memoryDb(), prev = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = 'correct-horse-battery';
  try {
    assert.equal((await handleAdmin(db, 'overview', {}, ip(60))).status, 401);
    assert.equal((await handleAdmin(db, 'cash', { playerId: 'x', amount: 1e9 }, { ...ip(60), 'x-admin-key': 'guess' })).status, 401);
    assert.equal((await handleAdmin(db, 'overview', {}, { ...ip(61), 'x-admin-key': 'correct-horse-battery' })).status, 200);
    let r; for (let i = 0; i < 40; i++) r = await handleAdmin(db, 'overview', {}, { ...ip(62), 'x-admin-key': 'nope' + i });
    assert.equal(r.status, 429);
    assert.equal((await handleAdmin(db, 'overview', {}, { ...ip(62), 'x-admin-key': 'correct-horse-battery' })).status, 429, 'locked out even with the right key');
    process.env.ADMIN_PASSWORD = 'short';
    assert.equal((await handleAdmin(db, 'overview', {}, { ...ip(63), 'x-admin-key': 'short' })).status, 401, 'a weak admin password disables the admin API');
  } finally { process.env.ADMIN_PASSWORD = prev; }
});

test('a player cannot touch another player\'s ranked run', async () => {
  const db = memoryDb(), a = await db.createPlayer('alice', 'x'), b = await db.createPlayer('mallory', 'x');
  const run = (await handleGame(db, 'start', {}, { authorization: 'Bearer ' + makeToken(a.id) })).body;
  const hb = { authorization: 'Bearer ' + makeToken(b.id) };
  for (const op of ['sync', 'submit']) assert.equal((await handleGame(db, op, { runId: run.runId, t: 1, actions: [[0, 'god', {}]], claimed: 1 }, hb)).status, 404, op);
  assert.equal((await db.run(run.runId)).status, 'active');
});

test('the Market God cannot be impersonated with forged client payloads in a ranked log', async () => {
  const db = memoryDb(), a = await db.createPlayer('forger', 'x'), h = { authorization: 'Bearer ' + makeToken(a.id) };
  const run = (await handleGame(db, 'start', {}, h)).body;
  const start = JSON.parse(Buffer.from(run.cfg, 'base64').toString());
  const rich = { ...start, cash: [{ id: 1, amount: 1e15 }] };
  const r = await handleGame(db, 'submit', { runId: run.runId, actions: [[0, 'god', rich]], claimed: 1e15 }, h);
  assert.equal(r.status, 422);
  assert.equal((await db.run(run.runId)).status, 'rejected');
});
