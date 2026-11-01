import { Keypair } from 'npm:@solana/web3.js@1.98.4';
import runtimePumpSdk from './pumpSdkRuntime.ts';
const { PUMP_PROGRAM_ID } = runtimePumpSdk;
import { rpcRequest } from './mintWallet.ts';

export const appBaseUrl = 'https://solvalidate.base44.app';
// create_v2 mints under Token-2022 today; accept legacy SPL too so a program change never hides a landed launch.
export const tokenPrograms = ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'];

// Metaplex caps the on-chain uri at 200 bytes, so social links never go in it: the
// coin mint is the key the metadata endpoint uses to read them back.
export function metadataUri(mint, coinMint = '') {
  const params = new URLSearchParams({ mint });
  if (coinMint) params.set('coin', coinMint);
  return `${appBaseUrl}/functions/inscriptionMetadata?${params.toString()}`;
}
export function assetUri(mint, asset = 'image') { return `${appBaseUrl}/functions/inscriptionMetadata?mint=${mint}&asset=${asset}`; }
export function imageUri(mint) { return assetUri(mint, 'image'); }

// A random request ID produces a fresh mint, but retries reproduce that same keypair.
// HMAC prevents the public request ID from revealing the mint's private key.
export async function launchMint(walletBytes, userId, input) {
  const key = await crypto.subtle.importKey('raw', walletBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const message = JSON.stringify(['pump-launch-v1', userId, input.requestId, input.inscribedMint, input.name, input.symbol]);
  const seed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Keypair.fromSeed(new Uint8Array(seed));
}

export async function isLaunched(rpcUrl, coinMint, bondingCurve) {
  const response = await rpcRequest(rpcUrl, 'getMultipleAccounts', [[coinMint, bondingCurve], { encoding: 'base64', commitment: 'confirmed', dataSlice: { offset: 0, length: 0 } }]);
  const [mint, curve] = response.value;
  return tokenPrograms.includes(mint?.owner) && curve?.owner === PUMP_PROGRAM_ID.toBase58();
}

// Resolves the current on-chain state of a saved attempt. 'expired' means nothing landed and a resend is safe.
export async function settleAttempt(rpcUrl, attempt) {
  const launched = await isLaunched(rpcUrl, attempt.coinMint, attempt.bondingCurve);
  if (attempt.phase === 'create_pending' && launched) return { status: 'expired', phase: 'buy_ready', error: 'Coin creation confirmed. Resume to submit the first buy.' };
  if (!['create_pending', 'buy_pending'].includes(attempt.phase) && launched) return { status: 'confirmed', phase: 'complete', error: '' };
  const retryPhase = attempt.phase === 'buy_pending' ? 'buy_ready' : attempt.phase;
  if (!attempt.signature) return { status: 'expired', phase: retryPhase, error: 'The transaction was interrupted before it was sent. Resume with the same coin mint.' };
  const state = (await rpcRequest(rpcUrl, 'getSignatureStatuses', [[attempt.signature], { searchTransactionHistory: true }])).value[0];
  if (state?.err) return { status: 'failed', phase: retryPhase, error: `The launch transaction failed on-chain: ${JSON.stringify(state.err)}. Review it before resuming.` };
  if (['confirmed', 'finalized'].includes(state?.confirmationStatus)) {
    if (attempt.phase === 'create_pending') return { status: 'expired', phase: 'buy_ready', error: 'Coin creation confirmed. Resume to submit the first buy.' };
    return { status: 'confirmed', phase: 'complete', error: '' };
  }
  const height = await rpcRequest(rpcUrl, 'getBlockHeight', [{ commitment: 'confirmed' }]);
  if (attempt.lastValidBlockHeight && height > attempt.lastValidBlockHeight) return { status: 'expired', phase: retryPhase, error: 'The transaction expired before confirming. Resume with the same coin mint.' };
  return { status: 'pending', error: '' };
}