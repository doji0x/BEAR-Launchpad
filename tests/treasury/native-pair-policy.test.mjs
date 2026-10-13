import test from 'node:test';
import assert from 'node:assert/strict';
import { BEAR_QUOTE_MINT, assertBearQuoteMint, assertPumpCoinQuoteResolution } from '../../base44/shared/nativePairPolicy.js';

test('only the official BEAR mint is accepted', () => {
  assert.equal(assertBearQuoteMint(BEAR_QUOTE_MINT), BEAR_QUOTE_MINT);
  assert.throws(() => assertBearQuoteMint('So11111111111111111111111111111111111111112'), /official BEAR/);
  assert.throws(() => assertBearQuoteMint(undefined), /official BEAR/);
});

test('Pump coin quote must supply extra creation accounts', () => {
  const eligible = { source: 'pumpCoin', pumpQuote: { accounts: { quoteBondingCurve: 'example' } } };
  assert.equal(assertPumpCoinQuoteResolution(eligible), eligible);
  assert.throws(() => assertPumpCoinQuoteResolution({ source: 'listed' }), /not an eligible/);
  assert.throws(() => assertPumpCoinQuoteResolution({ source: 'pumpCoin' }), /not an eligible/);
});
