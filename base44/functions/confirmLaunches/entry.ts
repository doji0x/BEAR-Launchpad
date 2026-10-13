import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { Connection, Keypair, PublicKey } from 'npm:@solana/web3.js@1.98.4';
import BN from 'npm:bn.js@5.2.2';
import runtimePumpSdk from '../../shared/pumpSdkRuntime.ts';
const { OnlinePumpSdk } = runtimePumpSdk;
import { parseWallet, rpcRequest } from '../../shared/mintWallet.ts';
import { settleAttempt, isLaunched } from '../../shared/pumpLaunch.ts';
import { readLaunchLookupTable } from '../../shared/launchLookupTable.ts';
import { atomicAmount, devBuyInstructions, submitDevBuy } from '../../shared/pumpBuy.ts';

// Scheduled: resolves every pending launch against the chain, then submits the first
// buy for any coin that was created without one so nothing stays stranded.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required.' }, { status: 403 });
    const rpcUrl = secrets.get('SOLANA_RPC_URL');
    const pending = await base44.asServiceRole.entities.LaunchAttempt.filter({ status: 'pending' }, '-created_date', 50);
    const results = [];
    for (const attempt of pending) {
      const settled = await settleAttempt(rpcUrl, attempt);
      if (settled.status !== attempt.status) await base44.asServiceRole.entities.LaunchAttempt.update(attempt.id, { ...settled, checkedAt: new Date().toISOString() });
      results.push({ coinMint: attempt.coinMint, status: settled.status });
    }

    const stranded = (await base44.asServiceRole.entities.LaunchAttempt.filter({ phase: 'buy_ready' }, '-created_date', 20)).filter(item => item.status !== 'confirmed' && item.firstBuyAmount);
    if (!stranded.length) return Response.json({ checked: results.length, recovered: 0, results });
    const wallet = Keypair.fromSecretKey(parseWallet(secrets.get('MINT_WALLET_SECRET_KEY')));
    const onlineSdk = new OnlinePumpSdk(new Connection(rpcUrl, 'confirmed'));
    const global = await onlineSdk.fetchGlobal();
    const feeConfig = await onlineSdk.fetchFeeConfig();
    const quoteControl = await onlineSdk.fetchQuoteControl();
    const table = await readLaunchLookupTable(base44, rpcUrl);
    const lookupTables = table ? [table] : [];
    const recovered = [];
    for (const attempt of stranded) {
      try {
        if (!await isLaunched(rpcUrl, attempt.coinMint, attempt.bondingCurve)) { recovered.push({ coinMint: attempt.coinMint, status: 'not_launched' }); continue; }
        const quote = await onlineSdk.resolveQuoteMint(new PublicKey(attempt.quoteMint));
        const quoteAmount = atomicAmount(String(attempt.firstBuyAmount), quote.decimals);
        const buyIxs = await devBuyInstructions({ onlineSdk, global, feeConfig, quoteControl, mintKey: new PublicKey(attempt.coinMint), user: wallet.publicKey, quoteAmount, quote, creatorFeeBps: attempt.creatorFeeBps ? new BN(attempt.creatorFeeBps) : undefined });
        const latest = (await rpcRequest(rpcUrl, 'getLatestBlockhash', [{ commitment: 'confirmed' }])).value;
        const outcome = await submitDevBuy({ rpcUrl, wallet, buyIxs, lookupTables, latest });
        if (outcome.error) {
          await base44.asServiceRole.entities.LaunchAttempt.update(attempt.id, { error: outcome.error, checkedAt: new Date().toISOString() });
          recovered.push({ coinMint: attempt.coinMint, status: 'buy_failed', error: outcome.error });
          continue;
        }
        await base44.asServiceRole.entities.LaunchAttempt.update(attempt.id, { status: 'pending', phase: 'buy_pending', signature: outcome.signature, error: '', lastValidBlockHeight: latest.lastValidBlockHeight, checkedAt: new Date().toISOString() });
        recovered.push({ coinMint: attempt.coinMint, status: 'buy_submitted', signature: outcome.signature });
      } catch (error) {
        recovered.push({ coinMint: attempt.coinMint, status: 'buy_error', error: error.message });
      }
    }
    return Response.json({ checked: results.length, recovered: recovered.length, results, recoveries: recovered });
  } catch (error) {
    return Response.json({ error: error.message || 'Unable to confirm launches.' }, { status: 500 });
  }
}