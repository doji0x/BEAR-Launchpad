import React, { useEffect, useState } from 'react';
import BrandIdentity from '@/components/BrandIdentity';
import { ArrowLeft, Loader2, Search } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import WalletButton from '@/components/wallet/WalletButton';
import CoinEditorForm from '@/components/launch/CoinEditorForm';
import CoinEditorConfirmation from '@/components/launch/CoinEditorConfirmation';
import useCoinEditor from '@/hooks/useCoinEditor';

export default function EditCoin() {
  const [params] = useSearchParams(), initialMint = params.get('coin') || '';
  const [coinMint, setCoinMint] = useState(initialMint), state = useCoinEditor();
  useEffect(() => { setCoinMint(initialMint); if (initialMint) state.lookup(initialMint); }, [initialMint]);
  const launch = state.launch;
  return <div className="min-h-screen bg-background text-foreground">
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-xl"><div className="mx-auto flex h-16 max-w-2xl items-center gap-3 px-4 sm:px-6"><Link to="/launch-coin" aria-label="Back to coin launch" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border hover:bg-card"><ArrowLeft size={18} /></Link><div className="min-w-0 flex-1"><h1 className="gold-text font-heading text-lg font-semibold">Edit your coin</h1><p className="font-mono text-[9px] tracking-widest text-muted-foreground">CREATOR · METADATA</p></div><WalletButton /></div></header>
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-6 pb-16 sm:px-6 sm:py-8"><BrandIdentity />
      <p className="text-sm leading-6 text-muted-foreground">Update your coin’s served name, image and links using the wallet that launched it.</p>
      <form onSubmit={event => { event.preventDefault(); state.lookup(coinMint); }} className="space-y-3 rounded-2xl border border-border bg-card p-5"><Label htmlFor="edit-coin-mint">Coin mint address</Label><div className="flex gap-2"><Input id="edit-coin-mint" required value={coinMint} onChange={event => setCoinMint(event.target.value)} disabled={state.busy} placeholder="Paste your coin mint" className="min-w-0 font-mono text-xs" /><Button type="submit" disabled={state.busy || !coinMint.trim()}><Search size={16} />Find</Button></div></form>
      {state.stage && <p role="status" className="flex items-start gap-2 rounded-xl border border-border p-4 text-sm"><Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-primary" />{state.stage}</p>}
      {state.error && <p role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive">{state.error}</p>}
      {launch && <section className="space-y-2 rounded-xl border border-border bg-card p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="break-words font-semibold">{launch.name} <span className="text-muted-foreground">({launch.symbol})</span></h2><span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">{launch.status}</span></div><p className="break-all font-mono text-[10px] text-muted-foreground">{launch.coinMint}</p>{launch.status !== 'confirmed' ? <p className="pt-2 text-sm text-muted-foreground">This coin is not confirmed yet. Check its launch status before editing.</p> : launch.unsupportedReason ? <p className="pt-2 text-sm leading-6 text-muted-foreground">{launch.unsupportedReason}</p> : <p className="pt-2 text-xs text-muted-foreground">Only the launching wallet can save changes.</p>}</section>}
      <CoinEditorConfirmation saved={state.saved} />
      {launch?.editable && <CoinEditorForm state={state} />}
      {!launch && !state.busy && <p className="text-center text-xs leading-5 text-muted-foreground">Find a confirmed coin to view its current metadata and editing eligibility.</p>}
    </main>
  </div>;
}