/** Canonical BEAR quote for all new launchpad coins. */
export const BEAR_QUOTE_MINT = '49PU6ENTpYc3zkhgCruzCSBzgVAdix5muP2oVzRGpump';
export function assertBearQuoteMint(value) {
  if (value !== BEAR_QUOTE_MINT) {
    throw Object.assign(new Error('New launches must pair with the official BEAR token.'), { status: 400 });
  }
  return value;
}
export function assertPumpCoinQuoteResolution(resolved) {
  if (resolved?.source !== 'pumpCoin' || !resolved?.pumpQuote?.accounts) {
    throw Object.assign(new Error('BEAR quote is not an eligible Pump coin quote at this time.'), { status: 400 });
  }
  return resolved;
}
