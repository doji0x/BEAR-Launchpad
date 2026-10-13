import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { Image } from '@/components/ui/image';

export default function BuybackFeature() {
  return <section className="mt-6 rounded-3xl border border-primary/30 bg-card p-6 text-left sm:p-8" aria-labelledby="burn-buyback-heading">
    <div className="flex items-center gap-3"><Image src="https://media.base44.com/images/public/6aa8d3c82020abebe308c467/1eaceafbf_8D366CA6-F323-4E8E-8069-DA3421FD82BF.png" alt="BEAR" className="h-12 w-12 rounded-xl" /><p className="font-mono text-[10px] tracking-widest text-primary">BEAR BUYBACK PROGRAM</p></div>
    <h2 id="burn-buyback-heading" className="mt-5 font-display text-3xl font-bold tracking-tight"><span className="gold-text">80%</span> back into BEAR.</h2>
    <p className="mt-3 text-sm leading-6 text-muted-foreground">Buy back tokens. Burn them permanently. Reduce supply. BEAR’s reward program puts 80% of verified claimed creator rewards into buying and burning BEAR, with 20% retained in the treasury.</p>
    <p className="mt-3 text-xs leading-5 text-muted-foreground">When enabled, automation checks every five minutes and resumes unfinished claims, purchases and burns. Only verified reward allocations fund purchases. Buybacks and burns do not guarantee price growth or a coin’s survival.</p>
    <Link to="/admin/buybacks" className="mt-5 inline-flex items-center gap-1 text-sm text-primary hover:underline">Buyback dashboard <span className="text-xs text-muted-foreground">· Admin</span><ArrowUpRight size={15} /></Link>
  </section>;
}