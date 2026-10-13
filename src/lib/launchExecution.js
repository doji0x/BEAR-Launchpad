import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { launchMintKey, hasLaunchMintKey } from '@/lib/launchMintKey';
import { encodeBase58 } from '@/lib/base58';
import { invokeLaunch, launchIntent, launchParams, normalizeLaunch, toBase64 } from '@/lib/unifiedLaunch';
import { validatePreparedNativeLaunch } from '@/lib/nativeLaunchValidation';
import { NATIVE_PAIR_POLICY_VERSION } from '../../base44/shared/nativePairPolicy.js';

export const waitForLaunch = () => new Promise(resolve => setTimeout(resolve, 2500));
export function assertLaunchWallet(wallet, address) {
  if (wallet.provider?.publicKey?.toString() !== address) throw new Error('Reconnect the wallet that started this launch.');
}
export async function checkLaunch(saved, persist) {
  const data = await invokeLaunch({ action: 'check', requestId: saved.requestId, walletAddress: saved.walletAddress, signature: saved.signature });
  if (data.error) throw new Error(data.error);
  if (!data.attempt) return persist({ ...saved, status: saved.signature ? 'pending' : 'draft' });
  return persist({ ...saved, ...data.attempt, signature: data.attempt.signature || saved.signature || '' });
}
export async function executeLaunch(saved, wallet, persist, progress, preflight) {
  assertLaunchWallet(wallet, saved.walletAddress);
  if (saved.nativePairPolicyVersion !== NATIVE_PAIR_POLICY_VERSION) throw new Error('Legacy launches can be checked but cannot be resubmitted under the BEAR policy.');
  if (!hasLaunchMintKey(saved.requestId)) throw new Error('Return to the original browser to resume; checking status works here.');
  const mint = await launchMintKey(saved.requestId);
  if (mint.address !== saved.coinMint) throw new Error('Saved mint key mismatch. Keep this launch for recovery.');
  const input = normalizeLaunch(launchParams(saved));
  const params = { requestId: saved.requestId, walletAddress: saved.walletAddress, coinMint: saved.coinMint,
    launchMode: input.launchMode, name: input.name, symbol: input.symbol, description: input.description, inscribedMint: '',
    metadataUrl: input.metadataUrl || '', imageUrl: input.imageUrl || '', quoteMint: input.quoteMint, quoteDecimals: input.quoteDecimals,
    firstBuyAmount: input.firstBuyAmount, creatorFeePercent: input.creatorFeePercent, creatorFeeBps: input.creatorFeeBps,
    holderReward: input.holderReward, feeRecipients: input.feeRecipients, socials: input.socials, ...input.socials,
    nativePairPolicyVersion: input.nativePairPolicyVersion, treasuryPolicyVersion: input.treasuryPolicyVersion,
    treasuryAddress: input.treasuryAddress, treasuryShareBps: input.treasuryShareBps, mayhemMode: input.mayhemMode,
    cashback: input.cashback, firstBuySlippageBps: input.firstBuySlippageBps, policyAccepted: input.policyAccepted };
  progress(saved.creationSignature ? 'Preparing your separate first buy...' : 'Preparing creation, fee locking, and your first buy...');
  const data = await invokeLaunch({ ...params, action: 'prepare', mintAuthorization: toBase64(await mint.sign(new TextEncoder().encode(launchIntent(params)))) });
  preflight(data.preflight || null);
  if (data.error) throw new Error(data.error);
  if (data.alreadyLaunched) return checkLaunch({ ...saved, ...data }, persist);
  progress('Verifying the transaction and BEAR quote against mainnet...');
  const transaction = await validatePreparedNativeLaunch({ ...saved, ...params }, data);
  saved = persist({ ...saved, ...data, ...params, signature: '', signedTransaction: '', status: 'prepared' });
  assertLaunchWallet(wallet, saved.walletAddress);
  const message = transaction.message.serialize();
  if (data.launchStep !== 'first_buy') transaction.addSignature(new PublicKey(mint.address), await mint.sign(message));
  progress(data.launchStep === 'create_lock' ? 'Approve creation and the permanent fee lock. The first buy needs another approval.' :
    data.launchStep === 'first_buy' ? 'Approve the first buy for your already-created coin.' : 'Approve creation, the permanent fee lock, and first buy in Phantom.');
  const signed = await wallet.provider.signTransaction(transaction);
  assertLaunchWallet(wallet, saved.walletAddress);
  if (toBase64(signed.message.serialize()) !== toBase64(message)) throw new Error('Phantom returned a different transaction. Nothing was submitted.');
  for (let i = 0; i < signed.signatures.length; i++) if (!nacl.sign.detached.verify(message, signed.signatures[i], signed.message.staticAccountKeys[i].toBytes()))
    throw new Error('The wallet or mint signature is missing. Nothing was submitted.');
  const signature = encodeBase58(signed.signatures[0]), encoded = toBase64(signed.serialize());
  saved = persist({ ...saved, signature, signedTransaction: encoded, status: 'pending' });
  progress('Submitting the approved transaction...');
  const submitted = await invokeLaunch({ action: 'submit', requestId: saved.requestId, transaction: encoded, submitToken: data.submitToken });
  if (submitted.error) throw new Error(submitted.error);
  return saved;
}
/** Compatibility entry point: fee verification is read-only, never a separate mutable split. */
export async function configureLaunchRewards(saved, wallet, persist, progress) {
  assertLaunchWallet(wallet, saved.walletAddress);
  progress('Verifying the locked on-chain fee policy...');
  return checkLaunch(saved, persist);
}
