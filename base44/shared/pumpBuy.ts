import { atomicQuoteAmount } from './nativePairPolicy.js';
import BN from 'npm:bn.js@5.2.2';
import { ComputeBudgetProgram, PublicKey } from 'npm:@solana/web3.js@1.98.4';
import runtimePumpSdk from './pumpSdkRuntime.ts';
const { PUMP_SDK, getBuyTokenAmountFromSolAmount } = runtimePumpSdk;
import { rpcRequest } from './mintWallet.ts';
import { compileLaunchTransaction } from './launchTransaction.ts';

export const token2022Program = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
export const computeUnitPrice = 1000;

export function atomicAmount(value, decimals) { return new BN(atomicQuoteAmount(value, decimals)); }

// Standalone first buy against a curve that already exists on-chain.
export async function devBuyInstructions({ onlineSdk, global, feeConfig, quoteControl, mintKey, user, quoteAmount, quote, creatorFeeBps }) {
  const buyState = await onlineSdk.fetchBuyState(mintKey, user, token2022Program, quote.mint);
  const amount = getBuyTokenAmountFromSolAmount({ global, feeConfig, mintSupply: null, bondingCurve: buyState.bondingCurve, amount: quoteAmount, quoteMint: quote.mint, quoteControl, creatorFeeBps });
  return PUMP_SDK.buyV2Instructions({ global, bondingCurveAccountInfo: buyState.bondingCurveAccountInfo, bondingCurve: buyState.bondingCurve, associatedUserAccountInfo: buyState.associatedUserAccountInfo, mint: mintKey, user, amount, quoteAmount, slippage: 0, tokenProgram: token2022Program, quoteMint: quote.mint, quoteTokenProgram: quote.quoteTokenProgram });
}

export function withComputeBudget(instructions, units) {
  return [ComputeBudgetProgram.setComputeUnitLimit({ units }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: computeUnitPrice }), ...instructions];
}

// Simulates then sends a dev buy. Shared by the admin resume path and the
// scheduled recovery of coins whose buy never landed.
export async function submitDevBuy({ rpcUrl, wallet, buyIxs, lookupTables, latest }) {
  const build = units => compileLaunchTransaction({ payerKey: wallet.publicKey, instructions: withComputeBudget(buyIxs, units), blockhash: latest.blockhash, lookupTables, signers: [wallet] }).encoded;
  const simulation = (await rpcRequest(rpcUrl, 'simulateTransaction', [build(300000), { encoding: 'base64', commitment: 'confirmed', sigVerify: true }])).value;
  if (simulation.err) return { error: `First-buy simulation failed: ${JSON.stringify(simulation.err)}`, logs: simulation.logs };
  const units = Math.min(1400000, Math.max(300000, Math.ceil((simulation.unitsConsumed || 240000) * 1.2)));
  const signature = await rpcRequest(rpcUrl, 'sendTransaction', [build(units), { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 2 }]);
  return { signature, logs: simulation.logs };
}