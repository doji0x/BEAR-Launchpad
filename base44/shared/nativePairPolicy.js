import { treasuryPolicy, assertTreasuryIntent, policyAssert } from './treasuryPolicy.js';

/** Public mint, never a wallet secret. Historical reward ledgers are not changed. */
export const BEAR_QUOTE_MINT = '49PU6ENTpYc3zkhgCruzCSBzgVAdix5muP2oVzRGpump';
export const NATIVE_PAIR_POLICY_VERSION = 1;
export const FIRST_BUY_SLIPPAGE_BPS = 100;
export const TOKEN_PROGRAMS = ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'];
export const addressOf = value => typeof value === 'string' ? value : value?.toBase58?.();
export function assertBearQuoteMint(value) {
  policyAssert(addressOf(value) === BEAR_QUOTE_MINT, 'New launches must pair with the official BEAR token.');
  return value;
}
export function nativeLaunchPolicy() {
  return { ...treasuryPolicy(), nativePairPolicyVersion: NATIVE_PAIR_POLICY_VERSION,
    quoteMint: BEAR_QUOTE_MINT, mayhemMode: false, cashback: false, firstBuySlippageBps: FIRST_BUY_SLIPPAGE_BPS };
}
export function assertNativeLaunchIntent(input) {
  assertTreasuryIntent(input);
  assertBearQuoteMint(input.quoteMint);
  policyAssert(input.nativePairPolicyVersion === NATIVE_PAIR_POLICY_VERSION && input.policyAccepted === true,
    'Review and accept the current BEAR pairing and locked treasury policy.');
  policyAssert(input.mayhemMode === false && input.cashback === false && input.firstBuySlippageBps === FIRST_BUY_SLIPPAGE_BPS,
    'Unsupported launch mode or first-buy slippage policy.');
  policyAssert(!input.coinMint || input.coinMint !== BEAR_QUOTE_MINT, 'BEAR cannot be paired with itself.');
}
/** Only use this on a result obtained directly from the official SDK, never on request JSON. */
export function assertPumpCoinQuoteResolution(resolved) {
  assertBearQuoteMint(resolved?.mint);
  policyAssert(TOKEN_PROGRAMS.includes(addressOf(resolved?.quoteTokenProgram)), 'Unsupported BEAR token program.');
  policyAssert(Number.isInteger(resolved.decimals) && resolved.decimals >= 0 && resolved.decimals <= 18, 'Invalid BEAR decimals.');
  policyAssert(resolved.initialVirtualQuoteReserves && /^\d+$/.test(resolved.initialVirtualQuoteReserves.toString()), 'Missing BEAR quote reserves.');
  policyAssert(BigInt(resolved.initialVirtualQuoteReserves.toString()) > 0n, 'BEAR quote reserves must be positive.');
  // BEAR remains usable if Pump later lists it. Do not require pumpCoin in that case.
  if (resolved.source === 'pumpCoin') {
    const quote = resolved.pumpQuote;
    policyAssert(quote && quote.accounts && typeof quote.accounts === 'object' && !Array.isArray(quote.accounts) &&
      addressOf(quote.curve?.mint) === BEAR_QUOTE_MINT && !quote.curve.bondingCurve?.isMayhemMode,
    'BEAR quote is not an eligible Pump coin quote at this time.');
  } else policyAssert(['global', 'quoteControl'].includes(resolved.source), 'Unsupported BEAR quote source.');
  return resolved;
}
/** Decimal-string to u64, without floating point or scientific notation. */
export function atomicQuoteAmount(value, decimals) {
  policyAssert(Number.isInteger(decimals) && decimals >= 0 && decimals <= 18, 'Invalid quote decimals.');
  policyAssert(typeof value === 'string' && value.length <= 80 && /^\d+(\.\d+)?$/.test(value), 'Enter a positive first-buy amount.');
  const [whole, fraction = ''] = value.split('.');
  policyAssert(fraction.length <= decimals, `This pair asset supports at most ${decimals} decimal places.`);
  const atomic = BigInt(`${whole}${fraction.padEnd(decimals, '0')}`);
  policyAssert(atomic > 0n && atomic <= 18446744073709551615n, 'First-buy amount must fit a positive u64.');
  return atomic.toString();
}
export function nativeLaunchIntent(row) {
  assertNativeLaunchIntent(row);
  const source = row.launchMode === 'upload' ? [row.metadataUrl, row.imageUrl] : [row.inscribedMint];
  return JSON.stringify(['bear-launch-v2', row.requestId, row.walletAddress, row.coinMint, row.launchMode, row.name, row.symbol,
    row.description || '', source, row.quoteMint, row.firstBuyAmount, row.creatorFeeBps, row.holderReward, row.feeRecipients, row.socials,
    row.nativePairPolicyVersion, row.treasuryPolicyVersion, row.treasuryAddress, row.treasuryShareBps,
    row.mayhemMode, row.cashback, row.firstBuySlippageBps, row.policyAccepted]);
}
export function creatorFeeBpsFromPercent(value) {
  if (value === '' || value == null) return 0; // Pump's default fee, not a zero-fee promise.
  policyAssert(typeof value === 'string' && /^\d+(\.\d{1,2})?$/.test(value) && value.length <= 8, 'Creator fee must have at most two decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const bps = Number(`${whole}${fraction.padEnd(2, '0')}`);
  policyAssert(Number.isSafeInteger(bps) && bps <= 10000, 'Invalid creator fee percentage.');
  return bps;
}
