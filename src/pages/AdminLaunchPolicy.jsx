/// <reference types="vite/client" />
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import * as web3 from '@solana/web3.js';
import nacl from 'tweetnacl';
import { base44 } from '@/api/base44Client';
import { usePhantomWallet } from '@/contexts/PhantomWalletContext';
import { encodeBase58 } from '@/lib/base58';
import { validateNativeLookupSetup } from '../../base44/shared/nativeLookupSetupCore.js';
import { TREASURY_ADDRESS } from '../../base44/shared/treasuryPolicy.js';

const storageKey = 'bear:launch-lookup-setup:v1';
function savedSetup() { try { return JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch { return null; } }
const encode = bytes => btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
export default function AdminLaunchPolicy() {
  const wallet = usePhantomWallet();
  const [plan, setPlan] = useState(savedSetup), [address, setAddress] = useState(() => savedSetup()?.address || '');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  function save(value) { localStorage.setItem(storageKey, JSON.stringify(value)); setPlan(value); setAddress(value.address); return value; }
  async function guarded(operation) {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      if (wallet.address !== TREASURY_ADDRESS || wallet.provider?.publicKey?.toString() !== TREASURY_ADDRESS) throw new Error('Connect the configured treasury wallet.');
      if (wallet.network !== 'mainnet-beta') throw new Error('Switch to Mainnet.');
      await operation();
    } catch (reason) { setError(reason.response?.data?.error || reason.message); }
    finally { setBusy(false); }
  }
  async function invoke(action, extra = {}) {
    const data = (await base44.functions.invoke('configureNativeLaunchLookup', { action, walletAddress: wallet.address, ...extra })).data;
    if (data.error) throw new Error(data.error);
    return data;
  }
  function connection() {
    const url = import.meta.env.VITE_PUBLIC_SOLANA_RPC_URL || web3.clusterApiUrl('mainnet-beta');
    if (new URL(url).protocol !== 'https:') throw new Error('Wallet validation requires a public HTTPS mainnet RPC.');
    return new web3.Connection(url, { commitment: 'confirmed', fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(20000) }) });
  }
  async function prepare() {
    if (plan?.pending) throw new Error('Check the pending setup signature before preparing another transaction.');
    const prepared = await invoke('prepare', { address });
    for (let i = 0; i < prepared.transactions.length; i++) validateNativeLookupSetup(web3, prepared, i);
    save({ ...prepared, index: 0, pending: null });
    setMessage(prepared.transactions.length ? 'Review the setup below. Each transaction requires a separate treasury approval.' : 'The required addresses are already present. Verify and register the table.');
  }
  async function approveOrCheck() {
    const rpc = connection();
    if (await rpc.getGenesisHash() !== '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d') throw new Error('RPC is not mainnet.');
    let current = plan;
    if (!current?.pending) {
      const tx = validateNativeLookupSetup(web3, current, current.index);
      if (await rpc.getBlockHeight('confirmed') > current.lastValidBlockHeight) throw new Error('Setup approval expired. Prepare again for the same table address.');
      const simulation = await rpc.simulateTransaction(tx);
      if (simulation.value.err) throw new Error(`Setup simulation failed: ${JSON.stringify(simulation.value.err)}`);
      const bytes = tx.message.serialize(), signed = await wallet.provider.signTransaction(tx);
      if (wallet.provider.publicKey.toString() !== TREASURY_ADDRESS || encode(signed.message.serialize()) !== encode(bytes) ||
        !nacl.sign.detached.verify(bytes, signed.signatures[0], new web3.PublicKey(TREASURY_ADDRESS).toBytes())) throw new Error('Wallet returned an invalid setup approval.');
      current = save({ ...current, pending: { signature: encodeBase58(signed.signatures[0]), transaction: encode(signed.serialize()) } });
      try { await rpc.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 2 }); }
      catch { setMessage('Submission is uncertain. The signed transaction is saved. Check its signature before doing anything else.'); return; }
    }
    const status = (await rpc.getSignatureStatuses([current.pending.signature], { searchTransactionHistory: true })).value[0];
    if (status?.confirmationStatus === 'finalized') {
      if (status.err) { save({ ...current, pending: null }); throw new Error(`Setup failed: ${JSON.stringify(status.err)}. Prepare again before signing.`); }
      const next = save({ ...current, pending: null, index: current.index + 1 });
      setMessage(next.index >= next.transactions.length ? 'Setup finalized. Verify and register the table.' : 'This batch finalized. Approve the next batch.');
    } else {
      // Never discard an ambiguous approval or sign another setup in its place.
      if (!status && await rpc.getBlockHeight('confirmed') <= current.lastValidBlockHeight) {
        try { await rpc.sendRawTransaction(Uint8Array.from(atob(current.pending.transaction), char => char.charCodeAt(0)), { skipPreflight: false, maxRetries: 1 }); } catch { /* Keep the exact signature. */ }
      }
      setMessage(`Pending setup: ${current.pending.signature}. Check again for finalized confirmation. If it expired without a receipt, reconcile it with an administrator; do not create a replacement blindly.`);
    }
  }
  async function confirm() {
    if (plan?.pending) throw new Error('Finalize the pending setup approval first.');
    await invoke('confirm', { address });
    setMessage('BEAR lookup table verified and registered. Refresh the launch form. Buyback automation has not been enabled.');
  }
  return <main className="mx-auto max-w-3xl space-y-5 p-6 text-foreground">
    <Link to="/admin/buybacks" className="text-primary underline">Back to buybacks</Link>
    <h1 className="font-heading text-3xl">BEAR launch policy setup</h1>
    <p>This one-time setup stores shared protocol addresses so coin creation and the permanent fee lock fit in a Solana transaction. Only the configured treasury can approve account rent. It does not create coins, trade, transfer tokens, or enable buybacks.</p>
    <p className="break-all font-mono text-sm">Treasury: {TREASURY_ADDRESS}</p>
    {!wallet.address && <button className="rounded border p-3" disabled={busy || wallet.connecting} onClick={() => wallet.connect().catch(reason => setError(reason.message))}>Connect Phantom</button>}
    <label className="block">Existing table address (leave blank only for the first setup)<input className="mt-2 block w-full rounded border bg-background p-3 font-mono text-xs" value={address} disabled={busy || Boolean(plan?.pending)} onChange={event => setAddress(event.target.value.trim())} /></label>
    <button className="rounded border p-3" disabled={busy || Boolean(plan?.pending)} onClick={() => guarded(prepare)}>Prepare or refresh setup</button>
    {plan && <section className="space-y-3 rounded border p-4">
      <p className="break-all font-mono text-xs">Table: {plan.address}</p>
      <p>{plan.missingAddresses.length} addresses to add; {plan.transactions.length} wallet approvals. Account rent and network fees are paid in SOL. Inspect the amount in Phantom before approving.</p>
      {(plan.pending || plan.index < plan.transactions.length) && <button className="rounded border p-3" disabled={busy} onClick={() => guarded(approveOrCheck)}>{plan.pending ? 'Check saved signature' : `Approve setup ${plan.index + 1}`}</button>}
    </section>}
    <button className="rounded border p-3" disabled={busy || !address || Boolean(plan?.pending)} onClick={() => guarded(confirm)}>Verify and register table</button>
    {message && <p role="status" className="break-words">{message}</p>}{error && <p role="alert" className="text-destructive">{error}</p>}
  </main>;
}
