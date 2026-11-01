import { createClientFromRequest } from 'npm:@base44/sdk@0.8.53';
import { secrets } from 'base44:runtime';
import BN from 'npm:bn.js@5.2.5';
import { Buffer } from 'node:buffer';
import { Connection, PublicKey, Keypair, AddressLookupTableProgram, TransactionMessage, VersionedTransaction } from 'npm:@solana/web3.js@1.99.0';
import runtimePumpSdk from '../../shared/pumpSdkRuntime.ts';
const { OnlinePumpSdk } = runtimePumpSdk;
import { assertMainnet } from '../../shared/mintWallet.ts';
import { BEAR_QUOTE_MINT, assertPumpCoinQuoteResolution } from '../../shared/nativePairPolicy.js';
import { TREASURY_ADDRESS, policyAssert } from '../../shared/treasuryPolicy.js';
import { treasuryLaunch } from '../../shared/treasuryLaunch.ts';
import { stableLaunchKeys } from '../../shared/launchLookupTable.ts';
import { loadNativeLookupTables, nativeLaunchTableLabel } from '../../shared/nativeLaunchLookup.ts';

/** Admin-only, wallet-signed setup. This function NEVER signs, sends, or reads a wallet secret. */
export default async function(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405 });
    const base44 = createClientFromRequest(req), user = await base44.auth.me().catch(() => null);
    if (user?.role !== 'admin') return Response.json({ error: 'Admin access required.' }, { status: 403 });
    const body = await req.json();
    policyAssert(['prepare', 'confirm'].includes(body.action), 'Choose prepare or confirm.');
    policyAssert(body.walletAddress === TREASURY_ADDRESS, 'Connect the configured treasury wallet to initialize the BEAR lookup table.');
    const rpcUrl = secrets.get('SOLANA_RPC_URL');
    await assertMainnet(rpcUrl);
    const connection = new Connection(rpcUrl, { commitment: 'confirmed', fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(20000) }) }), online = new OnlinePumpSdk(connection);
    const [global, quote] = await Promise.all([online.fetchGlobal(), online.resolveQuoteMint(new PublicKey(BEAR_QUOTE_MINT))]);
    assertPumpCoinQuoteResolution(quote);
    const probes = [0, 1].map(() => ({ mint: Keypair.generate().publicKey, user: Keypair.generate().publicKey }));
    const sets = await Promise.all(probes.map(probe => treasuryLaunch.build({ ...probe, global, name: 'Probe', symbol: 'PRB', uri: 'https://example.com/m.json',
      amount: new BN(1), quoteAmount: new BN(1), quoteMint: quote.mint, quoteTokenProgram: quote.quoteTokenProgram, pumpQuote: quote.pumpQuote?.accounts })));
    const required = stableLaunchKeys(sets, probes.flatMap(probe => [probe.mint, probe.user]));
    policyAssert(required.length > 0 && required.length <= 100, 'Unexpected number of shared launch accounts.');
    const db = base44.asServiceRole.entities.LaunchLookupTable;
    const rows = await db.filter({ label: nativeLaunchTableLabel }, 'created_date', 2);
    policyAssert(rows.length <= 1, 'Duplicate BEAR lookup-table records require review.');
    const wallet = new PublicKey(TREASURY_ADDRESS);
    if (body.action === 'confirm') {
      const [table] = await loadNativeLookupTables(connection, [String(body.address || '')]);
      policyAssert(table.state.authority?.equals(wallet), 'The table is not controlled by the configured treasury.');
      const addresses = table.state.addresses.map(address => address.toBase58());
      policyAssert(required.every(address => addresses.includes(address)), 'The table does not yet contain the required BEAR launch accounts.');
      const data = { label: nativeLaunchTableLabel, address: table.key.toBase58(), authority: TREASURY_ADDRESS, addresses };
      await (rows[0] ? db.update(rows[0].id, data) : db.create(data));
      return Response.json({ configured: true, ...data });
    }
    const existingAddress = String(body.address || rows[0]?.address || '');
    const table = existingAddress ? (await loadNativeLookupTables(connection, [existingAddress]))[0] : null;
    policyAssert(!table || table.state.authority?.equals(wallet), 'Unexpected lookup table authority.');
    const stored = new Set(table?.state.addresses.map(address => address.toBase58()) || []);
    const missing = required.filter(address => !stored.has(address));
    policyAssert(stored.size + missing.length <= 256, 'The BEAR lookup table is full.');
    const latest = await connection.getLatestBlockhash('confirmed'), recentSlot = await connection.getSlot('finalized');
    const [create, newAddress] = AddressLookupTableProgram.createLookupTable({ authority: wallet, payer: wallet, recentSlot });
    const address = table?.key || newAddress, transactions = [];
    for (let offset = 0; offset < missing.length || (!table && offset === 0); offset += 18) {
      const batch = missing.slice(offset, offset + 18).map(address => new PublicKey(address));
      const instructions = !table && offset === 0 ? [create] : [];
      if (batch.length) instructions.push(AddressLookupTableProgram.extendLookupTable({ lookupTable: address, authority: wallet, payer: wallet, addresses: batch }));
      if (!instructions.length) break;
      const tx = new VersionedTransaction(new TransactionMessage({ payerKey: wallet, recentBlockhash: latest.blockhash, instructions }).compileToV0Message());
      policyAssert(tx.serialize().length <= 1232, 'Lookup table setup exceeds the transaction limit.');
      transactions.push(Buffer.from(tx.serialize()).toString('base64'));
    }
    return Response.json({ address: address.toBase58(), transactions, createRequired: !table, requiredAddresses: required, missingAddresses: missing,
      lastValidBlockHeight: latest.lastValidBlockHeight, recentSlot, authority: TREASURY_ADDRESS,
      notice: 'Setup requires explicit treasury-wallet approval and SOL rent. Creation and trading of coins are not performed here.' });
  } catch (error) { return Response.json({ error: error.message || 'Unable to prepare the BEAR lookup table.' }, { status: error.status || 500 }); }
}
