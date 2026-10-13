import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fixture, tools, sdk, web3, spl, key, stable, quoteMint } from '../treasury/fixtures.mjs';
import { quoteFixture } from '../treasury/quoteFixtures.mjs';
import { proofFixture, mintInfo } from '../treasury/proofFixtures.mjs';
import { nativeLaunchPolicy, nativeLaunchIntent } from '../../base44/shared/nativePairPolicy.js';
const require = createRequire(import.meta.url), nacl = require('tweetnacl'), bs58 = require('bs58');
const { default: handler } = await import('../../base44/functions/publicPumpLaunch/entry.ts');
let active;
function collection(rows = []) {
  const matches = (row, filter) => Object.entries(filter).every(([key, wanted]) => typeof wanted === 'object' && wanted !== null ?
    Object.entries(wanted).every(([operator, value]) => operator === '$ne' ? row[key] !== value : operator === '$lte' ? row[key] <= value : operator === '$gt' ? row[key] > value : false) : row[key] === wanted);
  return { rows, filter: async (filter = {}, _sort, limit = 100, skip = 0) => structuredClone(rows.filter(row => matches(row, filter)).slice(skip, skip + limit)),
    create: async data => { const row = { ...structuredClone(data), id: `row-${rows.length}`, created_date: new Date().toISOString() }; rows.push(row); return structuredClone(row); },
    update: async (id, data) => { const row = rows.find(row => row.id === id); Object.assign(row, structuredClone(data)); return structuredClone(row); },
    updateMany: async (filter, update) => { for (const row of rows.filter(row => matches(row, filter))) Object.assign(row, structuredClone(update.$set)); },
    delete: async id => { const index = rows.findIndex(row => row.id === id); if (index >= 0) rows.splice(index, 1); } };
}
function encodeTable(addresses) {
  const data = Buffer.alloc(56 + addresses.length * 32); data.writeUInt32LE(1); data.writeBigUInt64LE(18446744073709551615n, 4);
  data.writeBigUInt64LE(1n, 12); data[21] = 1;
  new web3.PublicKey(nativeLaunchPolicy().treasuryAddress).toBuffer().copy(data, 22);
  addresses.forEach((key, i) => key.toBuffer().copy(data, 56 + i * 32));
  return { data, owner: web3.AddressLookupTableProgram.programId, lamports: 10000000, executable: false };
}
const originals = new Map();
for (const [name, fn] of Object.entries({
  getLatestBlockhash: async () => { active.blockhashReads++; return { blockhash: active.blockhash, lastValidBlockHeight: 250 }; },
  getSlot: async () => 100,
  getBlockHeight: async () => active.height,
  getFirstAvailableBlock: async () => 0,
  getBalance: async () => 1000000000,
  getAccountInfo: async key => active.map.get(key.toBase58()) || null,
  getMultipleAccountsInfo: async keys => keys.map(key => active.map.get(key.toBase58()) || null),
  simulateTransaction: async tx => { active.simulations++; active.simulated = tx; return { context: { slot: 100 }, value: { err: active.simulationError || null, unitsConsumed: 450000, logs: [] } }; },
  getTransaction: async signature => active.transactions.get(signature) || null,
  getSignatureStatuses: async signatures => ({ value: signatures.map(signature => active.statuses.get(signature) || null) }),
  getSignaturesForAddress: async () => [...active.transactions].map(([signature, tx]) => ({ signature, slot: tx.slot })),
  sendRawTransaction: async bytes => {
    const tx = web3.VersionedTransaction.deserialize(bytes), signature = bs58.encode(tx.signatures[0]);
    assert.ok(active.db.rows.some(row => row.signature === signature && row.status === 'pending'), 'signature must be persisted before broadcast');
    active.sends.push(signature);
    if (active.ambiguousSend) throw new Error('RPC timed out after possible submission');
    return signature;
  },
})) { originals.set(name, web3.Connection.prototype[name]); web3.Connection.prototype[name] = fn; }
for (const [name, fn] of Object.entries({ fetchGlobal: async () => active.q.global, fetchFeeConfig: async () => null,
  fetchQuoteControl: async () => active.q.quoteControl, resolveQuoteMint: async mint => { assert.ok(mint.equals(quoteMint)); return active.q.quote; } })) {
  originals.set(`sdk:${name}`, sdk.OnlinePumpSdk.prototype[name]); sdk.OnlinePumpSdk.prototype[name] = fn;
}
const oldFetch = globalThis.fetch;
globalThis.fetch = async (_url, options) => {
  const { method, params, id } = JSON.parse(options.body);
  let result;
  if (method === 'getBlockHeight') result = active.height;
  else if (method === 'getGenesisHash') result = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  else if (method === 'getMultipleAccounts') result = { value: params[0].map(address => {
    const info = active.map.get(address); return info ? { owner: info.owner.toBase58() } : null;
  }) };
  else if (method === 'getTokenAccountsByOwner') result = { value: [{ pubkey: spl.getAssociatedTokenAddressSync(quoteMint, active.wallet.publicKey, false, active.q.quote.quoteTokenProgram).toBase58(), account: { data: { parsed: { info: { tokenAmount: { amount: '1000000000000' } } } } } }] };
  else throw new Error(`Unexpected network call in test: ${method}`);
  return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), { status: 200 });
};
test.after(() => {
  globalThis.fetch = oldFetch;
  for (const [name, fn] of originals) if (name.startsWith('sdk:')) sdk.OnlinePumpSdk.prototype[name.slice(4)] = fn; else web3.Connection.prototype[name] = fn;
});
async function setup({ long = false, noTable = false } = {}) {
  const q = quoteFixture(), wallet = web3.Keypair.generate(), mint = web3.Keypair.generate();
  const f = await fixture({ global: q.global }), other = await fixture({ global: q.global });
  const address = key().toBase58(), map = new Map([[address, encodeTable(stable([f.instructions, other.instructions]))], [quoteMint.toBase58(), mintInfo()]]);
  const db = collection(), lookup = collection(noTable ? [] : [{ id: 'table', label: 'pump-launch-bear-v1', address }]);
  active = { q, wallet, mint, db, map, height: 100, simulations: 0, sends: [], statuses: new Map(), transactions: new Map(),
    blockhash: key().toBase58(), blockhashReads: 0,
    secrets: { SOLANA_RPC_URL: 'https://rpc.invalid', INSCRIPTION_API_KEY: 'test-only-secret-not-a-production-key' },
    client: { auth: { me: async () => ({ role: 'admin' }) }, asServiceRole: { entities: { PublicLaunchAttempt: db, LaunchLookupTable: lookup } } } };
  globalThis.nativeTest = active;
  const input = { ...nativeLaunchPolicy(), policyAccepted: true, network: 'mainnet-beta', launchMode: 'upload',
    requestId: crypto.randomUUID(), coinMint: mint.publicKey.toBase58(), walletAddress: wallet.publicKey.toBase58(),
    name: long ? 'N'.repeat(32) : 'Test', symbol: long ? 'S'.repeat(10) : 'TST', description: '',
    metadataUrl: long ? `https://example.com/${'x'.repeat(180)}` : 'https://example.com/m.json', imageUrl: 'https://example.com/image.png',
    firstBuyAmount: '1', creatorFeePercent: long ? '5' : '', creatorFeeBps: long ? 500 : 0,
    socials: { website: '', twitter: '', github: '' }, website: '', twitter: '', github: '' };
  input.mintAuthorization = Buffer.from(nacl.sign.detached(new TextEncoder().encode(nativeLaunchIntent(input)), mint.secretKey)).toString('base64');
  return { s: active, input };
}
async function call(body) {
  const response = await handler(new Request('https://app.invalid/launch', { method: 'POST', body: JSON.stringify({ network: 'mainnet-beta', ...body }) }));
  return { status: response.status, data: await response.json() };
}
async function approve(input, prepared) {
  const tx = web3.VersionedTransaction.deserialize(Buffer.from(prepared.transaction, 'base64'));
  tx.sign(prepared.launchStep === 'first_buy' ? [active.wallet] : [active.wallet, active.mint]);
  const result = await call({ action: 'submit', requestId: input.requestId, transaction: Buffer.from(tx.serialize()).toString('base64'), submitToken: prepared.submitToken });
  return { result, tx, signature: bs58.encode(tx.signatures[0]) };
}
async function finalize(signed) {
  const p = await proofFixture({ mint: active.mint.publicKey });
  for (const [key, value] of p.map) active.map.set(key, value);
  active.statuses.set(signed.signature, { confirmationStatus: 'finalized', err: null });
  active.transactions.set(signed.signature, { slot: 110, meta: { err: null }, transaction: { signatures: [signed.signature], message: signed.tx.message } });
}
test('public prepare builds and freezes the actual locked BEAR transaction; cached retry does not rebuild', async () => {
  const { input, s } = await setup();
  const prepared = await call({ ...input, action: 'prepare' });
  assert.equal(prepared.status, 200, JSON.stringify(prepared.data));
  assert.equal(prepared.data.launchStep, 'create_lock_buy'); assert.equal(prepared.data.preflight.ok, true);
  assert.equal(prepared.data.automationEligible, false); assert.equal(s.simulations, 1);
  const again = await call({ ...input, action: 'prepare' });
  assert.equal(again.status, 200, JSON.stringify(again.data)); assert.equal(again.data.transaction, prepared.data.transaction); assert.equal(s.simulations, 1);
  const signed = await approve(input, prepared.data);
  assert.equal(signed.result.status, 200, JSON.stringify(signed.result.data));
  assert.equal(s.sends.length, 1);
  const pending = await call({ ...input, action: 'prepare' }); assert.notEqual(pending.status, 200);
  await finalize(signed);
  const checked = await call({ action: 'check', requestId: input.requestId, walletAddress: input.walletAddress });
  assert.equal(checked.data.attempt.status, 'confirmed', JSON.stringify(checked.data));
  assert.equal(checked.data.attempt.policyVerified, true); assert.equal(checked.data.attempt.automationEligible, false);
});
test('long metadata creates and locks atomically, then resumes only the bounded first buy', async () => {
  const { input, s } = await setup({ long: true });
  const prepared = await call({ ...input, action: 'prepare' });
  assert.equal(prepared.status, 200, JSON.stringify(prepared.data)); assert.equal(prepared.data.launchStep, 'create_lock');
  const creation = await approve(input, prepared.data); await finalize(creation);
  const checked = await call({ action: 'check', requestId: input.requestId, walletAddress: input.walletAddress });
  assert.equal(checked.status, 200, JSON.stringify(checked.data)); assert.equal(checked.data.attempt.status, 'awaiting_first_buy');
  const buy = await call({ ...input, action: 'prepare' });
  assert.equal(buy.status, 200, JSON.stringify(buy.data)); assert.equal(buy.data.launchStep, 'first_buy');
  assert.equal(web3.VersionedTransaction.deserialize(Buffer.from(buy.data.transaction, 'base64')).message.header.numRequiredSignatures, 1);
  const bought = await approve(input, buy.data); await finalize(bought);
  const completed = await call({ action: 'check', requestId: input.requestId, walletAddress: input.walletAddress });
  assert.equal(completed.data.attempt.status, 'confirmed'); assert.equal(completed.data.attempt.creationSignature, creation.signature);
  assert.equal(completed.data.attempt.firstBuySignature, bought.signature); assert.equal(s.sends.length, 2);
  const replay = await call({ ...input, action: 'prepare' }); assert.equal(replay.data.alreadyLaunched, true); assert.equal(s.sends.length, 2);
});
test('wrong quote, holder mode, recipient and consent fail before preparation', async () => {
  const { input, s } = await setup();
  for (const patch of [{ quoteMint: spl.NATIVE_MINT.toBase58() }, { holderReward: true }, { feeRecipients: [] }, { policyAccepted: false }, { cashback: true }]) {
    const result = await call({ ...input, ...patch, action: 'prepare' }); assert.equal(result.status, 400);
  }
  assert.equal(s.simulations, 0); assert.equal(s.db.rows.length, 0); assert.equal(s.sends.length, 0);
});
test('RPC simulation failure is fail-closed and cannot produce a signable response', async () => {
  const { input, s } = await setup(); s.simulationError = { InstructionError: [2, 'error'] };
  const result = await call({ ...input, action: 'prepare' });
  assert.equal(result.status, 422); assert.equal(result.data.preflight.ok, false); assert.equal(result.data.transaction, undefined);
  assert.equal(s.db.rows[0].preparedMessageBase64, ''); assert.equal(s.sends.length, 0);
});
test('missing BEAR lookup table never falls back to SOL or an unlocked creation', async () => {
  const { input, s } = await setup({ noTable: true });
  const options = await call({ action: 'options' }); assert.equal(options.data.launchReady, false);
  const result = await call({ ...input, action: 'prepare' }); assert.equal(result.status, 400); assert.equal(s.sends.length, 0);
});
test('tampered signed message, missing signature and cross-request authorization are rejected', async () => {
  const { input, s } = await setup(), p = await call({ ...input, action: 'prepare' });
  const tx = web3.VersionedTransaction.deserialize(Buffer.from(p.data.transaction, 'base64'));
  let result = await call({ action: 'submit', requestId: input.requestId, transaction: p.data.transaction, submitToken: p.data.submitToken });
  assert.equal(result.status, 400);
  tx.message.recentBlockhash = key().toBase58(); tx.sign([s.wallet, s.mint]);
  result = await call({ action: 'submit', requestId: input.requestId, transaction: Buffer.from(tx.serialize()).toString('base64'), submitToken: p.data.submitToken });
  assert.equal(result.status, 400); assert.equal(s.sends.length, 0);
  result = await call({ action: 'submit', requestId: crypto.randomUUID(), transaction: p.data.transaction, submitToken: p.data.submitToken });
  assert.equal(result.status, 400);
});
test('ambiguous sends retain the same signature and do not permit a second prepared purchase', async () => {
  const { input, s } = await setup(), p = await call({ ...input, action: 'prepare' }); s.ambiguousSend = true;
  const signed = await approve(input, p.data);
  assert.equal(signed.result.status, 200, JSON.stringify(signed.result.data)); assert.equal(signed.result.data.status, 'pending'); assert.equal(s.db.rows[0].signature, signed.signature);
  const retry = await call({ ...input, action: 'prepare' }); assert.equal(retry.status, 400); assert.equal(s.simulations, 1);
});
test('live coin existence by itself cannot become a verified launch', async () => {
  const { input, s } = await setup(), p = await call({ ...input, action: 'prepare' });
  const proof = await proofFixture({ mint: s.mint.publicKey }); for (const [key, info] of proof.map) s.map.set(key, info);
  const result = await call({ action: 'check', requestId: input.requestId, walletAddress: input.walletAddress });
  assert.equal(result.status, 200, JSON.stringify(result.data)); assert.notEqual(result.data.attempt.status, 'confirmed'); assert.equal(result.data.attempt.policyVerified, false);
});
test('post-launch optional sharing and retired creation endpoints return 410', async () => {
  await setup();
  assert.equal((await call({ action: 'prepareSharing' })).status, 410);
  for (const file of ['publicAtomicV1Launch', 'atomicV1PumpLaunch', 'launchPumpCoin', 'inscribeAgentAsset']) {
    const { default: endpoint } = await import(`../../base44/functions/${file}/entry.ts`);
    const response = await endpoint(new Request('https://app.invalid', { method: 'POST', body: JSON.stringify({ action: 'launch' }) }));
    assert.equal(response.status, 410, file);
  }
});
test('admin setup produces only bounded treasury-owned ALT operations; registration checks real accounts', async () => {
  const { s } = await setup({ noTable: true });
  const { default: setupHandler } = await import('../../base44/functions/configureNativeLaunchLookup/entry.ts');
  const { validateNativeLookupSetup } = await import('../../base44/shared/nativeLookupSetupCore.js');
  const invoke = async body => {
    const r = await setupHandler(new Request('https://app.invalid/setup', { method: 'POST', body: JSON.stringify(body) }));
    return { status: r.status, data: await r.json() };
  };
  const walletAddress = nativeLaunchPolicy().treasuryAddress;
  const p = await invoke({ action: 'prepare', walletAddress });
  assert.equal(p.status, 200, JSON.stringify(p.data)); assert.equal(p.data.createRequired, true);
  assert.ok(p.data.transactions.length > 0);
  p.data.transactions.forEach((_tx, i) => validateNativeLookupSetup(web3, p.data, i));
  assert.equal(s.sends.length, 0); // Preparation never signs or broadcasts.
  assert.throws(() => validateNativeLookupSetup(web3, { ...p.data, authority: key().toBase58() }, 0));
  const tx = web3.VersionedTransaction.deserialize(Buffer.from(p.data.transactions[0], 'base64'));
  tx.message.compiledInstructions[0].data[0] = 3; // A deactivate/freeze/close must never be signed.
  assert.throws(() => validateNativeLookupSetup(web3, { ...p.data, transactions: [Buffer.from(tx.serialize()).toString('base64')] }, 0));
  s.map.set(p.data.address, encodeTable(p.data.requiredAddresses.map(address => new web3.PublicKey(address))));
  const confirmed = await invoke({ action: 'confirm', walletAddress, address: p.data.address });
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.data)); assert.equal(confirmed.data.configured, true);
  assert.equal((await call({ action: 'options' })).data.launchReady, true);
  assert.equal((await invoke({ action: 'prepare', walletAddress: key().toBase58() })).status, 400);
  s.client.auth.me = async () => ({ role: 'user' });
  assert.equal((await invoke({ action: 'prepare', walletAddress })).status, 403);
});
