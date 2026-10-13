import React from 'react';
import BrandIdentity from '@/components/BrandIdentity';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import WalletButton from '@/components/wallet/WalletButton';
import ValidateBottomBar from '@/components/nav/ValidateBottomBar';
import UnifiedLaunchForm from '@/components/launch/UnifiedLaunchForm';
import LaunchPreview from '@/components/launch/LaunchPreview';
import SavedLaunches from '@/components/launch/SavedLaunches';
import PublicLaunchPreflight from '@/components/launch/PublicLaunchPreflight';
import PublicLaunchResult from '@/components/launch/PublicLaunchResult';
import EditLaunchLinksCard from '@/components/launch/EditLaunchLinksCard';
import useUnifiedLaunch from '@/hooks/useUnifiedLaunch';

export default function LaunchCoin() {
  const state = useUnifiedLaunch();
  const { result, wallet, busy, loading } = state;
  return <div className="min-h-screen bg-background pb-24 text-foreground">
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-xl"><div className="mx-auto flex h-16 max-w-2xl items-center gap-3 px-4 sm:px-6">
      <Link to="/" aria-label="Back home" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border hover:bg-card"><ArrowLeft size={18} /></Link>
      <div className="min-w-0 flex-1"><h1 className="font-heading text-lg font-semibold">Launch your coin</h1><p className="font-mono text-[9px] tracking-widest text-muted-foreground">ADMIN ONLY / SOLANA MAINNET</p></div><WalletButton />
    </div></header>
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-6 sm:px-6 sm:py-8"><BrandIdentity />
      <div className="space-y-4"><p className="text-sm leading-6 text-muted-foreground">Launch with the long term in mind. The launch model pairs coins with the native token on pump.fun and allocates 80% of each coin’s creator rewards to buying back and burning its own token. Add artwork and details, choose your first buy, and approve in Phantom.</p><ol className="grid grid-cols-3 gap-3 border-b border-border pb-5 text-xs leading-5">{['Choose image', 'Set first buy', 'Approve in Phantom'].map((label, i) => <li key={label}><span className="block font-mono text-[10px] text-primary">0{i + 1}</span>{label}</li>)}</ol></div>
      {state.stage && <p role="status" className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm"><Loader2 size={16} className="shrink-0 animate-spin text-primary" />{state.stage}</p>}
      {state.error && <p role="alert" className="break-words rounded-xl border border-destructive/40 p-4 text-sm text-destructive">{state.error}</p>}
      {loading && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" />Loading launch settings and saved attempts…</p>}
      <SavedLaunches attempts={state.attempts} busy={busy || loading} onCheck={state.check} onResume={state.resume} onDelete={state.remove} />
      {(!state.attempts.length || state.recovery) && <><UnifiedLaunchForm state={state} /><LaunchPreview input={state.input} file={state.file} recovery={state.recovery} wallet={wallet} /></>}
      <PublicLaunchPreflight preflight={state.preflight} />
      <PublicLaunchResult result={result && { ...result, quoteSymbol: result.quoteSymbol || state.settings.pairs?.find(pair => pair.mint === result.quoteMint)?.symbol }} />
      {result?.status === 'confirmed' && result.feeRecipients?.length > 0 && result.rewardStatus !== 'confirmed' && <Button type="button" variant="outline" disabled={busy || loading} onClick={state.rewards}>{result.rewardSignature ? 'Check fee-sharing transaction' : 'Configure fee sharing'}</Button>}
      {result?.status === 'confirmed' && result.inscribedMint && <EditLaunchLinksCard key={result.coinMint} coinMint={result.coinMint} wallet={wallet} initial={result.socials} />}
    </main><ValidateBottomBar />
  </div>;
}