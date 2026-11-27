import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryDb } from '../api/_lib/db.js';
import { handleGame } from '../api/_lib/core.js';
import { makeToken } from '../api/_lib/auth.js';
import { createWeekly, godSync, buyShares, advance } from '../api/_lib/engine/game.js';
import { netWorth } from '../api/_lib/engine/trading.js';

const dec = cfg => JSON.parse(Buffer.from(cfg, 'base64').toString('utf8'));

async function setup() {
  const db = memoryDb();
  const player = await db.createPlayer('ranker' + Math.floor(Math.random() * 1e6), 'hash');
  const headers = { authorization: 'Bearer ' + makeToken(player.id) };
  const call = (op, body = {}) => handleGame(db, op, body, headers);
  const started = await call('start');
  assert.equal(started.status, 200);
  return { db, player, call, started: started.body };
}

// Plays the run the way the browser does: the start settings first, any synced payloads at the tick they arrive.
function play(started, syncs = []) {
  const S = createWeekly(started.week);
  godSync(S, dec(started.cfg));
  const tk = Object.values(S.companies).find(c => c.status === 'active').ticker;
  buyShares(S, tk, 3);
  for (const { day, payload } of syncs) { advance(S, S.mode.startT + day * 6 - S.t); godSync(S, payload); }
  advance(S, S.mode.endT - S.t);
  return { actions: S.actions, claimed: netWorth(S).total };
}

test('a run is accepted when its last sync response never arrived, and that cash goes back to pending', async () => {
  const { db, player, call, started } = await setup();
  const grant = await db.addCash(player.id, 50000, 'late Market God grant');
  const lost = await call('sync', { runId: started.runId, t: 12 });
  assert.ok(lost.body.cfg, 'the server issued a payload');
  assert.equal((await db.pendingCash(player.id)).length, 0, 'the grant was assigned to the run');

  const { actions, claimed } = play(started); // the response was lost: the game never applied it
  const res = await call('submit', { runId: started.runId, actions, claimed });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.ok, true);
  assert.deepEqual((await db.pendingCash(player.id)).map(c => c.id), [grant.id], 'the undelivered grant is pending again');
  assert.equal((await db.run(started.runId)).rigged, false, 'an undelivered payload does not mark the run as rigged');
});

test('a run is rejected when it leaves out a payload the game acknowledged', async () => {
  const { db, player, call, started } = await setup();
  await db.addCash(player.id, 50000, 'grant');
  const s = await call('sync', { runId: started.runId, t: 12 });
  const payload = dec(s.body.cfg);
  assert.equal((await call('sync_ack', { runId: started.runId, payloadId: payload.pid })).status, 200);

  const { actions, claimed } = play(started); // acknowledged, but left out of the log
  const res = await call('submit', { runId: started.runId, actions, claimed });
  assert.equal(res.status, 422);
  assert.match(res.body.reason, /not applied/);
  assert.equal((await db.pendingCash(player.id)).length, 0, 'a rejected run does not release cash');
});

test('a run that applied its synced payload is accepted, including a retried (resent) payload', async () => {
  const { db, player, call, started } = await setup();
  await db.addCash(player.id, 50000, 'grant');
  const first = dec((await call('sync', { runId: started.runId, t: 12 })).body.cfg);
  const again = dec((await call('sync', { runId: started.runId, t: 12 })).body.cfg); // ack lost: same payload resent
  assert.deepEqual(again, first);
  await call('sync_ack', { runId: started.runId, payloadId: first.pid });
  assert.equal((await call('sync', { runId: started.runId, t: 18 })).body.none, true);

  const { actions, claimed } = play(started, [{ day: 2, payload: first }]);
  const res = await call('submit', { runId: started.runId, actions, claimed });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.nw, claimed);
  assert.equal((await db.run(started.runId)).rigged, true, 'a Market God grant marks the run');
});

