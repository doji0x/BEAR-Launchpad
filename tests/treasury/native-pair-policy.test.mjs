import { quoteFixture } from './quoteFixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { BEAR_QUOTE_MINT, assertBearQuoteMint, assertPumpCoinQuoteResolution, atomicQuoteAmount,
  creatorFeeBpsFromPercent, nativeLaunchPolicy, nativeLaunchIntent } from '../../base44/shared/nativePairPolicy.js';
import { sdk, web3, spl, BN, key, quoteMint } from './fixtures.mjs';
import { createNativeQuoteTools } from '../../base44/shared/nativeQuoteCore.js';

const tools = createNativeQuoteTools({ sdk, web3, BN });
test('only the official BEAR address is accepted', () => {
  assert.equal(assertBearQuoteMint(BEAR_QUOTE_MINT), BEAR_QUOTE_MINT);
  assert.equal(assertBearQuoteMint(quoteMint), quoteMint);
  for (const value of [undefined, '', spl.NATIVE_MINT, key().toBase58()]) assert.throws(() => assertBearQuoteMint(value));
});
test('quote resolution validates actual mint, program, decimals, reserves and mode', () => {
  const { quote } = quoteFixture();
  assert.equal(assertPumpCoinQuoteResolution(quote), quote);
  for (const patch of [{ mint: key() }, { quoteTokenProgram: key() }, { decimals: 6.5 }, { decimals: 19 },
    { initialVirtualQuoteReserves: new BN(0) }, { initialVirtualQuoteReserves: new BN(-1) }, { source: 'invented' }, { pumpQuote: null }])
    assert.throws(() => assertPumpCoinQuoteResolution({ ...quote, ...patch }));
  quote.pumpQuote.curve.bondingCurve.isMayhemMode = true;
  assert.throws(() => assertPumpCoinQuoteResolution(quote));
});
for (const source of ['global', 'quoteControl']) test(`BEAR may become ${source}-listed without permitting any other quote`, async () => {
  const context = quoteFixture({ source });
  assert.equal(await tools.resolve({ resolveQuoteMint: async mint => { assert.ok(mint.equals(quoteMint)); return context.quote; } }, BEAR_QUOTE_MINT), context.quote);
  const result = tools.firstBuy({ ...context, firstBuyAmount: '1.000001' });
  assert.equal(result.quoteAmount.toString(), '1000001');
  assert.ok(result.amount.gtn(0));
});
for (const migrated of [false, true]) test(`real SDK first-buy math uses BEAR ${migrated ? 'pool with signed virtual reserves' : 'curve'} reserves`, () => {
  const context = quoteFixture({ migrated });
  const result = tools.firstBuy({ ...context, firstBuyAmount: '123.456789', creatorFeeBps: 125 });
  const expected = sdk.getBuyTokenAmountFromSolAmount({ ...context, mintSupply: null, bondingCurve: null,
    amount: new BN('123456789'), quoteMint, creatorFeeBps: new BN(125), pumpQuote: context.quote.pumpQuote.curve });
  assert.equal(result.amount.toString(), expected.muln(9900).divn(10000).toString());
  assert.equal(result.quoteAmount.toString(), '123456789');
  assert.throws(() => sdk.getBuyTokenAmountFromSolAmount({ ...context, mintSupply: null, bondingCurve: null,
    amount: result.quoteAmount, quoteMint, creatorFeeBps: new BN(125) }), /unsupported/i);
});
test('the real SDK rejects excess depth and a quote curve awaiting migration', () => {
  const c = quoteFixture(); c.pump.bondingCurve.depth = 1;
  assert.throws(() => tools.firstBuy({ ...c, firstBuyAmount: '1' }), /depth/i);
  c.pump.bondingCurve.depth = 0; c.pump.bondingCurve.complete = true;
  assert.throws(() => tools.firstBuy({ ...c, firstBuyAmount: '1' }), /migration/i);
  assert.throws(() => quoteFixture({ migrated: true, virtual: '-100000000000' }), /negative/i);
});
test('creator fee limits and exact decimal arithmetic are fail-closed', () => {
  const c = quoteFixture();
  assert.throws(() => tools.firstBuy({ ...c, firstBuyAmount: '1', creatorFeeBps: 501 }), /allowed range/);
  c.global.creatorFeeConfigurable = false;
  assert.throws(() => tools.firstBuy({ ...c, firstBuyAmount: '1', creatorFeeBps: 1 }), /allowed range/);
  assert.equal(atomicQuoteAmount('18446744073709.551615', 6), '18446744073709551615');
  assert.equal(atomicQuoteAmount('0.000001', 6), '1');
  for (const value of ['0', '-1', '1e9', '1.0000001', '18446744073709.551616', NaN, ' 1']) assert.throws(() => atomicQuoteAmount(value, 6));
  assert.equal(creatorFeeBpsFromPercent('1.25'), 125);
  assert.equal(creatorFeeBpsFromPercent(''), 0);
  for (const value of ['1.001', '-1', '1e2', '100.01']) assert.throws(() => creatorFeeBpsFromPercent(value));
});
test('the signed intent binds the permanent routing, quote, budget and consent', () => {
  const row = { ...nativeLaunchPolicy(), policyAccepted: true, coinMint: key().toBase58(), walletAddress: key().toBase58(),
    requestId: '11111111-1111-4111-8111-111111111111', launchMode: 'upload', name: 'Coin', symbol: 'COIN', metadataUrl: 'https://example.com/m.json',
    imageUrl: 'https://example.com/image.png', firstBuyAmount: '1', creatorFeeBps: 0, socials: {} };
  const signed = nativeLaunchIntent(row);
  assert.notEqual(nativeLaunchIntent({ ...row, firstBuyAmount: '2' }), signed);
  assert.notEqual(nativeLaunchIntent({ ...row, metadataUrl: 'https://example.com/other.json' }), signed);
  assert.throws(() => nativeLaunchIntent({ ...row, quoteMint: spl.NATIVE_MINT.toBase58() }));
  assert.throws(() => nativeLaunchIntent({ ...row, policyAccepted: false }));
});
