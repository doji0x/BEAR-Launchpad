import { nativeLaunchPolicy, assertNativeLaunchIntent, atomicQuoteAmount, nativeLaunchIntent, creatorFeeBpsFromPercent } from '../../base44/shared/nativePairPolicy.js';
import { base44 } from '@/api/base44Client';
import { launchMintKey, removeLaunchMintKey } from '@/lib/launchMintKey';
import timeout from '@/lib/atomicV1Timeout';

export const initialLaunchInput = { ...nativeLaunchPolicy(), policyAccepted: false, launchMode: 'upload', inscribedMint: '', name: '', symbol: '', description: '', firstBuyAmount: '', creatorFeePercent: '', feeMode: 'treasury', website: '', twitter: '', github: '' };
export const invokeLaunch = async payload => (await timeout(base44.functions.invoke('publicPumpLaunch', { network: 'mainnet-beta', ...payload }), 90000, 'Request timed out. Check your saved launch before retrying.')).data;
export const launchStorageKey = address => `curated:launches:${address}`;
export const toBase64 = bytes => btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
export const imageSource = row => row.launchMode === 'normal' || row.launchMode === 'upload' ? 'upload' : 'inscribed';
export function readLaunches(address) {
  const rows = JSON.parse(localStorage.getItem(launchStorageKey(address)) || '[]');
  const old = JSON.parse(localStorage.getItem(`validate:normal-pump:${address}`) || 'null');
  return old && !rows.some(row => row.requestId === old.requestId) ? [...rows, old] : rows;
}
export function persistLaunch(row) {
  const rows = readLaunches(row.walletAddress);
  localStorage.setItem(launchStorageKey(row.walletAddress), JSON.stringify([row, ...rows.filter(item => item.requestId !== row.requestId)].slice(0, 100)));
  return row;
}
export function forgetLaunch(row) {
  const address = row.walletAddress;
  localStorage.setItem(launchStorageKey(address), JSON.stringify(readLaunches(address).filter(item => item.requestId !== row.requestId)));
  const legacyKey = `validate:normal-pump:${address}`;
  const legacy = localStorage.getItem(legacyKey);
  if (legacy && JSON.parse(legacy).requestId === row.requestId) localStorage.removeItem(legacyKey);
  removeLaunchMintKey(row.requestId);
}
export function launchParams(row) {
  return { ...row, launchMode: imageSource(row), creatorFeePercent: row.creatorFeeBps ? String(row.creatorFeeBps / 100) : '',
    feeMode: 'treasury', ...(row.socials || {}) };
}
export function normalizeLaunch(input) {
  assertNativeLaunchIntent(input);
  const name = input.name.trim(), symbol = input.symbol.trim().toUpperCase(), description = (input.description || '').trim();
  if (!name || new TextEncoder().encode(name).length > 32 || !symbol || new TextEncoder().encode(symbol).length > 10) throw new Error('Name must fit 32 bytes and ticker 10 bytes.');
  if (description.length > 2000) throw new Error('Description must be at most 2,000 characters.');
  const firstBuyAmount = input.firstBuyAmount.trim();
  atomicQuoteAmount(firstBuyAmount, input.quoteDecimals);
  const socials = Object.fromEntries(['website', 'twitter', 'github'].map(key => {
    const value = (input[key] || '').trim();
    if (!value) return [key, ''];
    const url = new URL(value);
    if (value.length > 200 || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error(`Enter a valid ${key} URL of at most 200 characters.`);
    return [key, url.toString()];
  }));
  const feeRecipients = (input.feeRecipients || []).map(row => ({ type: row.type, value: row.type === 'creator' ? 'Creator' : String(row.value || '').trim(), shareBps: Number(row.shareBps) }));
  return { ...input, name, symbol, description, firstBuyAmount, inscribedMint: input.launchMode === 'inscribed' ? input.inscribedMint.trim() : '', socials, ...socials, feeRecipients, creatorFeeBps: creatorFeeBpsFromPercent(input.creatorFeePercent), holderReward: Boolean(input.holderReward) };
}
export async function createLaunchDraft(input, file, walletAddress, progress) {
  const fields = normalizeLaunch({ ...input, launchMode: 'upload', inscribedMint: '' });
  if (!file || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024) throw new Error('Choose a PNG, JPG, WebP or GIF image up to 5 MB.');
  const upload = file => timeout(base44.integrations.Core.UploadPublicFile({ file }), 60000, 'Upload timed out. No transaction was requested.');
  progress('Uploading the coin image…');
  fields.imageUrl = (await upload(file)).file_url;
  progress('Saving public metadata…');
  const metadata = { name: fields.name, symbol: fields.symbol, description: fields.description, image: fields.imageUrl, showName: true, ...fields.socials };
  fields.metadataUrl = (await upload(new File([JSON.stringify(metadata)], 'm.json', { type: 'application/json' }))).file_url;
  if (new TextEncoder().encode(fields.metadataUrl).length > 200) throw new Error('The metadata URL exceeds the 200-byte limit. Nothing was signed.');
  const requestId = crypto.randomUUID(), mint = await launchMintKey(requestId);
  return { ...fields, requestId, coinMint: mint.address, walletAddress, status: 'draft' };
}
export const launchIntent = nativeLaunchIntent;
