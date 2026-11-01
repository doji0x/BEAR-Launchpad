import { Buffer } from 'node:buffer';
import BN from 'npm:bn.js@5.2.5';
import nacl from 'npm:tweetnacl@1.0.3';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.53';
import * as web3 from 'npm:@solana/web3.js@1.99.0';
import sdk from '../../shared/pumpSdkRuntime.ts';
import { secrets } from 'base44:runtime';
import { compileLaunchTransaction, TransactionTooLargeError } from '../../shared/launchTransaction.ts';
import { assertMainnet } from '../../shared/mintWallet.ts';
import { isLaunched } from '../../shared/pumpLaunch.ts';
import { authorizeLaunch, resolveLaunchSource } from '../../shared/publicLaunchSource.ts';
import { supportedPairOptions, tokenBalance } from '../../shared/pumpPairs.ts';
import { checkPublicLaunch, publicAttempt, settleNativeLaunch } from '../../shared/publicLaunchAttempts.ts';
import { verifySignedMessage } from '../../shared/walletSignature.ts';
import { treasuryLaunch } from '../../shared/treasuryLaunch.ts';
import { policyAssert } from '../../shared/treasuryPolicy.js';
import { nativeLaunchPolicy, assertNativeLaunchIntent, creatorFeeBpsFromPercent, NATIVE_PAIR_POLICY_VERSION } from '../../shared/nativePairPolicy.js';
import { assertSameNativeLaunch, assertNativeSubmission } from '../../shared/nativeLaunchState.js';
import { createNativeQuoteTools } from '../../shared/nativeQuoteCore.js';
import { configuredNativeLookupTables, loadNativeLookupTables } from '../../shared/nativeLaunchLookup.ts';
import { withNativeLaunchLease } from '../../shared/nativeLaunchLease.ts';

