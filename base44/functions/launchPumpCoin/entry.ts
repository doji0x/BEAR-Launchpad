import { createClientFromRequest } from 'npm:@base44/sdk@0.8.53';
import { secrets } from 'base44:runtime';
import { assertMainnet } from '../../shared/mintWallet.ts';
import { settleAttempt } from '../../shared/pumpLaunch.ts';

/** Historical admin records remain readable. New coins must use publicPumpLaunch's locked policy. */
export default async function(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405 });
    const base44 = createClientFromRequest(req), user = await base44.auth.me().catch(() => null);
    if (user?.role !== 'admin') return Response.json({ error: 'Admin access required.' }, { status: 403 });
    const body = await req.json();
    if (!['history', 'check'].includes(body.action)) return Response.json({ enabled: false,
      error: 'This legacy launch endpoint is retired. Use /launch-coin for atomic BEAR pairing and locked creator-fee routing.' }, { status: 410 });
    const rows = await base44.entities.LaunchAttempt.filter(body.action === 'check' ? { requestId: String(body.requestId || '') } : {}, '-created_date', 100);
    if (body.action === 'history') return Response.json({ attempts: rows.map(row => ({ ...row, policyVerified: false, automationEligible: false })) });
    if (rows.length !== 1) return Response.json({ error: 'Legacy launch not found or duplicate records require review.' }, { status: 404 });
    const rpcUrl = secrets.get('SOLANA_RPC_URL');
    await assertMainnet(rpcUrl);
    return Response.json({ attempt: { ...rows[0], ...await settleAttempt(rpcUrl, rows[0]), policyVerified: false, automationEligible: false } });
  } catch (error) { return Response.json({ error: error.message || 'Unable to inspect the legacy launch.' }, { status: 500 }); }
}
