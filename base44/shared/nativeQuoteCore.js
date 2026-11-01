import { assertBearQuoteMint, assertPumpCoinQuoteResolution, atomicQuoteAmount, FIRST_BUY_SLIPPAGE_BPS } from './nativePairPolicy.js';
import { policyAssert } from './treasuryPolicy.js';

/** SDK injection permits offline tests against the real pinned builders and quote math. */
export function createNativeQuoteTools({ sdk, web3, BN }) {
  const { PublicKey } = web3;
  async function resolve(online, mint) {
    assertBearQuoteMint(mint);
    return assertPumpCoinQuoteResolution(await online.resolveQuoteMint(new PublicKey(mint)));
  }
  function firstBuy({ global, feeConfig, quoteControl, quote, firstBuyAmount, creatorFeeBps = 0, bondingCurve = null }) {
    assertPumpCoinQuoteResolution(quote);
    policyAssert(Number.isInteger(creatorFeeBps) && creatorFeeBps >= 0 &&
      (creatorFeeBps === 0 || global.creatorFeeConfigurable && creatorFeeBps <= Number(global.maxConfigurableCreatorFeeBps.toString())),
    'Creator fee is outside Pump\'s current allowed range.');
    const quoteAmount = new BN(atomicQuoteAmount(firstBuyAmount, quote.decimals));
    const fee = creatorFeeBps ? new BN(creatorFeeBps) : undefined;
    policyAssert(!bondingCurve?.complete, 'The coin graduated before its separate first buy. The fee lock remains valid; do not relaunch it.');
    const expected = sdk.getBuyTokenAmountFromSolAmount({ global, feeConfig, quoteControl,
      mintSupply: bondingCurve?.tokenTotalSupply || null, bondingCurve, amount: quoteAmount, quoteMint: quote.mint,
      creatorFeeBps: fee, pumpQuote: quote.pumpQuote?.curve });
    const amount = expected.muln(10000 - FIRST_BUY_SLIPPAGE_BPS).divn(10000);
    policyAssert(amount.gtn(0), 'First-buy output is too small.');
    return { amount, quoteAmount, creatorFeeBps: fee };
  }
  function snapshot(quote, global) {
    const pool = quote.pumpQuote?.accounts?.pool;
    return { protocolFeeRecipient: global.feeRecipient.toBase58(), protocolBuybackFeeRecipient: global.buybackFeeRecipients[0].toBase58(),
      quoteMint: quote.mint.toBase58(), quoteTokenProgram: quote.quoteTokenProgram.toBase58(), quoteDecimals: quote.decimals,
      quoteSource: quote.source, pumpQuoteAccounts: quote.source !== 'pumpCoin' ? {} : pool ?
        { pool: { pool: pool.pool.toBase58(), baseVault: pool.baseVault.toBase58(), quoteVault: pool.quoteVault.toBase58() } } : {} };
  }
  return { resolve, firstBuy, snapshot };
}
export function decodePumpQuoteAccounts(input, PublicKey) {
  if (input.quoteSource !== 'pumpCoin') {
    policyAssert(['global', 'quoteControl'].includes(input.quoteSource) && (!input.pumpQuoteAccounts || typeof input.pumpQuoteAccounts === 'object' && Object.keys(input.pumpQuoteAccounts).length === 0), 'Invalid listed BEAR quote accounts.');
    return undefined;
  }
  const accounts = input.pumpQuoteAccounts;
  policyAssert(accounts && typeof accounts === 'object' && !Array.isArray(accounts) &&
    Object.keys(accounts).every(key => key === 'pool'), 'Missing or unsupported Pump-coin quote accounts.');
  if (!accounts.pool) return {};
  policyAssert(Object.keys(accounts.pool).length === 3 && ['pool', 'baseVault', 'quoteVault'].every(key => typeof accounts.pool[key] === 'string'),
    'Incomplete BEAR pool quote accounts.');
  return { pool: Object.fromEntries(Object.entries(accounts.pool).map(([key, value]) => [key, new PublicKey(value)])) };
}
