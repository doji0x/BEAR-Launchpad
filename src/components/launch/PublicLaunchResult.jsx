import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Clock3, XCircle } from 'lucide-react';

export default function PublicLaunchResult({ result }) {
  if (!result) return null;
  const confirmed = result.status === 'confirmed', failed = result.status === 'failed', awaitingBuy = result.status === 'awaiting_first_buy';
  const Icon = confirmed ? CheckCircle2 : failed ? XCircle : Clock3;
  return <section aria-live="polite" className="mt-6 rounded-2xl border border-border bg-card p-5 text-left">
    <div className="flex gap-3"><Icon className={confirmed ? 'text-primary' : failed ? 'text-destructive' : 'text-primary'} /><div><h2 className="font-semibold">{confirmed ? 'Launch and first buy confirmed' : awaitingBuy ? 'Coin created; fees locked; first buy needs approval' : failed ? 'Transaction failed on-chain' : 'Awaiting finalized verification'}</h2><p className="mt-1 text-sm text-muted-foreground">{confirmed ? 'The saved launch transaction has finalized.' : awaitingBuy ? 'Use Resume launch to approve the first buy. Your existing coin must not be created again.' : failed && result.creationSignature ? 'The coin already exists with locked fees. Only the first-buy step failed.' : failed ? 'No coin was created by this failed transaction.' : 'Use Check status to review the saved transaction; do not create a replacement coin.'}</p></div></div>
    {confirmed && result.inscribedMint && <Link to={`/edit-coin?coin=${encodeURIComponent(result.coinMint)}`} className="mt-4 inline-block text-sm text-primary underline underline-offset-4">Update name, image & links</Link>}
    {confirmed && !result.inscribedMint && <p className="mt-3 text-xs text-muted-foreground">This coin uses the uploaded static metadata file. Its display metadata cannot be updated through BEAR.</p>}
    {result.quoteSymbol && <p className="mt-3 text-sm text-muted-foreground">Pair asset: {result.quoteSymbol} · First buy: {result.firstBuyAmount} {result.quoteSymbol}</p>}
    <p className="mt-3 text-xs text-muted-foreground">{result.policyVerified === true ? 'The BEAR pair and locked 100% treasury destination were verified on-chain.' : 'The native-pair fee policy has not been verified for this record.'}</p>
    {result.policyError && <p role="alert" className="mt-2 text-xs text-destructive">{result.policyError}</p>}
    {result.nativePairPolicyVersion && <p className="mt-2 text-xs text-muted-foreground">Per-coin buyback automation is not enabled by Phases 1-2.</p>}
    {result.creationSignature && <a className="mt-3 block break-all font-mono text-[10px] text-primary underline" href={`https://solscan.io/tx/${result.creationSignature}`} target="_blank" rel="noreferrer">Creation and fee lock: {result.creationSignature}</a>}
    <div className="mt-4 space-y-2 font-mono text-[10px]">{result.signature && <a className="block break-all text-launch-brand underline" href={`https://solscan.io/tx/${result.signature}`} target="_blank" rel="noreferrer">Transaction: {result.signature}</a>}{result.rewardSignature && <a className="block break-all text-launch-brand underline" href={`https://solscan.io/tx/${result.rewardSignature}`} target="_blank" rel="noreferrer">Rewards: {result.rewardSignature}</a>}<a className="block break-all text-launch-brand underline" href={`https://pump.fun/coin/${result.coinMint}`} target="_blank" rel="noreferrer">Coin: {result.coinMint}</a></div>
  </section>;
}