import { proofFixture, mintInfo } from './proofFixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sdk, spl, web3, BN, key, quoteMint, tools } from './fixtures.mjs';
import { TREASURY_ADDRESS } from '../../base44/shared/treasuryPolicy.js';
for (const migrated of [false, true]) test(`real account decoders verify ${migrated ? 'graduated pool' : 'bonding curve'} policy`, async () => {
  const f = await proofFixture({ migrated });
  const proof = await tools.verify(f.connection, f.mint.toBase58(), quoteMint.toBase58());
  assert.equal(proof.feeLockStatus, 'verified'); assert.equal(proof.graduated, migrated);
});
test('creation alone, wrong quote, mutable fee share, or holder mode never passes', async () => {
  for (const mutate of [f => { f.curve.creator = key(); }, f => { f.curve.quoteMint = spl.NATIVE_MINT; },
    f => { f.config.adminRevoked = false; }, f => { f.config.shareholders[0].shareBps = 8000; }, f => { f.curve.isHolderReward = true; },
    f => { f.curve.isMayhemMode = true; }, f => { f.curve.isCashbackCoin = true; }]) {
    const f = await proofFixture(); mutate(f); await f.encode();
    await assert.rejects(() => tools.verify(f.connection, f.mint.toBase58(), quoteMint.toBase58()));
  }
});
test('migration gap and a pool with changed creator or quote stay unverified', async () => {
  const f = await proofFixture({ migrated: true });
  f.map.delete(f.poolAddress.toBase58());
  await assert.rejects(() => tools.verify(f.connection, f.mint.toBase58(), quoteMint.toBase58()), /in progress/);
  f.pool.coinCreator = key(); await f.encode();
  await assert.rejects(() => tools.verify(f.connection, f.mint.toBase58(), quoteMint.toBase58()), /policy/);
});
test('mint and account owners are checked, not inferred from their addresses', async () => {
  const f = await proofFixture();
  f.map.get(f.mint.toBase58()).owner = spl.TOKEN_PROGRAM_ID;
  await assert.rejects(() => tools.verify(f.connection, f.mint.toBase58(), quoteMint.toBase58()), /Token-2022/);
  f.map.set(f.mint.toBase58(), mintInfo()); f.map.get(quoteMint.toBase58()).owner = web3.SystemProgram.programId;
  await assert.rejects(() => tools.verify(f.connection, f.mint.toBase58(), quoteMint.toBase58()), /quote mint/);
});
