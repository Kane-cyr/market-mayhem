import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryDb } from '../api/_lib/db.js';
import { handleGame } from '../api/_lib/core.js';
import { makeToken } from '../api/_lib/auth.js';

async function player() {
  const db = memoryDb();
  const p = await db.createPlayer('syncer' + Math.floor(Math.random() * 1e5), 'hash');
  const h = { authorization: 'Bearer ' + makeToken(p.id) };
  const push = (t, cash, gid = 'game01', extra = {}) => handleGame(db, 'profile', { force: true, avatar: {}, profile: { career: { nw: cash }, live: { mode: 'career', gid, t, cash }, ...extra } }, h);
  return { db, p, push, live: async () => (await db.player(p.id)).profile.live };
}

test('a newer snapshot of the same game replaces the stored one', async () => {
  const { push, live } = await player();
  assert.equal((await push(10, 1000)).body.ok, true);
  assert.equal((await push(20, 2000)).body.ok, true);
  assert.equal((await live()).cash, 2000);
});

test('an older snapshot of the same game (delayed request, stale tab, reloaded save) is ignored', async () => {
  const { push, live } = await player();
  await push(20, 2000);
  const r = await push(10, 999999);
  assert.equal(r.body.stale, true);
  assert.equal((await live()).cash, 2000);
});

test('a different game (new game, other device) is accepted even with an earlier clock', async () => {
  const { push, live } = await player();
  await push(500, 2000, 'game01');
  await push(3, 1000, 'game02');
  assert.equal((await live()).cash, 1000);
});

test('career and ranked snapshots keep separate revisions', async () => {
  const { db, p, push, live } = await player();
  await push(300, 5000);
  const h = { authorization: 'Bearer ' + makeToken(p.id) };
  await handleGame(db, 'profile', { force: true, avatar: {}, profile: { live: { mode: 'weekly', gid: 'week01', t: 7, cash: 1 } } }, h);
  assert.equal((await live()).mode, 'weekly');
  await push(301, 5100);
  assert.equal((await live()).cash, 5100, 'the career game is not considered stale because a ranked run was pushed');
});

test('two requests in flight cannot finish out of order: the loser is told to retry', async () => {
  const { db, push, live } = await player();
  await push(1, 1);
  // the first write is held until the second request has written: both read the player before either wrote
  const real = db.setProfile.bind(db); let n = 0, release; const secondDone = new Promise(r => { release = r; });
  db.setProfile = async (...a) => { if (n++ === 0) { await secondDone; return real(...a); } const out = await real(...a); release(); return out; };
  const reqs = [[10, 1000], [20, 2000]], res = await Promise.all(reqs.map(([t, c]) => push(t, c)));
  const losers = res.map((r, i) => r.body.retry ? i : -1).filter(i => i >= 0);
  assert.equal(losers.length, 1, 'exactly one overlapping write is applied: ' + JSON.stringify(res.map(r => r.body)));
  assert.equal((await live()).cash, reqs[1 - losers[0]][1], 'the stored data is the winner\'s, not a mix');
  db.setProfile = real;
  await push(...reqs[losers[0]]); // the client retries as told
  assert.equal((await live()).cash, 2000, 'after the retry the newest snapshot is stored, whichever order they ran in');
});

test('saves from before revisions (no game id) still sync', async () => {
  const { db, p, live } = await player();
  const h = { authorization: 'Bearer ' + makeToken(p.id) };
  const r = await handleGame(db, 'profile', { force: true, avatar: {}, profile: { live: { mode: 'career', t: 5, cash: 42 } } }, h);
  assert.equal(r.body.ok, true);
  assert.equal((await live()).cash, 42);
});

test('a throttled push says when to retry', async () => {
  const { db, p, push } = await player();
  await push(1, 1);
  const h = { authorization: 'Bearer ' + makeToken(p.id) };
  const r = await handleGame(db, 'profile', { avatar: {}, profile: { live: { mode: 'career', gid: 'game01', t: 2, cash: 2 } } }, h);
  assert.equal(r.body.throttled, true);
  assert.ok(r.body.retryAfter >= 1000 && r.body.retryAfter <= 15000);
});

test('another player\'s public profile never includes the private snapshot, audit or revisions', async () => {
  const { db, p, push } = await player();
  await push(10, 123456);
  const viewer = await db.createPlayer('nosy' + Math.floor(Math.random() * 1e5), 'hash');
  const r = await handleGame(db, 'player', { nick: p.nickname }, { authorization: 'Bearer ' + makeToken(viewer.id) });
  assert.equal(r.status, 200);
  for (const k of ['live', 'audit', 'rev']) assert.equal(r.body.profile[k], undefined, k);
  const anon = await handleGame(db, 'player', { nick: p.nickname }, {});
  for (const k of ['live', 'audit', 'rev']) assert.equal(anon.body.profile[k], undefined, 'signed out: ' + k);
});
