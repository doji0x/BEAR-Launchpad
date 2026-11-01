import { nativeLaunchPolicy, BEAR_QUOTE_MINT } from './nativePairPolicy.js';
export const defaultV1Quote = BEAR_QUOTE_MINT;
export async function atomicV1RewardOptions(_rpcUrl) {
  return { ...nativeLaunchPolicy(), enabled: false, pairs: [], holderRewardEnabled: false,
    reason: 'Legacy inscription coin creation is retired. Use the standard BEAR launch flow.' };
}
// A shared helper must not become an accidental bypass if an old route is restored.
export async function atomicV1PumpInstructions(_args) {
  throw Object.assign(new Error('Legacy V1 creation is disabled. Use the validated BEAR create-and-lock builder.'), { status: 410 });
}
