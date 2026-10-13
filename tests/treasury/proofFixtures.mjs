import fs from 'node:fs';
import { sdk, spl, web3, BN, key, quoteMint } from './fixtures.mjs';
import { TREASURY_ADDRESS } from '../../base44/shared/treasuryPolicy.js';
const captured = JSON.parse(fs.readFileSync(new URL('../claims/public-accounts.json', import.meta.url)));
const info = (data, owner) => ({ data, owner, executable: false, lamports: 2000000 });
export function mintInfo(owner = spl.TOKEN_2022_PROGRAM_ID) {
  const data = Buffer.alloc(spl.MINT_SIZE);
  spl.MintLayout.encode({ mintAuthorityOption: 0, mintAuthority: web3.PublicKey.default, supply: 1000000000000000n,
    decimals: 6, isInitialized: true, freezeAuthorityOption: 0, freezeAuthority: web3.PublicKey.default }, data);
  return info(data, owner);
}
export async function proofFixture({ mint = key(), migrated = false } = {}) {
  const configAddress = sdk.feeSharingConfigPda(mint), curveAddress = sdk.bondingCurvePda(mint);
  const rawCurve = captured.accounts.find(a => a.address === sdk.bondingCurvePda(new web3.PublicKey('6ZdCWrLhmBJmoLCL8reNCBxqJGBxXgQyM2PcDo4kpump')).toBase58());
  const rawConfig = captured.accounts.find(a => a.address === sdk.feeSharingConfigPda(new web3.PublicKey('6ZdCWrLhmBJmoLCL8reNCBxqJGBxXgQyM2PcDo4kpump')).toBase58());
  const curve = sdk.PUMP_SDK.decodeBondingCurve(info(Buffer.from(rawCurve.data, 'base64'), sdk.PUMP_PROGRAM_ID));
  Object.assign(curve, { creator: configAddress, quoteMint, complete: migrated, isHolderReward: false, isMayhemMode: false, isCashbackCoin: false });
  const config = sdk.PUMP_SDK.decodeSharingConfig(info(Buffer.from(rawConfig.data, 'base64'), sdk.PUMP_FEE_PROGRAM_ID));
  Object.assign(config, { mint, version: 2, adminRevoked: true, status: { active: {} }, shareholders: [{ address: new web3.PublicKey(TREASURY_ADDRESS), shareBps: 10000 }] });
  const poolAddress = sdk.canonicalPumpPoolPdaWithQuote(mint, quoteMint);
  const pool = { poolBump: 1, index: 0, creator: key(), baseMint: mint, quoteMint, lpMint: key(), poolBaseTokenAccount: key(), poolQuoteTokenAccount: key(),
    lpSupply: new BN(0), coinCreator: configAddress, isMayhemMode: false, isCashbackCoin: false, virtualQuoteReserves: new BN('-100'),
    creatorFeeBps: new BN(0), canEditCreatorFee: false, isHolderReward: false, protocolFees: new BN(0), creatorFees: new BN(0) };
  const map = new Map([[mint.toBase58(), mintInfo()], [quoteMint.toBase58(), mintInfo()]]);
  async function encode() {
    map.set(curveAddress.toBase58(), info(await sdk.getPumpProgram(null).coder.accounts.encode('bondingCurve', curve), sdk.PUMP_PROGRAM_ID));
    map.set(configAddress.toBase58(), info(await sdk.getPumpFeeProgram(null).coder.accounts.encode('sharingConfig', config), sdk.PUMP_FEE_PROGRAM_ID));
    if (migrated) map.set(poolAddress.toBase58(), info(await sdk.getPumpAmmProgram(null).coder.accounts.encode('pool', pool), sdk.PUMP_AMM_PROGRAM_ID));
  }
  await encode();
  const connection = { getMultipleAccountsInfo: async keys => keys.map(k => map.get(k.toBase58()) || null), getAccountInfo: async k => map.get(k.toBase58()) || null };
  return { mint, curve, config, pool, map, encode, connection, poolAddress };
}
