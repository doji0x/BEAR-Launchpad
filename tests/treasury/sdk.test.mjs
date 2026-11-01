import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, tools, sdk, spl, web3, BN, key, table, stable } from './fixtures.mjs';
import { nativeLaunchPolicy, BEAR_QUOTE_MINT, assertNativeLaunchIntent } from '../../base44/shared/nativePairPolicy.js';
import { TREASURY_ADDRESS, assertLockedTreasuryConfig } from '../../base44/shared/treasuryPolicy.js';
const { PublicKey, TransactionMessage, VersionedTransaction, ComputeBudgetProgram } = web3;
for (const tokenProgram of [spl.TOKEN_PROGRAM_ID, spl.TOKEN_2022_PROGRAM_ID]) for (const migrated of [false, true]) {
  test(`real SDK: BEAR ${tokenProgram.equals(spl.TOKEN_PROGRAM_ID) ? 'SPL' : '2022'}, ${migrated ? 'pool' : 'curve'}; atomic lock and bounded buy`, async () => {
    const f = await fixture({ tokenProgram, migrated });
    const other = await fixture({ tokenProgram, pumpQuote: f.args.pumpQuote, global: f.args.global });
    const addresses = stable([f.instructions, other.instructions]);
    const alt = table(addresses);
    const instructions = [ComputeBudgetProgram.setComputeUnitLimit({ units: 1200000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }), ...f.instructions];
    await tools.validateInstructions(instructions, f.input);
    const tx = new VersionedTransaction(new TransactionMessage({ payerKey: f.payer.publicKey, recentBlockhash: key().toBase58(), instructions }).compileToV0Message([alt]));
    tx.sign([f.payer, f.mint]);
    await tools.validateTransaction(tx, f.input, [alt]);
    console.log(JSON.stringify({ migrated, bytes: tx.serialize().length, stableAddresses: addresses.length, instructions: instructions.length }));
    assert.ok(tx.serialize().length <= 1232);
    const buy = f.instructions.at(-1), program = sdk.getPumpProgram(null);
    assert.equal(program.coder.instruction.decode(buy.data).name, 'buyV3');
    assert.equal(buy.keys.length, 17);
    const accounts = program.idl.instructions.find(ix => ix.name === 'buyV3').accounts;
    const quoteIndex = accounts.findIndex(a => a.name === 'quoteMint');
    assert.ok(buy.keys[quoteIndex].pubkey.equals(f.args.quoteMint));
    assert.equal(buy.data[24], 0); // No partial fill bypass of the approved minimum.
    assert.equal(new BN(buy.data.subarray(16, 24), 'le').toString(), f.input.quoteAmountAtomic);
  });
}
test('reject alternate quote, mode, slippage, destination, percent, or unacknowledged policy', () => {
  const p = { ...nativeLaunchPolicy(), policyAccepted: true };
  assertNativeLaunchIntent(p);
  for (const change of [{ quoteMint: spl.NATIVE_MINT.toBase58() }, { quoteMint: key().toBase58() }, { coinMint: BEAR_QUOTE_MINT },
    { treasuryAddress: key().toBase58() }, { treasuryShareBps: 2000 }, { holderReward: true }, { mayhemMode: true }, { cashback: true },
    { feeRecipients: [] }, { policyAccepted: false }, { firstBuySlippageBps: 9000 }, { nativePairPolicyVersion: 99 }])
    assert.throws(() => assertNativeLaunchIntent({ ...p, ...change }));
});
test('locked configuration must be active, V2, and exclusively the approved treasury', () => {
  const mint = key(), config = { mint, version: 2, adminRevoked: true, status: { active: {} }, shareholders: [{ address: new PublicKey(TREASURY_ADDRESS), shareBps: 10000 }] };
  assertLockedTreasuryConfig(config, mint);
  for (const patch of [{ version: 1 }, { adminRevoked: false }, { status: { paused: {} } }, { mint: key() },
    { shareholders: [{ address: key(), shareBps: 10000 }] }, { shareholders: [{ address: new PublicKey(TREASURY_ADDRESS), shareBps: 8000 }] }])
    assert.throws(() => assertLockedTreasuryConfig({ ...config, ...patch }, mint));
});
test('remove, reorder, replace or append instructions: reject', async () => {
  const f = await fixture();
  for (let index = 0; index < f.instructions.length; index++)
    await assert.rejects(() => tools.validateInstructions(f.instructions.filter((_, i) => i !== index), f.input));
  const reordered = [...f.instructions]; [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
  await assert.rejects(() => tools.validateInstructions(reordered, f.input));
  const transfer = web3.SystemProgram.transfer({ fromPubkey: f.payer.publicKey, toPubkey: key(), lamports: 1 });
  await assert.rejects(() => tools.validateInstructions([...f.instructions, transfer], f.input));
});
test('reject a pre-lock creator vault, altered mint, cap, output, and tracking flag', async () => {
  const f = await fixture();
  const old = await sdk.PUMP_SDK.getBuyV2InstructionRaw({ user: f.payer.publicKey, mint: f.mint.publicKey, creator: f.payer.publicKey,
    amount: f.args.amount, quoteAmount: f.args.quoteAmount, quoteMint: f.args.quoteMint, quoteTokenProgram: f.args.quoteTokenProgram });
  await assert.rejects(() => tools.validateInstructions([...f.instructions.slice(0, -1), old], f.input), /Unexpected first-buy instruction/);
  for (const [offset, amount] of [[16, 1000001n], [8, 1n]]) {
    const mutated = new web3.TransactionInstruction({ ...f.instructions.at(-1), data: Buffer.from(f.instructions.at(-1).data) });
    mutated.data.writeBigUInt64LE(amount, offset);
    await assert.rejects(() => tools.validateInstructions([...f.instructions.slice(0, -1), mutated], f.input), /spending cap/);
  }
  await assert.rejects(() => tools.validateInstructions(f.instructions, { ...f.input, coinMint: key().toBase58() }));
  f.instructions.at(-1).data[24] = 1;
  await assert.rejects(() => tools.validateInstructions(f.instructions, f.input), /partial-fill flag/);
});
test('listed BEAR is valid without pump-quote accounts; any other listed asset is rejected', async () => {
  const f = await fixture({ listed: true });
  await tools.validateInstructions(f.instructions, f.input);
  await assert.rejects(() => tools.build({ ...f.args, quoteMint: spl.NATIVE_MINT }), /official BEAR/);
});
for (const tokenProgram of [spl.TOKEN_PROGRAM_ID, spl.TOKEN_2022_PROGRAM_ID]) for (const migrated of [false, true]) {
  test(`maximum metadata: atomic creation and fee locking fit (${migrated ? 'migrated' : 'curve'}, ${tokenProgram.toBase58().slice(0, 8)})`, async () => {
    const options = { tokenProgram, migrated, uri: `https://example.com/${'x'.repeat(181)}`, name: 'n'.repeat(32), symbol: 'T'.repeat(10), creatorFeeBps: new BN(500) };
    const full = await fixture(options);
    const other = await fixture({ ...options, global: full.args.global, pumpQuote: full.args.pumpQuote });
    const alt = table(stable([full.instructions, other.instructions]));
    const instructions = await tools.build({ ...full.args, launchStep: 'create_lock' });
    const tx = new VersionedTransaction(new TransactionMessage({ payerKey: full.payer.publicKey, recentBlockhash: key().toBase58(),
      instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }), ...instructions] }).compileToV0Message([alt]));
    tx.sign([full.payer, full.mint]);
    await tools.validateTransaction(tx, { ...full.input, launchStep: 'create_lock' }, [alt]);
    assert.ok(tx.serialize().length <= 1232);
    assert.equal(instructions.length, 5); // Create + config + two quote vault ATAs + locked update. Never create alone.
    console.log(JSON.stringify({ splitCreationBytes: tx.serialize().length, migrated, token: tokenProgram.toBase58() }));
    await assert.rejects(() => tools.validateInstructions(instructions.slice(0, -1), { ...full.input, launchStep: 'create_lock' }));
  });
}
test('standalone first buy is bounded, uses BEAR, and requests only the wallet signature', async () => {
  const f = await fixture({ launchStep: 'first_buy' });
  const tx = new VersionedTransaction(new TransactionMessage({ payerKey: f.payer.publicKey, recentBlockhash: key().toBase58(), instructions: f.instructions }).compileToV0Message());
  tx.sign([f.payer]);
  await tools.validateTransaction(tx, f.input);
  assert.equal(tx.message.header.numRequiredSignatures, 1);
  await assert.rejects(() => tools.validateTransaction(tx, { ...f.input, launchStep: 'create_lock_buy' }));
  await assert.rejects(() => tools.validateInstructions([...f.instructions, web3.SystemProgram.transfer({ fromPubkey: f.payer.publicKey, toPubkey: key(), lamports: 1 })], f.input));
});
test('quote decimals, raw budget and lookup table contents cannot silently change the approved trade', async () => {
  const f = await fixture();
  await assert.rejects(() => tools.validateInstructions(f.instructions, { ...f.input, quoteDecimals: 9 }), /BEAR budget/);
  await assert.rejects(() => tools.validateInstructions(f.instructions, { ...f.input, protocolBuybackFeeRecipient: key().toBase58() }));
  const other = await fixture({ global: f.args.global, pumpQuote: f.args.pumpQuote });
  const alt = table(stable([f.instructions, other.instructions]));
  const tx = new VersionedTransaction(new TransactionMessage({ payerKey: f.payer.publicKey, recentBlockhash: key().toBase58(), instructions: f.instructions }).compileToV0Message([alt]));
  const bad = table([...alt.state.addresses].reverse()); bad.key = alt.key;
  await assert.rejects(() => tools.validateTransaction(tx, f.input, [bad]));
});
