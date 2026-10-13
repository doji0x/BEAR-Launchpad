/// <reference types="vite/client" />
import * as sdk from '@pump-fun/pump-sdk';
import * as web3 from '@solana/web3.js';
import BN from 'bn.js';
import { treasuryLaunch } from '@/lib/treasuryLaunch';
import { createNativeQuoteTools } from '../../base44/shared/nativeQuoteCore.js';
import { assertSameNativeLaunch } from '../../base44/shared/nativeLaunchState.js';
import { policyAssert } from '../../base44/shared/treasuryPolicy.js';

const { Connection, PublicKey, VersionedTransaction, AddressLookupTableAccount, AddressLookupTableProgram } = web3;
const quotes = createNativeQuoteTools({ sdk, web3, BN });
/** Independent, read-only RPC verification before asking Phantom to sign. Never expose a server RPC secret here. */
export async function validatePreparedNativeLaunch(approved, prepared) {
  assertSameNativeLaunch(approved, prepared);
  policyAssert(prepared.preflight?.ok === true, 'A successful launch simulation is required before signing.');
  policyAssert(approved.creationSignature ? prepared.launchStep === 'first_buy' : ['create_lock_buy', 'create_lock'].includes(prepared.launchStep),
    'The server changed the expected launch stage. Check this saved launch.');
  const rpcUrl = import.meta.env.VITE_PUBLIC_SOLANA_RPC_URL || web3.clusterApiUrl('mainnet-beta');
  policyAssert(new URL(rpcUrl).protocol === 'https:', 'Use an HTTPS public mainnet RPC for wallet validation.');
  const connection = new Connection(rpcUrl, { commitment: 'confirmed', fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(20000) }) });
  policyAssert(await connection.getGenesisHash() === '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d', 'Wallet validation RPC is not Solana mainnet.');
  const online = new sdk.OnlinePumpSdk(connection);
  const [quote, global, feeConfig, quoteControl] = await Promise.all([quotes.resolve(online, approved.quoteMint), online.fetchGlobal(), online.fetchFeeConfig(), online.fetchQuoteControl()]);
  const snapshot = quotes.snapshot(quote, global);
  for (const field of ['quoteMint', 'quoteTokenProgram', 'quoteDecimals', 'protocolBuybackFeeRecipient'])
    policyAssert(prepared[field] === snapshot[field], `Prepared ${field} differs from current mainnet state. Refresh this saved launch.`);
  if (prepared.launchStep !== 'first_buy') policyAssert(prepared.quoteSource === snapshot.quoteSource &&
    JSON.stringify(prepared.pumpQuoteAccounts) === JSON.stringify(snapshot.pumpQuoteAccounts), 'BEAR market state changed. Refresh this saved launch before signing.');
  const curve = prepared.launchStep === 'first_buy' ? (await treasuryLaunch.verify(connection, approved.coinMint, approved.quoteMint, 'finalized')).curve : null;
  const current = quotes.firstBuy({ global, feeConfig, quoteControl, quote, firstBuyAmount: approved.firstBuyAmount,
    creatorFeeBps: approved.creatorFeeBps, bondingCurve: curve });
  policyAssert(/^\d+$/.test(prepared.minimumTokens) && new BN(prepared.minimumTokens).gte(current.amount),
    'The proposed minimum output is below the current 1% slippage limit. Check the saved launch and refresh the quote.');
  policyAssert(Array.isArray(prepared.lookupTableAddresses) && prepared.lookupTableAddresses.length <= 4 &&
    new Set(prepared.lookupTableAddresses).size === prepared.lookupTableAddresses.length, 'Invalid launch lookup tables.');
  const tables = [];
  for (const address of prepared.lookupTableAddresses) {
    const key = new PublicKey(address), info = await connection.getAccountInfo(key, 'confirmed');
    policyAssert(info?.owner.equals(AddressLookupTableProgram.programId), 'Lookup table could not be verified on mainnet.');
    const table = new AddressLookupTableAccount({ key, state: AddressLookupTableAccount.deserialize(info.data) });
    policyAssert(table.isActive(), 'Lookup table is no longer active.');
    tables.push(table);
  }
  const slot = await connection.getSlot('confirmed');
  policyAssert(tables.every(table => slot > table.state.lastExtendedSlot), 'Lookup table extension is not usable yet.');
  policyAssert(typeof prepared.transaction === 'string' && prepared.transaction.length <= 1800, 'Invalid prepared transaction.');
  const transaction = VersionedTransaction.deserialize(Uint8Array.from(atob(prepared.transaction), char => char.charCodeAt(0)));
  await treasuryLaunch.validateTransaction(transaction, { ...prepared, ...approved,
    quoteDecimals: prepared.quoteDecimals, quoteTokenProgram: prepared.quoteTokenProgram, quoteSource: prepared.quoteSource,
    pumpQuoteAccounts: prepared.pumpQuoteAccounts, protocolBuybackFeeRecipient: prepared.protocolBuybackFeeRecipient,
    minimumTokens: prepared.minimumTokens, quoteAmountAtomic: prepared.quoteAmountAtomic, launchStep: prepared.launchStep }, tables);
  return transaction;
}
