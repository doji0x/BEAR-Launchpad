import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Rocket } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

export default function NormalLaunchHero({ showLaunchLink = false }) {
  const { user, isAuthenticated } = useAuth();
  return <section className="rounded-3xl border border-primary/25 bg-card/60 p-6 sm:p-8">
    <span className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] text-primary"><Rocket size={14} />LAUNCH · BUY BACK · BURN</span>
    <h2 className="mt-5 font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">Give your coin <span className="gold-text">a fighting chance.</span></h2>
    <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">BEAR — The Black Bear is a launchpad built around buying back tokens and burning supply. Because a coin’s future should matter as much as its launch.</p>
    <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground"><span>01 · Add details</span><span>02 · Approve in Phantom</span><span>03 · Coin created</span></div>
    {showLaunchLink && isAuthenticated && user?.role === 'admin' && <Link to="/launch-coin" className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Create a coin <ArrowUpRight size={16} /></Link>}
  </section>;
}