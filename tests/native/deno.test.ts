// Deno exercises the production pinned runtime adapters, not the Node test loader.
// All instructions are built offline: no RPC, wallet key, or broadcast.
import assert from 'node:assert/strict';
import { treasuryLaunch } from '../../base44/shared/treasuryLaunch.ts';
import { BEAR_QUOTE_MINT, nativeLaunchPolicy } from '../../base44/shared/nativePairPolicy.js';
import { PublicKey, Keypair } from 'npm:@solana/web3.js@1.99.0';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from 'npm:@solana/spl-token@0.4.15';
import BN from 'npm:bn.js@5.2.5';
import sdk from '../../base44/shared/pumpSdkRuntime.ts';
import swap from '../../base44/shared/pumpSwapRuntime.ts';
Deno.test('both production SDK adapters export the pinned official builders', () => {
  assert.equal(typeof sdk.PUMP_SDK.createV2Instruction, 'function');
  assert.equal(typeof swap.PUMP_AMM_SDK.buyQuoteInput, 'function');
});
for (const quoteTokenProgram of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) Deno.test(`production Deno BEAR builder ${quoteTokenProgram.toBase58()}`, async () => {
  const mint = Keypair.generate().publicKey, user = Keypair.generate().publicKey;
  const global = { feeRecipient: Keypair.generate().publicKey, feeRecipients: [], buybackFeeRecipients: [Keypair.generate().publicKey] };
  const args = { global, mint, user, name: 'BEAR test', symbol: 'TEST', uri: 'https://example.com/m.json', amount: new BN(1000), quoteAmount: new BN(1000000),
    quoteMint: new PublicKey(BEAR_QUOTE_MINT), quoteTokenProgram, pumpQuote: {} };
  const input = { ...nativeLaunchPolicy(), policyAccepted: true, coinMint: mint.toBase58(), walletAddress: user.toBase58(),
    name: args.name, symbol: args.symbol, metadataUrl: args.uri, quoteTokenProgram: quoteTokenProgram.toBase58(), quoteDecimals: 6, quoteSource: 'pumpCoin', pumpQuoteAccounts: {},
    firstBuyAmount: '1', quoteAmountAtomic: '1000000', minimumTokens: '1000', creatorFeeBps: 0,
    protocolFeeRecipient: global.feeRecipient.toBase58(), protocolBuybackFeeRecipient: global.buybackFeeRecipients[0].toBase58() };
  for (const launchStep of ['create_lock_buy', 'create_lock', 'first_buy']) {
    const instructions = await treasuryLaunch.build({ ...args, launchStep });
    assert.ok(instructions.length >= 3);
    await treasuryLaunch.validateInstructions(instructions, { ...input, launchStep });
  }
});
