import { NATIVE_PAIR_POLICY_VERSION, assertNativeLaunchIntent, nativeLaunchIntent } from './nativePairPolicy.js';
import { policyAssert } from './treasuryPolicy.js';

export function assertSavedNativeLaunch(row) {
  policyAssert(row?.nativePairPolicyVersion === NATIVE_PAIR_POLICY_VERSION,
    'This saved launch predates the BEAR policy. Check its status; do not resubmit it as a new BEAR launch.');
  assertNativeLaunchIntent(row);
}
export function assertSameNativeLaunch(row, proposed) {
  assertSavedNativeLaunch(row);
  policyAssert(nativeLaunchIntent(row) === nativeLaunchIntent(proposed), 'Saved launch identity, quote, buy amount, or fee policy cannot be changed.');
}
export function assertNativeSubmission(row, { requestId, messageBase64 }) {
  assertSavedNativeLaunch(row);
  policyAssert(row.requestId === requestId && ['prepared', 'pending'].includes(row.status), 'This launch cannot be submitted in its current state.');
  policyAssert(row.preparedMessageBase64 && messageBase64 === row.preparedMessageBase64, 'Signed transaction differs from this saved launch.');
}
/** Read-only signature recovery for an expired approval submitted outside this server.
 * Refuse to re-prepare if RPC history does not cover the preparation slot.
 */
export async function findPreparedSignature(connection, row, { PublicKey, messageBase64 }) {
  policyAssert(Number.isSafeInteger(row.preparedSlot), 'Missing preparation slot; reconcile this approval before retrying.');
  const earliest = await connection.getFirstAvailableBlock();
  policyAssert(Number.isSafeInteger(earliest) && earliest <= row.preparedSlot, 'RPC history no longer covers this approval; reconcile it before retrying.');
  let before;
  for (let page = 0; page < 5; page++) {
    const rows = await connection.getSignaturesForAddress(new PublicKey(row.coinMint), { limit: 100, ...(before ? { before } : {}) }, 'finalized');
    for (const item of rows) {
      if (item.slot < row.preparedSlot) return '';
      const tx = await connection.getTransaction(item.signature, { commitment: 'finalized', maxSupportedTransactionVersion: 0 });
      policyAssert(tx?.meta, 'RPC transaction history is incomplete; this approval cannot safely be replaced.');
      if (messageBase64(tx.transaction.message) === row.preparedMessageBase64) return item.signature;
    }
    if (rows.length < 100) return '';
    before = rows.at(-1).signature;
  }
  throw Object.assign(new Error('Signature recovery reached its safety limit. Reconcile this saved approval before retrying.'), { status: 409 });
}
/** Reconcile an exact saved transaction; chain existence alone is never policy verification. */
export function createNativeSettlement({ verify, messageBase64, recoverSignature = null, now = () => new Date().toISOString() }) {
  return async function settle(connection, row, candidateSignature = '') {
    assertSavedNativeLaunch(row);
    const created = Boolean(row.creationSignature);
    const pending = { status: 'pending', policyVerified: created && row.policyVerified === true, automationEligible: false,
      feeLockStatus: created ? 'verified' : 'pending', firstBuyStatus: row.launchStep === 'create_lock' ? 'not_started' : 'pending' };
    let signature = row.signature;
    if (!signature && candidateSignature) {
      const candidate = await connection.getTransaction(candidateSignature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
      if (candidate) {
        policyAssert(candidate.transaction.signatures[0] === candidateSignature && messageBase64(candidate.transaction.message) === row.preparedMessageBase64,
          'The confirmation signature does not belong to the prepared launch.');
        signature = candidateSignature;
      }
    }
    const height = await connection.getBlockHeight('finalized');
    if (!signature && height > row.lastValidBlockHeight && row.preparedMessageBase64 && recoverSignature)
      signature = await recoverSignature(connection, row);
    if (signature) {
      const status = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
      if (status?.confirmationStatus === 'finalized') {
        const tx = await connection.getTransaction(signature, { commitment: 'finalized', maxSupportedTransactionVersion: 0 });
        if (!tx?.meta) return { ...pending, signature, policyError: 'Waiting for the finalized transaction receipt.' };
        policyAssert(tx.transaction.signatures[0] === signature && messageBase64(tx.transaction.message) === row.preparedMessageBase64,
          'The confirmation signature does not belong to the prepared launch.');
        if (tx.meta.err) return { ...pending, signature, status: 'failed', feeLockStatus: created ? 'verified' : 'failed',
          firstBuyStatus: row.launchStep === 'create_lock' ? 'not_started' : 'failed', policyError: JSON.stringify(tx.meta.err) };
        try {
          const proof = await verify(connection, row.coinMint, row.quoteMint, 'finalized');
          const bought = row.launchStep !== 'create_lock';
          return { status: bought ? 'confirmed' : 'awaiting_first_buy', signature, policyVerified: true, automationEligible: false,
            feeLockStatus: 'verified', feeLockVerifiedAt: now(), policyError: '', rewardStatus: 'confirmed',
            creationSignature: row.creationSignature || signature, firstBuySignature: bought ? signature : '',
            firstBuyStatus: bought ? 'confirmed' : 'not_started', sharingConfigAddress: proof.sharingConfigAddress,
            quoteTokenProgram: proof.quoteTokenProgram, quoteSymbol: 'BEAR', graduated: proof.graduated, finalizedSlot: tx.slot };
        } catch (error) {
          return { ...pending, signature, feeLockStatus: 'blocked', policyVerified: false,
            policyError: error.message || 'On-chain launch policy has not been verified.' };
        }
      }
      if (status) return { ...pending, signature }; // Not finalized: never rebuild or assume failure.
    }
    if (height > row.lastValidBlockHeight) {
      if (signature && (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0]) return { ...pending, signature };
      if (signature && recoverSignature) {
        const recovered = await recoverSignature(connection, row);
        if (recovered) return { ...pending, signature: recovered, policyError: 'A receipt was found; waiting for its finalized signature status.' };
      }
      return { ...pending, status: 'expired', signature: signature || '', feeLockStatus: created ? 'verified' : 'unverified', policyError: '' };
    }
    return { ...pending, status: signature ? 'pending' : 'prepared', signature: signature || '', policyError: '' };
  };
}
