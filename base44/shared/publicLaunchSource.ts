import { policyAssert } from './treasuryPolicy.js';
import { nativeLaunchIntent } from './nativePairPolicy.js';
import { Buffer } from 'node:buffer';
import nacl from 'npm:tweetnacl@1.0.3';
import { PublicKey } from 'npm:@solana/web3.js@1.98.4';

export function authorizeLaunch(body, input, walletAddress, coinMint, socials, recipients) {
  const intent = nativeLaunchIntent({ ...input, walletAddress, coinMint, socials, feeRecipients: recipients });
  const proof = Buffer.from(String(body.mintAuthorization || ''), 'base64');
  if (proof.length !== 64 || !nacl.sign.detached.verify(new TextEncoder().encode(intent), proof, new PublicKey(coinMint).toBytes())) throw new Error('Invalid mint authorization. Return to the original browser and review this launch again.');
}
export async function resolveLaunchSource(input) {
  policyAssert(input.launchMode === 'upload', 'New launches require an uploaded image. Legacy inscription launches are retired.');
  for (const [value, limit, label] of [[input.metadataUrl, 200, 'Metadata'], [input.imageUrl, 2048, 'Image']]) {
    let url;
    try { url = new URL(value); } catch { throw Object.assign(new Error(`${label} needs a public HTTPS URL.`), { status: 400 }); }
    policyAssert(url.protocol === 'https:' && !url.username && !url.password && Buffer.byteLength(value) <= limit, `${label} needs an HTTPS URL of at most ${limit} bytes.`);
  }
  return { uri: input.metadataUrl, imageUrl: input.imageUrl };
}
