import React, { useEffect, useState } from 'react';
import BrandIdentity from '@/components/BrandIdentity';
import { Link } from 'react-router-dom';
import { X, Link2, Loader2, CheckCircle2, Search, FileCog } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import LaunchLinksFields from '@/components/launch/LaunchLinksFields';
import useLaunchLinks from '@/hooks/useLaunchLinks';

const sourceLabels = { public: 'Public launch', admin: 'Admin launch', atomic_v1: 'Atomic V1 launch' };

export default function AdminLaunchLinks() {
  const [user, setUser] = useState();
  const [coinMint, setCoinMint] = useState('');
  const [found, setFound] = useState(null);
  const state = useLaunchLinks();
  useEffect(() => { base44.auth.me().then(setUser).catch(() => setUser({})); }, []);

  const find = async event => {
    event.preventDefault();
    setFound(null);
    const result = await state.lookup(coinMint.trim());
    if (result) setFound(result);
  };

  if (!user) return <div className="validate-surface flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-launch-border border-t-launch-brand" /></div>;
  if (user.role !== 'admin') return <main className="validate-surface flex min-h-screen items-center justify-center px-5"><p>Admin access required.</p></main>;
  return <div className="validate-surface min-h-screen text-foreground">
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl"><div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-2"><Link to="/admin/mint" aria-label="Back to mint console" className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-card"><X className="h-5 w-5" /></Link><div><p className="font-mono text-[10px] leading-none tracking-[0.3em] text-primary">ADMIN · LINKS</p><h1 className="font-display font-semibold leading-tight">Launched coin links</h1></div></div></header>
    <main className="mx-auto max-w-3xl px-4 py-8 pb-24 sm:px-6"><BrandIdentity className="mb-5" />
      <div className="mb-7 flex items-start gap-3"><span className="rounded-2xl bg-primary p-2.5 text-primary-foreground"><Link2 size={20} /></span><div><h2 className="font-display text-3xl font-bold tracking-tight">Edit launch links</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Update the website, X, and GitHub links of any confirmed launch. Links are served off-chain, so nothing is written to Solana.</p></div></div>
      <form onSubmit={find} className="rounded-2xl border border-border bg-card p-5">
        <Label htmlFor="coin-mint" className="text-xs text-muted-foreground">Coin mint address</Label>
        <div className="mt-1.5 flex gap-2"><Input id="coin-mint" value={coinMint} onChange={event => setCoinMint(event.target.value)} placeholder="Coin mint" className="font-mono text-xs" /><Button type="submit" disabled={state.busy || !coinMint.trim()} className="gap-2">{state.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}Find</Button></div>
      </form>
      <Link to="/admin/metadata" className="mt-3 inline-flex items-center gap-1.5 text-xs text-primary underline-offset-4 hover:underline"><FileCog className="h-3.5 w-3.5" />Override served name, image, or description</Link>
      {state.error && <p className="mt-3 text-sm text-destructive">{state.error}</p>}
      {found && <section className="mt-5 rounded-2xl border border-border bg-card p-5">
        <p className="font-mono text-[10px] tracking-[0.25em] text-primary">{sourceLabels[found.source] || 'Launch'} · {String(found.status).toUpperCase()}</p>
        <h3 className="mt-1 font-display text-xl font-semibold">{found.name} {found.symbol && <span className="text-muted-foreground">({found.symbol})</span>}</h3>
        {found.ownerWallet && <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">Launched by {found.ownerWallet}</p>}
        <div className="mt-4"><LaunchLinksFields links={state.links} onChange={state.update} disabled={state.busy} /></div>
        <div className="mt-4 flex items-center gap-3">
          <Button type="button" onClick={() => state.saveAsAdmin(found.coinMint)} disabled={state.busy} className="gap-2">{state.busy && <Loader2 className="h-4 w-4 animate-spin" />}{state.busy ? 'Saving…' : 'Save links'}</Button>
          {state.saved && <span className="flex items-center gap-1.5 text-xs text-primary"><CheckCircle2 className="h-4 w-4" />Links updated</span>}
        </div>
      </section>}
    </main>
  </div>;
}