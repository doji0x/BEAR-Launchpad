import { createRequire } from 'node:module';
import { createTreasuryTools } from '../../base44/shared/treasuryLaunchCore.js';
import { nativeLaunchPolicy, BEAR_QUOTE_MINT } from '../../base44/shared/nativePairPolicy.js';
const require = createRequire(import.meta.url);
export const sdk = require('@pump-fun/pump-sdk'), web3 = require('@solana/web3.js'), spl = require('@solana/spl-token'), BN = require('bn.js');
export const tools = createTreasuryTools({ sdk, web3, spl, BN });
export const key = () => web3.Keypair.generate().publicKey;
export const quoteMint = new web3.PublicKey(BEAR_QUOTE_MINT);
export async function fixture({ tokenProgram = spl.TOKEN_2022_PROGRAM_ID, migrated = false, listed = false, uri = 'https://example.com/m.json', ...extra } = {}) {
  const mint = web3.Keypair.generate(), payer = web3.Keypair.generate();
  const pumpQuote = listed ? undefined : migrated ? { pool: { pool: key(), baseVault: key(), quoteVault: key() } } : {};
  const args = { global: { feeRecipient: key(), feeRecipients: [], buybackFeeRecipients: [key()], creatorFeeConfigurable: true, maxConfigurableCreatorFeeBps: new BN(500) },
    mint: mint.publicKey, user: payer.publicKey, name: 'Treasury test', symbol: 'TST', uri,
    amount: new BN(1000), quoteAmount: new BN(1000000), quoteMint, quoteTokenProgram: tokenProgram, pumpQuote, ...extra };
  const instructions = await tools.build(args);
  const input = { ...nativeLaunchPolicy(), policyAccepted: true, coinMint: mint.publicKey.toBase58(), walletAddress: payer.publicKey.toBase58(),
    launchStep: args.launchStep || 'create_lock_buy', protocolFeeRecipient: args.global.feeRecipient.toBase58(), protocolBuybackFeeRecipient: args.global.buybackFeeRecipients[0].toBase58(),
    name: args.name, symbol: args.symbol, metadataUrl: args.uri, quoteTokenProgram: tokenProgram.toBase58(), quoteDecimals: 6,
    quoteSource: listed ? 'global' : 'pumpCoin', pumpQuoteAccounts: !pumpQuote ? {} : pumpQuote.pool ?
      { pool: Object.fromEntries(Object.entries(pumpQuote.pool).map(([k, v]) => [k, v.toBase58()])) } : {},
    firstBuyAmount: '1', quoteAmountAtomic: args.quoteAmount.toString(), minimumTokens: args.amount.toString(), creatorFeeBps: Number(args.creatorFeeBps?.toString() || 0) };
  return { args, instructions, input, mint, payer };
}
export function table(addresses) {
  return new web3.AddressLookupTableAccount({ key: key(), state: { deactivationSlot: (1n << 64n) - 1n,
    lastExtendedSlot: 0, lastExtendedSlotStartIndex: 0, authority: undefined, addresses } });
}
export function stable(sets) {
  const invoked = new Set(sets.flat().map(ix => ix.programId.toBase58()));
  const signed = new Set(sets.flatMap(a => a.flatMap(ix => ix.keys.filter(k => k.isSigner).map(k => k.pubkey.toBase58()))));
  const all = sets.map(a => new Set(a.flatMap(ix => ix.keys.map(k => k.pubkey.toBase58()))));
  return [...all[0]].filter(k => !invoked.has(k) && !signed.has(k) && all.every(s => s.has(k))).map(k => new web3.PublicKey(k));
}
