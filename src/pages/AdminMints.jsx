import React, { useEffect, useState } from 'react';
import BrandIdentity from '@/components/BrandIdentity';
import { Database, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import MintRecordCard from '@/components/admin/MintRecordCard';

export default function AdminMints() {
  const [user, setUser] = useState();
  const [records, setRecords] = useState();
  useEffect(() => {
    let active = true;
    const load = () => base44.entities.MintRecord.list('-created_date', 100).then(items => { if (active) setRecords(items); });
    base44.auth.me().then(current => { setUser(current); if (current.role === 'admin') { load(); } });
    const timer = window.setInterval(() => { if (active) load(); }, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  const retry = async record => {
    const updated = await base44.entities.MintRecord.update(record.id, { status: 'in_progress', errorMessage: '', processedAt: new Date().toISOString() });
    setRecords(current => current.map(item => item.id === record.id ? updated : item));
  };
  const updateMetadata = async (record, values) => {
    const response = await base44.functions.invoke('mintInscribedNft', { action: 'updateMetadata', mint: record.mint, ...values });
    if (response.data.error) throw new Error(response.data.error);
    const updated = await base44.entities.MintRecord.update(record.id, { ...values, symbol: values.symbol.toUpperCase(), errorMessage: '' });
    setRecords(current => current.map(item => item.id === record.id ? updated : item));
  };
  if (!user || (user.role === 'admin' && !records)) return <div className="validate-surface flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-launch-border border-t-launch-brand" /></div>;
  if (user.role !== 'admin') return <main className="validate-surface flex min-h-screen items-center justify-center px-5"><p>Admin access required.</p></main>;
  return <div className="validate-surface min-h-screen text-foreground"><header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl"><div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-2"><Link to="/admin/mint" aria-label="Back to mint console" className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-card"><X className="h-5 w-5" /></Link><div><p className="font-mono text-[10px] leading-none tracking-[0.3em] text-primary">ADMIN · AUDIT</p><h1 className="font-display font-semibold leading-tight">Mint history</h1></div></div></header><main className="mx-auto max-w-3xl px-4 py-8 pb-24 sm:px-6"><BrandIdentity className="mb-5" />
    <div className="mb-7 flex items-start gap-3"><span className="rounded-2xl bg-primary p-2.5 text-primary-foreground"><Database size={20} /></span><div><h2 className="font-display text-3xl font-bold tracking-tight">Recent mints</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Audit completed and interrupted mints, or re-upload their on-chain metadata.</p></div></div>
    {!records.length ? <div className="rounded-3xl border border-dashed border-border py-24 text-center text-sm text-muted-foreground">No mints have been logged yet.</div> : <div className="space-y-4">{records.map(record => <MintRecordCard key={record.id} record={record} onSave={updateMetadata} onRetry={retry} />)}</div>}
  </main></div>;
}