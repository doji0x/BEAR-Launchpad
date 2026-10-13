import React from 'react';
import BrandIdentity from '@/components/BrandIdentity';
import { X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import WalletButton from '@/components/wallet/WalletButton';
import PublicInscribeForm from '@/components/inscribe/PublicInscribeForm';
import PublicInscriptionStatus from '@/components/inscribe/PublicInscriptionStatus';
import InscriptionHistoryList from '@/components/inscribe/InscriptionHistoryList';
import ValidateBottomBar from '@/components/nav/ValidateBottomBar';
import usePublicInscription from '@/hooks/usePublicInscription';
export default function PublicInscribe() {
  const state = usePublicInscription();
  return <div className="validate-surface min-h-screen text-foreground"><header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl"><div className="mx-auto flex h-14 max-w-2xl items-center gap-2 px-2"><Link to="/" aria-label="Close inscription page" className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-card"><X className="h-5 w-5" /></Link><div className="flex-1"><p className="font-mono text-[10px] leading-none tracking-[0.3em] text-primary">PUBLIC · MAINNET</p><h1 className="font-display font-semibold leading-tight">Inscribe an NFT</h1></div><WalletButton /></div></header><main className="mx-auto max-w-2xl px-4 py-8 pb-24 sm:px-6"><BrandIdentity className="mb-5" /><div className="mb-7"><h2 className="font-display text-3xl font-bold tracking-tight">Put your image on-chain</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Create a one-of-one NFT with its metadata and complete image bytes stored directly on Solana. Your wallet pays the network costs and receives the finished NFT.</p></div>
    <Tabs defaultValue="inscribe">
      <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="inscribe">Inscribe</TabsTrigger><TabsTrigger value="history">History</TabsTrigger></TabsList>
      <TabsContent value="inscribe" className="mt-5"><PublicInscribeForm state={state} /><PublicInscriptionStatus state={state} /></TabsContent>
      <TabsContent value="history" className="mt-5"><InscriptionHistoryList walletAddress={state.wallet.address} /></TabsContent>
    </Tabs>
  </main><ValidateBottomBar /></div>;
}