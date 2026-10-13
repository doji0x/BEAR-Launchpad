import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BEAR_QUOTE_MINT } from '../../../base44/shared/nativePairPolicy.js';
import { TREASURY_ADDRESS } from '../../../base44/shared/treasuryPolicy.js';

export default function PublicLaunchAdvancedOptions({ input, setInput, settings, disabled }) {
  const social = (field, value) => setInput({ ...input, [field]: value });
  return <details open className="rounded-2xl border border-border bg-card/60 p-4">
    <summary className="cursor-pointer font-semibold text-primary">BEAR pair, locked rewards & social links</summary>
    <div className="mt-5 space-y-6">
      <div className="space-y-2"><p className="font-semibold">Fixed pair: your coin / BEAR</p><p className="break-all font-mono text-xs">{BEAR_QUOTE_MINT}</p><p className="text-xs leading-5 text-muted-foreground">Hold BEAR for the first buy and SOL for rent and fees. SOL is not automatically converted.</p></div>
      <div className="space-y-2"><Label htmlFor="public-creator-fee">Creator fee (%)</Label><input className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" id="public-creator-fee" inputMode="decimal" value={input.creatorFeePercent} disabled={disabled || !settings.creatorFeeConfigurable} placeholder="Pump default" onChange={event => setInput({ ...input, creatorFeePercent: event.target.value })} /><p className="text-xs text-muted-foreground">Blank or zero uses Pump's default rate, not a promise of zero fees. A custom rate can be at most {((settings.maxCreatorFeeBps || 0) / 100).toFixed(2)}% under current settings.</p></div>
      <div className="space-y-2 border-t border-border pt-5"><p className="font-semibold">100% of creator rewards to the fixed treasury</p><p className="break-all font-mono text-xs">{TREASURY_ADDRESS}</p><p className="text-xs leading-5 text-muted-foreground">This routing is locked in the same transaction that creates the coin. Holder-reward mode and alternative recipients are disabled. Locking a fee destination does not restrict what its treasury wallet can do with collected funds.</p></div>
      <div className="grid gap-4 border-t border-border pt-5 sm:grid-cols-3">{[['website', 'Website', 'https://example.com'], ['twitter', 'X / Twitter', 'https://x.com/name'], ['github', 'GitHub', 'https://github.com/name']].map(([field, label, placeholder]) => <div key={field} className="space-y-2"><Label htmlFor={`public-${field}`}>{label}</Label><Input id={`public-${field}`} type="url" maxLength={200} value={input[field]} disabled={disabled} placeholder={placeholder} onChange={event => social(field, event.target.value)} /></div>)}</div>
    </div>
  </details>;
}