const { PublicKey, Connection, VersionedTransaction, ComputeBudgetProgram } = web3;
const { OnlinePumpSdk, bondingCurvePda } = sdk;
const quotes = createNativeQuoteTools({ sdk, web3, BN });
const addressPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const requestIdPattern = /^[0-9a-f-]{36}$/i;
const messageBase64 = tx => Buffer.from(tx.message.serialize()).toString('base64');
const bytesBase64 = tx => Buffer.from(tx.serialize()).toString('base64');
function requireId(body) {
  policyAssert(requestIdPattern.test(String(body.requestId || '')), 'Invalid launch request.');
}
function socialUrl(value, label) {
  const text = String(value || '').trim();
  if (!text) return '';
  let url;
  try { url = new URL(text); } catch { throw new Error(`Enter a valid ${label} URL.`); }
  policyAssert(text.length <= 200 && ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password, `Enter a valid ${label} URL of at most 200 characters.`);
  return url.toString();
}
function inputFrom(body) {
  assertNativeLaunchIntent(body); // Validate the request, not a server-overwritten copy.
  policyAssert(!body.isMayhemMode && !body.isCashbackEnabled && !body.isHolderReward, 'Unsupported launch mode.');
  policyAssert(body.launchMode === 'upload', 'New launches use uploaded images. Legacy inscription launches are read-only.');
  const input = { ...nativeLaunchPolicy(), policyAccepted: true, launchMode: 'upload', inscribedMint: '',
    requestId: String(body.requestId || ''), walletAddress: String(body.walletAddress || ''), coinMint: String(body.coinMint || ''),
    name: String(body.name || '').trim(), symbol: String(body.symbol || '').trim().toUpperCase(),
    description: String(body.description || '').trim(), metadataUrl: String(body.metadataUrl || ''), imageUrl: String(body.imageUrl || ''),
    firstBuyAmount: String(body.firstBuyAmount || '').trim(), creatorFeeBps: creatorFeeBpsFromPercent(body.creatorFeePercent),
    socials: { website: socialUrl(body.website, 'website'), twitter: socialUrl(body.twitter, 'X / Twitter'), github: socialUrl(body.github, 'GitHub') } };
  requireId(input);
  policyAssert(addressPattern.test(input.walletAddress) && addressPattern.test(input.coinMint), 'Invalid wallet or coin mint.');
  policyAssert(input.name && Buffer.byteLength(input.name) <= 32 && input.symbol && Buffer.byteLength(input.symbol) <= 10 && input.description.length <= 2000, 'Check the coin name, ticker, and description.');
  policyAssert(body.creatorFeeBps === input.creatorFeeBps, 'Creator fee differs from the approved launch intent.');
  authorizeLaunch(body, input, input.walletAddress, input.coinMint, input.socials, input.feeRecipients);
  return input;
}
async function submissionKey() {
  const secret = secrets.get('INSCRIPTION_API_KEY');
  policyAssert(typeof secret === 'string' && secret.length >= 16, 'The launch authorization secret is not configured.');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`bear-native-launch-v2:${secret}`));
  return crypto.subtle.importKey('raw', hash, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
const tokenMessage = (requestId, encoded) => new TextEncoder().encode(JSON.stringify([requestId, encoded]));
async function submitToken(requestId, encoded) {
  const sig = await crypto.subtle.sign('HMAC', await submissionKey(), tokenMessage(requestId, encoded));
  return Buffer.from(sig).toString('hex');
}
async function verifyToken(requestId, encoded, token) {
  return /^[0-9a-f]{64}$/.test(token) && crypto.subtle.verify('HMAC', await submissionKey(), Buffer.from(token, 'hex'), tokenMessage(requestId, encoded));
}
async function oneAttempt(db, requestId) {
  const rows = await db.filter({ requestId }, 'created_date', 2);
  policyAssert(rows.length <= 1, 'Duplicate saved launch records require review.');
  return rows[0];
}
function preparedResponse(row) {
  return { ...publicAttempt(row), transaction: row.preparedTransaction, submitToken: row.submitToken };
}
function tooLarge(error) {
  return error instanceof TransactionTooLargeError || /encoding overruns|overruns Uint8Array|Transaction too large/i.test(error.message || '');
}

export default async function(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405 });
    const text = await req.text();
    if (text.length > 24000) return Response.json({ error: 'Launch request is too large.' }, { status: 413 });
    const body = JSON.parse(text);
    if (['prepareSharing', 'confirmSharing'].includes(body.action)) return Response.json({ error: 'Optional post-launch fee changes are retired. New launches lock the mandatory policy at creation.' }, { status: 410 });
    policyAssert(body.network === 'mainnet-beta', 'Switch to Mainnet to use the launchpad.');
    const rpcUrl = secrets.get('SOLANA_RPC_URL');
    await assertMainnet(rpcUrl);
    const base44 = createClientFromRequest(req), db = base44.asServiceRole.entities.PublicLaunchAttempt;
    const connection = new Connection(rpcUrl, { commitment: 'confirmed', fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(20000) }) });
    const online = new OnlinePumpSdk(connection);
    if (['check', 'checkNormal', 'confirm'].includes(body.action)) return Response.json(await checkPublicLaunch(base44, rpcUrl, body));
    if (body.action === 'options') {
      const [global, pairs, tables] = await Promise.all([online.fetchGlobal(), supportedPairOptions(online), configuredNativeLookupTables(base44, connection)]);
      return Response.json({ ...nativeLaunchPolicy(), pairs, holderRewardEnabled: false,
        creatorFeeConfigurable: global.creatorFeeConfigurable, maxCreatorFeeBps: Number(global.maxConfigurableCreatorFeeBps.toString()),
        launchReady: tables.length > 0, launchDisabledReason: tables.length ? '' : 'An administrator must initialize the BEAR launch lookup table before new launches.' });
    }
    if (body.action === 'resume') {
      policyAssert(addressPattern.test(String(body.walletAddress || '')), 'Invalid wallet address.');
      const rows = await db.filter({ walletAddress: body.walletAddress, status: { $ne: 'confirmed' } }, '-created_date', 100);
      return Response.json({ attempts: rows.map(publicAttempt) });
    }
    if (body.action === 'deleteSaved') {
      requireId(body);
      policyAssert(addressPattern.test(String(body.walletAddress || '')), 'Invalid wallet address.');
      const message = `Curated: delete saved launch\nRequest: ${body.requestId}\nWallet: ${body.walletAddress}`;
      policyAssert(verifySignedMessage(message, String(body.signature || ''), body.walletAddress), 'Approve deletion with the original wallet.');
      const row = await oneAttempt(db, body.requestId);
      if (!row) return Response.json({ deleted: true });
      policyAssert(row.walletAddress === body.walletAddress, 'This launch belongs to another wallet.');
      if (row.nativePairPolicyVersion === NATIVE_PAIR_POLICY_VERSION) {
        return Response.json(await withNativeLaunchLease(db, row, async locked => {
          policyAssert(!locked.creationSignature && !await isLaunched(rpcUrl, locked.coinMint, locked.bondingCurve), 'Live coin records cannot be deleted.');
          if (locked.preparedMessageBase64) {
            const state = await settleNativeLaunch(connection, locked);
            policyAssert(['expired', 'failed'].includes(state.status), 'This approval can still land. Keep it until its outcome is known.');
          }
          await db.delete(locked.id);
          return { deleted: true };
        }));
      }
      policyAssert(!await isLaunched(rpcUrl, row.coinMint, row.bondingCurve) && row.status !== 'pending', 'Check the legacy launch before deleting its record.');
      await db.delete(row.id);
      return Response.json({ deleted: true });
    }
    if (body.action === 'submit') {
      requireId(body);
      const encoded = String(body.transaction || '');
      policyAssert(encoded.length > 0 && encoded.length <= 1800, 'Invalid signed launch transaction.');
      const transaction = VersionedTransaction.deserialize(Buffer.from(encoded, 'base64'));
      const row = await oneAttempt(db, body.requestId);
      policyAssert(row, 'Prepared launch not found.');
      return Response.json(await withNativeLaunchLease(db, row, async (locked, save) => {
        const message = messageBase64(transaction);
        assertNativeSubmission(locked, { requestId: body.requestId, messageBase64: message });
        policyAssert(await verifyToken(locked.requestId, message, String(body.submitToken || '')), 'This approval does not match the saved launch.');
        const tables = await loadNativeLookupTables(connection, locked.lookupTableAddresses || []);
        await treasuryLaunch.validateTransaction(transaction, locked, tables);
        for (let i = 0; i < transaction.signatures.length; i++) policyAssert(nacl.sign.detached.verify(transaction.message.serialize(), transaction.signatures[i], transaction.message.staticAccountKeys[i].toBytes()), 'Missing or invalid wallet/mint signature.');
        // Derive the base58 signature from the SDK serializer without another codec dependency.
        const signature = base58(transaction.signatures[0]);
        policyAssert(!locked.signature || locked.signature === signature, 'A different signed approval is already pending. Check its status.');
        if (await connection.getBlockHeight('confirmed') > locked.lastValidBlockHeight) return { error: 'This approval expired. Check and resume the same saved launch.', reprepare: true };
        if (locked.launchStep === 'first_buy') await treasuryLaunch.verify(connection, locked.coinMint, locked.quoteMint, 'finalized');
        // Persist the only permissible signature BEFORE sending. Ambiguous RPC errors do not authorize a new purchase.
        await save({ signature, status: 'pending', checkedAt: new Date().toISOString() });
        let submitWarning = '';
        try {
          const sent = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false, maxRetries: 2, preflightCommitment: 'confirmed' });
          policyAssert(sent === signature, 'RPC returned an unexpected transaction signature.');
        } catch (error) { submitWarning = error.message || 'Submission is uncertain. Check this saved signature before retrying.'; }
        return { signature, status: 'pending', submitWarning };
      }));
    }
    policyAssert(body.action === 'prepare', 'Invalid launch action.');
    const input = inputFrom(body);
    let row = await oneAttempt(db, input.requestId);
    if (!row) {
      const sameMint = await db.filter({ coinMint: input.coinMint }, 'created_date', 1);
      policyAssert(!sameMint.length, 'This mint already has a saved launch. Resume its original request.');
      row = await db.create({ ...input, bondingCurve: bondingCurvePda(new PublicKey(input.coinMint)).toBase58(), status: 'draft',
        signature: '', creationSignature: '', preparedMessageBase64: '', policyVerified: false, automationEligible: false,
        lockToken: '', lockUntil: '1970-01-01T00:00:00.000Z' });
      row = await oneAttempt(db, input.requestId);
    }
    return Response.json(await withNativeLaunchLease(db, row, async (locked, save) => {
      assertSameNativeLaunch(locked, input);
      let current = locked;
      if (current.preparedMessageBase64) current = await save({ ...await settleNativeLaunch(connection, current), checkedAt: new Date().toISOString() });
      if (current.status === 'confirmed') return { ...publicAttempt(current), alreadyLaunched: true };
      policyAssert(current.status !== 'pending', current.policyError || 'The saved transaction is still pending. Check it before requesting another approval.');
      if (current.status === 'prepared' && current.preparedTransaction) return preparedResponse(current);
      const firstBuyOnly = Boolean(current.creationSignature);
      let curve = null;
      if (firstBuyOnly) curve = (await treasuryLaunch.verify(connection, input.coinMint, input.quoteMint, 'finalized')).curve;
      else policyAssert(!await isLaunched(rpcUrl, input.coinMint, current.bondingCurve), 'This mint already exists. Reconcile its original creation receipt; do not relaunch it.');
      const [{ uri, imageUrl }, quote, global, feeConfig, quoteControl, tables] = await Promise.all([
        resolveLaunchSource(input, input.coinMint), quotes.resolve(online, input.quoteMint), online.fetchGlobal(), online.fetchFeeConfig(),
        online.fetchQuoteControl(), configuredNativeLookupTables(base44, connection) ]);
      policyAssert(tables.length > 0, 'The BEAR launch lookup table has not been initialized.');
      const buy = quotes.firstBuy({ global, feeConfig, quoteControl, quote, firstBuyAmount: input.firstBuyAmount,
        creatorFeeBps: input.creatorFeeBps, bondingCurve: curve });
      const wallet = new PublicKey(input.walletAddress), mint = new PublicKey(input.coinMint);
      policyAssert(await tokenBalance(rpcUrl, input.walletAddress, input.quoteMint, quote.quoteTokenProgram) >= BigInt(buy.quoteAmount.toString()),
        'Hold the required BEAR amount in the connected wallet\'s associated token account. SOL is not automatically converted.');
      policyAssert(await connection.getBalance(wallet, 'confirmed') > 0, 'The launching wallet needs SOL for network fees and account rent.');
      const latest = await connection.getLatestBlockhash('confirmed');
      const fields = { ...input, ...quotes.snapshot(quote, global), metadataUrl: uri, imageUrl, quoteSymbol: 'BEAR',
        quoteAmountAtomic: buy.quoteAmount.toString(), minimumTokens: buy.amount.toString(),
        launchStep: firstBuyOnly ? 'first_buy' : 'create_lock_buy' };
      const build = async (step, units) => {
        const instructions = await treasuryLaunch.build({ global, mint, user: wallet, name: input.name, symbol: input.symbol,
          uri, ...buy, quoteMint: quote.mint, quoteTokenProgram: quote.quoteTokenProgram, pumpQuote: quote.pumpQuote?.accounts, launchStep: step });
        return compileLaunchTransaction({ payerKey: wallet, instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units }), ...instructions],
          blockhash: latest.blockhash, lookupTables: tables });
      };
      let built;
      try { built = await build(fields.launchStep, 1400000); }
      catch (error) {
        if (!tooLarge(error) || firstBuyOnly) throw error;
        fields.launchStep = 'create_lock';
        try { built = await build(fields.launchStep, 1400000); }
        catch (smaller) {
          if (!tooLarge(smaller)) throw smaller;
          throw Object.assign(new Error('Creation and the mandatory fee lock do not fit. Shorten the metadata URL or ask the administrator to refresh the BEAR lookup table. Nothing was launched.'), { status: 422 });
        }
      }
      await treasuryLaunch.validateTransaction(built.transaction, fields, tables);
      const simulation = await connection.simulateTransaction(built.transaction, { commitment: 'confirmed', sigVerify: false });
      if (simulation.value.err) throw Object.assign(new Error('Launch simulation failed. Nothing was signed or submitted.'), { status: 422,
        preflight: { ok: false, error: JSON.stringify(simulation.value.err), logs: (simulation.value.logs || []).slice(-12) } });
      const units = Math.min(1400000, Math.max(300000, Math.ceil((simulation.value.unitsConsumed || 1160000) * 1.2)));
      built = await build(fields.launchStep, units);
      await treasuryLaunch.validateTransaction(built.transaction, fields, tables);
      const encodedMessage = messageBase64(built.transaction);
      const preflight = { ok: true, error: '', unitsConsumed: simulation.value.unitsConsumed || 0,
        transactionBytes: built.transaction.serialize().length, splitFirstBuy: fields.launchStep === 'create_lock', logs: [] };
      const saved = await save({ ...fields, status: 'prepared', signature: '', preparedTransaction: bytesBase64(built.transaction),
        preparedMessageBase64: encodedMessage, submitToken: await submitToken(input.requestId, encodedMessage),
        lookupTableAddresses: tables.map(table => table.key.toBase58()), preparedSlot: simulation.context.slot,
        lastValidBlockHeight: latest.lastValidBlockHeight, preflight, automationEligible: false, checkedAt: new Date().toISOString() });
      return preparedResponse(saved);
    }));
  } catch (error) { return Response.json({ error: error.message || 'Unable to process the BEAR launch.', ...(error.preflight ? { preflight: error.preflight } : {}) }, { status: error.status || 500 }); }
}

function base58(bytes) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let value = BigInt(`0x${Buffer.from(bytes).toString('hex')}`), encoded = '';
  while (value > 0n) { encoded = alphabet[Number(value % 58n)] + encoded; value /= 58n; }
  for (const byte of bytes) { if (byte !== 0) break; encoded = `1${encoded}`; }
  return encoded;
}
