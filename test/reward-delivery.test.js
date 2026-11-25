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
