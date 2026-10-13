import { sdk, web3, spl, BN, key, quoteMint } from './fixtures.mjs';
export function quoteFixture({ migrated = false, source = 'pumpCoin', virtual = '-1000000000' } = {}) {
  const global = { initialVirtualTokenReserves: new BN('1073000000000000'), initialRealTokenReserves: new BN('793100000000000'),
    initialVirtualSolReserves: new BN('30000000000'), initialVirtualQuoteReserves: new BN('1000000000'),
    tokenTotalSupply: new BN('1000000000000000'), feeBasisPoints: new BN(100), creatorFeeBasisPoints: new BN(30),
    whitelistedQuoteMints: source === 'global' ? [quoteMint] : [], maxCurveDepth: 1, mayhemModeEnabled: false,
    creatorFeeConfigurable: true, maxConfigurableCreatorFeeBps: new BN(500), feeRecipient: key(), buybackFeeRecipients: [key()] };
  const curve = sdk.newBondingCurve(global, web3.PublicKey.default, null);
  curve.creator = key();
  const pump = { mint: quoteMint, bondingCurve: curve, quoteControl: null };
  const accounts = {};
  if (migrated) {
    for (const field of ['realQuoteReserves', 'virtualQuoteReserves', 'realTokenReserves', 'virtualTokenReserves']) curve[field] = new BN(0);
    curve.complete = true;
    pump.pool = { baseReserves: new BN('200000000000000'), quoteReserves: new BN('90000000000'), virtualQuoteReserves: new BN(virtual) };
    accounts.pool = { pool: key(), baseVault: key(), quoteVault: key() };
  }
  const quoteControl = source === 'quoteControl' ? { mints: [{ mint: quoteMint, initialVirtualQuoteReserves: new BN('1234567890') }] } : null;
  const quote = { mint: quoteMint, quoteTokenProgram: spl.TOKEN_2022_PROGRAM_ID, decimals: 6, source,
    initialVirtualQuoteReserves: sdk.initialVirtualQuoteReservesFor(global, quoteMint, quoteControl, source === 'pumpCoin' ? pump : undefined),
    ...(source === 'pumpCoin' ? { pumpQuote: { curve: pump, accounts, depth: 1 } } : {}) };
  return { global, feeConfig: null, quoteControl, quote, pump };
}
