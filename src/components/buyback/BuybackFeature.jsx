import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { Image } from '@/components/ui/image';

export default function BuybackFeature() {
  return <section className="mt-6 rounded-3xl border border-primary/30 bg-card p-6 text-left sm:p-8" aria-labelledby="burn-buyback-heading">
    <div className="flex items-center gap-3"><Image src="https://media.base44.com/images/public/6aa8d3c82020abebe308c467/1eaceafbf_8D366CA6-F323-4E8E-8069-DA3421FD82BF.png" alt="BEAR" className="h-12 w-12 rounded-xl" /><p className="font-mono text-[10px] tracking-widest text-primary">BEAR BUYBACK PROGRAM</p></div>
    <h2 id="burn-buyback-heading" className="mt-5 font-display text-3xl font-bold tracking-tight"><span className="gold-text">80%</span> to buy back & burn.</h2>
    <p className="mt-3 text-sm leading-6 text-muted-foreground">For every coin launched on BEAR, 80% of its creator rewards fund buybacks of that coin’s own token. The bought tokens are burned permanently to reduce its supply, rather than buying and burning a different coin.</p>
    <p className="mt-3 text-xs leading-5 text-muted-foreground">Native-token pairing on pump.fun. Each coin supports its own buyback-and-burn cycle. Buybacks and burns do not guarantee price growth or a coin’s survival.</p>
    <Link to="/admin/buybacks" className="mt-5 inline-flex items-center gap-1 text-sm text-primary hover:underline">Buyback dashboard <span className="text-xs text-muted-foreground">· Admin</span><ArrowUpRight size={15} /></Link>
  </section>;
}