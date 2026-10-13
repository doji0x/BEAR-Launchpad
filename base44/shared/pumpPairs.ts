import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { getAssociatedTokenAddressSync } from 'npm:@solana/spl-token@0.4.15';
import { BEAR_QUOTE_MINT, assertBearQuoteMint, assertPumpCoinQuoteResolution } from './nativePairPolicy.js';
import { rpcRequest } from './mintWallet.ts';

export async function tokenBalance(rpcUrl, owner, mint, tokenProgram = null) {
  const result = await rpcRequest(rpcUrl, 'getTokenAccountsByOwner', [owner, { mint }, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
  // A new launch debits the canonical ATA, not the sum of unrelated token accounts.
  const ata = tokenProgram ? getAssociatedTokenAddressSync(new PublicKey(mint), new PublicKey(owner), false, tokenProgram).toBase58() : null;
  return result.value.filter(item => !ata || item.pubkey === ata).reduce((sum, item) => sum + BigInt(item.account.data.parsed.info.tokenAmount.amount), 0n);
}
export async function resolveSupportedPair(onlineSdk, mint) {
  assertBearQuoteMint(mint);
  const quote = assertPumpCoinQuoteResolution(await onlineSdk.resolveQuoteMint(new PublicKey(mint)));
  return { pair: { mint, symbol: 'BEAR', name: 'BEAR', decimals: quote.decimals, source: quote.source }, quote };
}
export async function supportedPairOptions(onlineSdk) {
  return [(await resolveSupportedPair(onlineSdk, BEAR_QUOTE_MINT)).pair];
}
