import React from 'react';
import ValidateHeader from '@/components/ValidateHeader';
import ValidateBottomBar from '@/components/nav/ValidateBottomBar';
import NormalLaunchHero from '@/components/launch/NormalLaunchHero';
import ContractAddress from '@/components/ContractAddress';
import BuybackFeature from '@/components/buyback/BuybackFeature';
import BrandIdentity from '@/components/BrandIdentity';

export default function Home() {
  return <div className="validate-surface flex min-h-screen flex-col pb-24 text-foreground">
    <ValidateHeader />
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-16 pt-14 sm:pt-20">
      <NormalLaunchHero showLaunchLink />
      <ContractAddress />
      <BuybackFeature />
    </main>
    <footer className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 border-t border-border px-4 py-7 text-center text-[10px] text-muted-foreground">
      <div className="flex w-full flex-wrap items-center justify-between gap-4">
        <BrandIdentity compact />
        <span className="font-mono text-primary">BUY BACK. BURN SUPPLY.</span>
      </div>
      <nav aria-label="External links" className="flex items-center gap-4">
        <a href="https://github.com/doji0x/Spunk" target="_blank" rel="noreferrer" className="hover:text-primary">Docs</a>
        <a href="https://x.com/humanevolvd?s=11" target="_blank" rel="noreferrer" className="hover:text-primary">X</a>
      </nav>
    </footer>
    <ValidateBottomBar />
  </div>;
}