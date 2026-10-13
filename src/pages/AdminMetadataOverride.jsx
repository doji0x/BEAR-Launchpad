import React, { useEffect, useState } from 'react';
import BrandIdentity from '@/components/BrandIdentity';
import { Link } from 'react-router-dom';
import { X, FileCog, Loader2, CheckCircle2, Search, RotateCcw, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import MetadataOverrideFields from '@/components/admin/MetadataOverrideFields';
import MetadataOverrideStatus from '@/components/admin/MetadataOverrideStatus';
import MetadataOverrideHistory from '@/components/admin/MetadataOverrideHistory';
import useMetadataOverride from '@/hooks/useMetadataOverride';

const sourceLabels = { public: 'Public launch', admin: 'Admin launch', atomic_v1: 'Atomic V1 launch' };

export default function AdminMetadataOverride() {
  const [user, setUser] = useState();
  const [coinMint, setCoinMint] = useState('');
  const state = useMetadataOverride();
  useEffect(() => { base44.auth.me().then(setUser).catch(() => setUser({})); }, []);

  const find = async event => { event.preventDefault(); await state.lookup(coinMint.trim()); };

  if (!user) return <div className="validate-surface flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-launch-border border-t-launch-brand" /></div>;
  if (user.role !== 'admin') return <main className="validate-surface flex min-h-screen items-center justify-center px-5"><p>Admin access required.</p></main>;
  const launch = state.launch;
  return <div className="validate-surface min-h-screen text-foreground">
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl"><div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-2"><Link to="/admin/links" aria-label="Back to launch links" className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-card"><X className="h-5 w-5" /></Link><div><p className="font-mono text-[10px] leading-none tracking-[0.3em] text-primary">ADMIN · METADATA</p><h1 className="font-display font-semibold leading-tight">Served metadata override</h1></div></div></header>
    <main className="mx-auto max-w-3xl px-4 py-8 pb-24 sm:px-6"><BrandIdentity className="mb-5" />
      <div className="mb-7 flex items-start gap-3"><span className="rounded-2xl bg-primary p-2.5 text-primary-foreground"><FileCog size={20} /></span><div><h2 className="font-display text-3xl font-bold tracking-tight">Override served metadata</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Change the name, symbol, description, and image that the metadata URI serves to pump.fun and terminals. Nothing is written to Solana — the inscription keeps its original values and every change is written to the audit log.</p></div></div>
      <form onSubmit={find} className="rounded-2xl border border-border bg-card p-5">
        <Label htmlFor="override-coin" className="text-xs text-muted-foreground">Coin mint address</Label>
        <div className="mt-1.5 flex gap-2"><Input id="override-coin" value={coinMint} onChange={event => setCoinMint(event.target.value)} placeholder="Coin mint" className="font-mono text-xs" /><Button type="submit" disabled={state.busy || !coinMint.trim()} className="gap-2">{state.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}Find</Button></div>
      </form>
      {state.error && <p className="mt-3 text-sm text-destructive">{state.error}</p>}
      {launch && <>
        <section className="mt-5 rounded-2xl border border-border bg-card p-5">
          <p className="font-mono text-[10px] tracking-[0.25em] text-primary">{sourceLabels[launch.source] || 'Launch'} · {String(launch.status).toUpperCase()}</p>
          <h3 className="mt-1 font-display text-xl font-semibold">{launch.inscribed.name} {launch.inscribed.symbol && <span className="text-muted-foreground">({launch.inscribed.symbol})</span>}</h3>
          <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">Inscribed mint {launch.inscribedMint}</p>
          <div className="mt-4"><MetadataOverrideStatus override={state.override} inscribed={launch.inscribed} /></div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">Clear a single field below and save to serve the inscribed value for that field again, or remove the whole override with Clear override.</p>
          <div className="mt-5"><MetadataOverrideFields fields={state.fields} onChange={state.update} disabled={state.busy} /></div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => state.save(launch.coinMint)} disabled={state.busy} className="gap-2">{state.busy && <Loader2 className="h-4 w-4 animate-spin" />}{state.busy ? 'Saving…' : 'Save override'}</Button>
            <Button type="button" variant="outline" onClick={() => state.clear(launch.coinMint)} disabled={state.busy || !state.override} className="gap-2"><RotateCcw className="h-4 w-4" />Clear override</Button>
            <Button type="button" variant="ghost" onClick={() => state.lookup(launch.coinMint)} disabled={state.busy} className="gap-2"><RefreshCw className="h-4 w-4" />Refresh status</Button>
          </div>
          {state.saved && <p className="mt-3 flex items-center gap-1.5 text-xs text-primary"><CheckCircle2 className="h-4 w-4" />{state.saved}</p>}
        </section>
        <section className="mt-5 rounded-2xl border border-border bg-card p-5">
          <h3 className="mb-1 font-display text-lg font-semibold">Audit log</h3>
          <p className="mb-4 text-xs text-muted-foreground">{state.history.length} recorded change{state.history.length === 1 ? '' : 's'} · newest first</p>
          <MetadataOverrideHistory history={state.history} />
        </section>
      </>}
    </main>
  </div>;
}