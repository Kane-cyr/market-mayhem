import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryDb } from '../api/_lib/db.js';

test('cash remains pending until the owning player acknowledges it', async () => {
  const db = memoryDb();
  const sender = await db.createPlayer('sender', 'hash');
  const recipient = await db.createPlayer('recipient', 'hash');
  const payment = await db.addCash(recipient.id, 12500, 'test payment', sender.id);

  assert.deepEqual((await db.pendingCash(recipient.id)).map(x => x.id), [payment.id]);
  await db.ackCash([payment.id], sender.id);
  assert.equal((await db.pendingCash(recipient.id)).length, 1);

  await db.ackCash([payment.id], recipient.id);
  assert.equal((await db.pendingCash(recipient.id)).length, 0);
  await db.ackCash([payment.id], recipient.id);
  assert.equal((await db.pendingCash(recipient.id)).length, 0);
});

test('gifts remain pending until the recipient acknowledges them', async () => {
  const db = memoryDb();
  const sender = await db.createPlayer('gifter', 'hash');
  const recipient = await db.createPlayer('receiver', 'hash');
  await db.addGift(sender.id, recipient.id, 'watch', 2500);

  const pending = await db.pendingGifts(recipient.id);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].item_id, 'watch');
  assert.equal(pending[0].from, 'gifter');

  await db.ackGifts([pending[0].id], sender.id);
  assert.equal((await db.pendingGifts(recipient.id)).length, 1);

  await db.ackGifts([pending[0].id], recipient.id);
  assert.equal((await db.pendingGifts(recipient.id)).length, 0);
  await db.ackGifts([pending[0].id], recipient.id);
  assert.equal((await db.pendingGifts(recipient.id)).length, 0);
});

import { handleGame } from '../api/_lib/core.js';
import { makeToken } from '../api/_lib/auth.js';

test('ranked sync payloads are resent until the client acknowledges them', async () => {
  const db = memoryDb();
  const player = await db.createPlayer('rankedtester', 'hash');
  const headers = { authorization: 'Bearer ' + makeToken(player.id) };
  const started = await handleGame(db, 'start', {}, headers);
  assert.equal(started.status, 200);
  const runId = started.body.runId;

  await db.addCash(player.id, 7500, 'late reward');
  const first = await handleGame(db, 'sync', { runId, t: 1 }, headers);
  assert.ok(first.body.cfg);
  const firstPayload = JSON.parse(Buffer.from(first.body.cfg, 'base64').toString('utf8'));
  assert.equal(firstPayload.cash.length, 1);
  assert.equal(firstPayload.cash[0].amount, 7500);

  const retry = await handleGame(db, 'sync', { runId, t: 1 }, headers);
  const retryPayload = JSON.parse(Buffer.from(retry.body.cfg, 'base64').toString('utf8'));
  assert.equal(retryPayload.pid, firstPayload.pid);
  assert.equal(retryPayload.cash.length, 1);

  const ack = await handleGame(db, 'sync_ack', { runId, payloadId: firstPayload.pid }, headers);
  assert.equal(ack.status, 200);
  assert.equal((await db.run(runId)).issued[0].acked, true);

  const next = await handleGame(db, 'sync', { runId, t: 2 }, headers);
  assert.equal(next.body.none, true);
});
