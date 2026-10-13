import { BEAR_QUOTE_MINT, assertBearQuoteMint, assertPumpCoinQuoteResolution } from './nativePairPolicy.js';
import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { rpcRequest } from './mintWallet.ts';

export async function tokenBalance(rpcUrl, owner, mint) {
  const result = await rpcRequest(rpcUrl, 'getTokenAccountsByOwner', [owner, { mint }, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
  return result.value.reduce((sum, item) => sum + BigInt(item.account.data.parsed.info.tokenAmount.amount), 0n);
}

export async function resolveSupportedPair(onlineSdk, mint) {
  assertBearQuoteMint(mint);
  const quote = assertPumpCoinQuoteResolution(await onlineSdk.resolveQuoteMint(new PublicKey(mint)));
  return { pair: { mint, symbol: 'BEAR', name: 'BEAR', source: 'pumpCoin' }, quote };
}

export async function supportedPairOptions(onlineSdk) {
  // Do not advertise a quote until the Pump SDK confirms BEAR is eligible.
  const bear = await onlineSdk.resolveQuoteMint(new PublicKey(BEAR_QUOTE_MINT));
  assertPumpCoinQuoteResolution(bear);
  return [{ mint: BEAR_QUOTE_MINT, symbol: 'BEAR', name: 'BEAR', source: 'pumpCoin', termsUrl: 'https://pump.fun/docs/custom-pairs' }];

}