import React, { useEffect, useState } from 'react';
import { Coins } from 'lucide-react';
import { Image } from '@/components/ui/image';

export default function LaunchPreview({ input, file, recovery, wallet }) {
  const [preview, setPreview] = useState('');
  useEffect(() => { if (!file) { setPreview(''); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  const source = input.launchMode === 'upload' ? recovery?.imageUrl || preview : '';
  return <aside aria-label="Launch preview" className="rounded-2xl border border-primary/25 bg-card p-5">
    <p className="mb-4 font-mono text-[10px] tracking-widest text-muted-foreground">LAUNCH PREVIEW</p>
    <div className="flex items-center gap-4">
      {source ? <Image src={source} alt="Coin artwork preview" className="h-20 w-20 shrink-0 rounded-xl" fittingType="fit" /> : <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-muted text-primary"><Coins size={28} /></div>}
      <div className="min-w-0"><h3 className="truncate font-heading font-semibold">{input.name || 'Your coin'} <span className="font-mono text-xs text-primary">${input.symbol || 'COIN'}</span></h3><p className="mt-2 truncate font-mono text-[10px] text-muted-foreground">{wallet.address || 'Connect Phantom to launch'}</p></div>
    </div>
    {input.description && <p className="mt-4 whitespace-pre-wrap break-words text-sm text-muted-foreground">{input.description}</p>}
    <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">Solana Mainnet · Coin creation and first buy in one transaction</p>
  </aside>;
}