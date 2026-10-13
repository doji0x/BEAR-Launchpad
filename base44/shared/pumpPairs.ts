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

const labels = new Map([
  ['So11111111111111111111111111111111111111112', ['SOL', 'Solana']],
  ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', ['USDC', 'USD Coin']],
  ['XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp', ['APPLX', 'Apple xStock']],
  ['Xs6B6zawENwAbWVi7w92rjazLuAr5Az59qgWKcNb45x', ['BRKX', 'Berkshire Hathaway B xStock']],
  ['XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W', ['SPYX', 'SPDR S&P 500 xStock']],
  ['Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re', ['GLDX', 'Gold xStock']],
  ['XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN', ['GOOGLX', 'Alphabet xStock']],
  ['XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB', ['TSLAX', 'Tesla xStock']],
  ['XsvNBAYkrDRNhA7wPHQfX3ZUXZyZLdnCQDfHZ56bzpg', ['HOODX', 'Robinhood xStock']],
  ['Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh', ['NVDAX', 'NVIDIA xStock']],
  ['XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1', ['CRCLX', 'Circle xStock']],
  ['Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg', ['AMZNX', 'Amazon xStock']],
  ['Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu', ['COINX', 'Coinbase xStock']],
  ['XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ', ['MSTRX', 'Strategy xStock']],
  ['Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu', ['METAX', 'Meta xStock']],
  ['Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ', ['QQQX', 'Invesco QQQ xStock']],
  ['XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX', ['MSFTX', 'Microsoft xStock']],
  ['XsoBhf2ufR8fTyNSjqfU71DYGaE6Z3SUGAidpzriAA4', ['PLTRX', 'Palantir xStock']],
  ['PEAQjk7SRS6rXHVFFmpRr7zrC4g5ZuEebpwTxvaLr3b', ['PEAQ', 'peaq']],
  ['DoGEV7LASBkQbibMc5k5vKnTZoMg423GpJ5QtJEGfm7R', ['DOGE', 'Dogecoin']],
  ['ARBzQTYDCW2KnVEjs1Mc81LekB1ibVFZKbSVmorkoT9d', ['ARB', 'Arbitrum']],
  ['5GgRAEmv8ZxF2PR5hY72Qs5x1bnQ6UK2RbTPoqJ3wSwW', ['PAXG', 'PAX Gold']],
  ['3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh', ['WBTC', 'Wrapped BTC']],
  ['7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', ['ETH', 'Ether']],
  ['98sMhvDwXj1RQi5c5Mndm3vPe9cBqPrbLaufMXFNMh5g', ['HYPE', 'Hyperliquid']],
  ['WXMRyRZhsa19ety5erZhHg4N3xj3EVN92u94422teJp', ['XMR', 'Monero']],
  ['pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn', ['PUMP', 'Pump']],
  ['DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', ['BONK', 'Bonk']],
  ['EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', ['WIF', 'dogwifhat']],
  ['4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', ['RAY', 'Raydium']],
]);

export async function supportedPairOptions(onlineSdk) {
  const supported = await onlineSdk.fetchSupportedQuoteMints();
  // Do not advertise a quote until the Pump SDK confirms BEAR is eligible.
  const bear = await onlineSdk.resolveQuoteMint(new PublicKey(BEAR_QUOTE_MINT));
  assertPumpCoinQuoteResolution(bear);
  return [{ mint: BEAR_QUOTE_MINT, symbol: 'BEAR', name: 'BEAR', source: 'pumpCoin', termsUrl: 'https://pump.fun/docs/custom-pairs' }];
  /* const supported = await onlineSdk.fetchSupportedQuoteMints();
  return supported.map(item => {
    const mint = item.mint.toBase58();
    const known = labels.get(mint);
    return { mint, symbol: known?.[0] || mint.slice(0, 6), name: known?.[1] || `Supported asset ${mint.slice(0, 8)}…`, source: item.source, termsUrl: 'https://pump.fun/docs/custom-pairs' };
  }); */
}