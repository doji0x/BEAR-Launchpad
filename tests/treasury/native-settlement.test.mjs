import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeSettlement, assertSameNativeLaunch, assertNativeSubmission, findPreparedSignature } from '../../base44/shared/nativeLaunchState.js';
import { nativeLaunchPolicy } from '../../base44/shared/nativePairPolicy.js';
import { key, web3 } from './fixtures.mjs';
const row = extra => ({ ...nativeLaunchPolicy(), policyAccepted: true, requestId: 'request', walletAddress: key().toBase58(),
  coinMint: key().toBase58(), status: 'pending', signature: 'sig', creationSignature: '', firstBuyAmount: '1', name: 'Test', symbol: 'TST',
  launchMode: 'upload', metadataUrl: 'https://example.com/m.json', imageUrl: '', creatorFeeBps: 0, socials: {}, launchStep: 'create_lock_buy',
  preparedMessageBase64: 'approved-message', lastValidBlockHeight: 120, preparedSlot: 50, ...extra });
function context(extra = {}) {
  let verifications = 0;
  const tx = { slot: 100, meta: { err: null }, transaction: { signatures: ['sig'], message: 'approved-message' } };
  const connection = { getBlockHeight: async () => 100, getSignatureStatuses: async () => ({ value: [{ confirmationStatus: 'finalized', err: null }] }),
    getTransaction: async () => tx, ...extra };
  const settle = createNativeSettlement({ messageBase64: value => value, verify: async () => { verifications++; return { sharingConfigAddress: 'config', quoteTokenProgram: 'program', graduated: false }; } });
  return { connection, tx, settle, count: () => verifications };
}
test('a matching finalized transaction plus on-chain fee proof is required', async () => {
  const c = context(), result = await c.settle(c.connection, row());
  assert.equal(result.status, 'confirmed'); assert.equal(result.policyVerified, true);
  assert.equal(result.automationEligible, false); assert.equal(result.creationSignature, 'sig'); assert.equal(c.count(), 1);
});
test('processed/confirmed transactions do not become verified and are not rebuilt', async () => {
  for (const status of ['processed', 'confirmed']) {
    const c = context({ getSignatureStatuses: async () => ({ value: [{ confirmationStatus: status }] }) });
    const result = await c.settle(c.connection, row());
    assert.equal(result.status, 'pending'); assert.equal(result.policyVerified, false); assert.equal(c.count(), 0);
  }
});
test('RPC receipt lag does not mark a finalized transaction failed', async () => {
  const c = context({ getTransaction: async () => null });
  assert.equal((await c.settle(c.connection, row())).status, 'pending'); assert.equal(c.count(), 0);
});
test('failure and unrelated finalized receipts cannot grant the launch policy', async () => {
  const c = context(); c.tx.meta.err = { InstructionError: [1, 'error'] };
  assert.equal((await c.settle(c.connection, row())).status, 'failed'); assert.equal(c.count(), 0);
  c.tx.meta.err = null; c.tx.transaction.message = 'unrelated';
  await assert.rejects(() => c.settle(c.connection, row()), /does not belong/);
});
test('an unverified candidate signature cannot poison the saved transaction', async () => {
  const c = context({ getTransaction: async () => null });
  const result = await c.settle(c.connection, row({ signature: '' }), 'unrelated-pending');
  assert.equal(result.signature, ''); assert.equal(result.status, 'prepared');
  const d = context(); d.tx.transaction.signatures = ['unrelated'];
  d.tx.transaction.message = 'different';
  await assert.rejects(() => d.settle(d.connection, row({ signature: '' }), 'unrelated'), /does not belong/);
});
test('failed on-chain fee verification stays blocked, not confirmed', async () => {
  const c = context();
  const settle = createNativeSettlement({ messageBase64: value => value, verify: async () => { throw new Error('Migration is in progress'); } });
  const result = await settle(c.connection, row());
  assert.equal(result.status, 'pending'); assert.equal(result.policyVerified, false); assert.equal(result.feeLockStatus, 'blocked');
});
test('split creation stops at awaiting-first-buy and never calls it a completed buy', async () => {
  const c = context(), result = await c.settle(c.connection, row({ launchStep: 'create_lock' }));
  assert.equal(result.status, 'awaiting_first_buy'); assert.equal(result.creationSignature, 'sig');
  assert.equal(result.firstBuySignature, ''); assert.equal(result.firstBuyStatus, 'not_started'); assert.equal(result.policyVerified, true);
});
test('a failed separate first buy preserves the already-created and locked coin', async () => {
  const c = context(); c.tx.meta.err = { error: 'slippage' };
  const result = await c.settle(c.connection, row({ launchStep: 'first_buy', creationSignature: 'creation', policyVerified: true }));
  assert.equal(result.status, 'failed'); assert.equal(result.feeLockStatus, 'verified'); assert.equal(result.policyVerified, true);
  c.tx.meta.err = null;
  const completed = await c.settle(c.connection, row({ launchStep: 'first_buy', creationSignature: 'creation', policyVerified: true }));
  assert.equal(completed.creationSignature, 'creation'); assert.equal(completed.firstBuySignature, 'sig');
});
test('expiration is double-checked against a finalization race', async () => {
  let reads = 0;
  const c = context({ getBlockHeight: async () => 130, getSignatureStatuses: async () => ({ value: [++reads === 1 ? null : { confirmationStatus: 'confirmed' }] }) });
  assert.equal((await c.settle(c.connection, row())).status, 'pending');
  c.connection.getSignatureStatuses = async () => ({ value: [null] });
  assert.equal((await c.settle(c.connection, row())).status, 'expired');
});
test('expired approvals recover exact messages submitted outside the server', async () => {
  const c = context({ getBlockHeight: async () => 130 });
  const settle = createNativeSettlement({ messageBase64: value => value, verify: async () => ({ sharingConfigAddress: 'config' }), recoverSignature: async () => 'sig' });
  assert.equal((await settle(c.connection, row({ signature: '' }))).status, 'confirmed');
  const connection = { getFirstAvailableBlock: async () => 0, getSignaturesForAddress: async () => [{ signature: 'sig', slot: 70 }], getTransaction: async () => c.tx };
  assert.equal(await findPreparedSignature(connection, row(), { PublicKey: web3.PublicKey, messageBase64: value => value }), 'sig');
  connection.getTransaction = async () => null;
  await assert.rejects(() => findPreparedSignature(connection, row(), { PublicKey: web3.PublicKey, messageBase64: value => value }), /incomplete/);
});
test('saved identity and submit message cannot be changed across retries or requests', () => {
  const saved = row({ status: 'prepared' });
  assertSameNativeLaunch(saved, { ...saved });
  for (const patch of [{ firstBuyAmount: '2' }, { walletAddress: key().toBase58() }, { name: 'Other' }, { requestId: 'different' }])
    assert.throws(() => assertSameNativeLaunch(saved, { ...saved, ...patch }));
  assertNativeSubmission(saved, { requestId: saved.requestId, messageBase64: saved.preparedMessageBase64 });
  assert.throws(() => assertNativeSubmission(saved, { requestId: 'other', messageBase64: saved.preparedMessageBase64 }));
  assert.throws(() => assertNativeSubmission(saved, { requestId: saved.requestId, messageBase64: 'other' }));
  assert.throws(() => assertNativeSubmission({ ...saved, status: 'confirmed' }, { requestId: saved.requestId, messageBase64: saved.preparedMessageBase64 }));
});
