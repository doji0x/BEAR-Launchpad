import { Buffer } from 'node:buffer';
import { Connection, PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { rpcRequest } from './mintWallet.ts';
import { isLaunched } from './pumpLaunch.ts';
import { NATIVE_PAIR_POLICY_VERSION } from './nativePairPolicy.js';
import { createNativeSettlement, findPreparedSignature } from './nativeLaunchState.js';
import { withNativeLaunchLease } from './nativeLaunchLease.ts';
import { treasuryLaunch } from './treasuryLaunch.ts';

export function publicAttempt({ submitToken, preparedTransaction, preparedMessageBase64, lockToken, lockUntil, ...attempt }) { return attempt; }
export const settleNativeLaunch = createNativeSettlement({ verify: treasuryLaunch.verify,
  messageBase64: message => Buffer.from(message.serialize()).toString('base64'),
  recoverSignature: (connection, row) => findPreparedSignature(connection, row, { PublicKey, messageBase64: message => Buffer.from(message.serialize()).toString('base64') }) });
export async function checkPublicLaunch(base44, rpcUrl, body) {
  const requestId = String(body.requestId || ''), walletAddress = String(body.walletAddress || '');
  if (!/^[0-9a-f-]{36}$/i.test(requestId) || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) throw new Error('Invalid saved launch.');
  const attempts = base44.asServiceRole.entities.PublicLaunchAttempt;
  const rows = await attempts.filter({ requestId, walletAddress }, 'created_date', 2);
  if (!rows.length) return { attempt: null };
  if (rows.length !== 1) throw new Error('Duplicate launch records require administrator review.');
  const row = rows[0];
  let changes;
  if (row.nativePairPolicyVersion === NATIVE_PAIR_POLICY_VERSION) {
    const signature = String(body.signature || '');
    if (signature && !/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature)) throw new Error('Invalid confirmation signature.');
    return withNativeLaunchLease(attempts, row, async (locked, save) => {
      if (!locked.preparedMessageBase64) return { attempt: publicAttempt(locked) };
      const changes = await settleNativeLaunch(new Connection(rpcUrl, { commitment: 'confirmed', fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(20000) }) }), locked, signature);
      return { attempt: publicAttempt(await save({ ...changes, checkedAt: new Date().toISOString() })) };
    });
  } else {
    // Read-only recovery for old launches. Do not silently grant the new policy.
    let status = 'pending';
    if (await isLaunched(rpcUrl, row.coinMint, row.bondingCurve)) status = 'confirmed';
    else {
      const height = await rpcRequest(rpcUrl, 'getBlockHeight', [{ commitment: 'finalized' }]);
      const signature = row.signature || String(body.signature || '');
      const state = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature)
        ? (await rpcRequest(rpcUrl, 'getSignatureStatuses', [[signature], { searchTransactionHistory: true }])).value[0] : null;
      status = state?.err ? 'failed' : state ? 'pending' : height > row.lastValidBlockHeight ? 'expired' : signature ? 'pending' : 'prepared';
    }
    changes = { status, policyVerified: false, automationEligible: false, feeLockStatus: 'legacy_unverified' };
  }
  const updated = await attempts.update(row.id, { ...changes, checkedAt: new Date().toISOString() });
  return { attempt: publicAttempt(updated) };
}