test('runs whose issued payloads predate acknowledgements are still accepted', async () => {
  const { db, call, started } = await setup();
  // the old format stored the bare payload, with no id or acked flag
  const legacy = { ver: 0, vol: 1, luck: 0, cash: [], events: [] };
  await db.updateRun(started.runId, { issued: [legacy] });
  const withIt = play(started, [{ day: 1, payload: legacy }]);
  const res = await call('submit', { runId: started.runId, ...withIt });
  assert.equal(res.status, 200, JSON.stringify(res.body));
});

test('a Market God payload the server never issued is rejected', async () => {
  const { call, started } = await setup();
  const fake = { pid: '00000000-0000-0000-0000-000000000000', ver: 0, vol: 1, luck: 0, cash: [{ id: 999, amount: 1e12 }], events: [] };
  const { actions, claimed } = play(started, [{ day: 1, payload: fake }]);
  const res = await call('submit', { runId: started.runId, actions, claimed });
  assert.equal(res.status, 422);
  assert.match(res.body.reason, /Unrecognised settings/);
});

test('sync_ack refuses another player\'s run and malformed ids', async () => {
  const { db, call, started } = await setup();
  const other = await db.createPlayer('intruder', 'hash');
  const theirs = { authorization: 'Bearer ' + makeToken(other.id) };
  assert.equal((await handleGame(db, 'sync_ack', { runId: started.runId, payloadId: '00000000-0000-0000-0000-000000000000' }, theirs)).status, 404);
  assert.equal((await call('sync_ack', { runId: started.runId, payloadId: 'x' })).status, 400);
});

test('a lost ranked start can be recovered with the same start settings', async () => {
  const { call, started } = await setup();
  const again = await call('start');
  assert.equal(again.body.resume, true);
  assert.equal(again.body.runId, started.runId);
  assert.deepEqual(dec(again.body.cfg), dec(started.cfg));
  assert.equal(again.body.maxTick, 0);
});

// Fault injection: the database write of the first request is slow, so two requests overlap.
function slowFirst(db, method, ms = 30) {
  const real = db[method].bind(db); let n = 0;
  db[method] = async (...a) => { if (n++ === 0) await new Promise(r => setTimeout(r, ms)); return real(...a); };
}

test('two overlapping syncs cannot lose an issued payload (or the cash in it)', async () => {
  const { db, player, call, started } = await setup();
  await db.addCash(player.id, 1111, 'first');
  const realMark = db.markCash.bind(db); let k = 0;
  db.markCash = async (ids, run) => (k++ === 0 ? realMark(ids.slice(0, 1), run) : realMark(ids, run));
  slowFirst(db, 'updateRun');
  const p1 = call('sync', { runId: started.runId, t: 12 });
  await new Promise(r => setTimeout(r, 5));
  await db.addCash(player.id, 2222, 'second');
  const [a, b] = await Promise.all([p1, call('sync', { runId: started.runId, t: 12 })]);
  const issued = (await db.run(started.runId)).issued;
  const assigned = (await db.runs()).length && [...(await db.pendingCash(player.id))];
  const inRun = issued.flatMap(x => (x.payload || x).cash || []).map(c => c.amount).sort();
  const pending = assigned.map(c => Number(c.amount_cents));
  // every grant is either in an issued payload or still pending: none is assigned to the run and forgotten
  assert.deepEqual([...inRun, ...pending].sort((x, y) => x - y), [1111, 2222], JSON.stringify({ inRun, pending, a: a.body, b: b.body }));
});

test('two submits of the same run at once: one is verified, the other is told it was already submitted', async () => {
  const { db, call, started } = await setup();
  const { actions, claimed } = play(started);
  slowFirst(db, 'updateRun');
  const rs = await Promise.all([call('submit', { runId: started.runId, actions, claimed }), call('submit', { runId: started.runId, actions, claimed })]);
  assert.deepEqual(rs.map(r => r.status).sort(), [200, 409]);
  assert.equal((await db.run(started.runId)).status, 'submitted');
});
