import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { secrets } from 'base44:runtime';
import { assertMainnet } from '../../shared/mintWallet.ts';
import { atomicV1RewardOptions } from '../../shared/atomicV1Rewards.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') return Response.json({ error: 'Admin access required.' }, { status: 403 });
    if (req.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405 });
    const text = await req.text();
    if (text.length > 24000) return Response.json({ error: 'Launch request is too large. Use a smaller image.' }, { status: 413 });
    const body = JSON.parse(text || '{}');
    if (!['options', 'confirm', 'history'].includes(body.action)) return Response.json({ enabled: false, error: 'Legacy V1 coin creation is retired. Use /launch-coin for the mandatory BEAR policy.' }, { status: 410 });
    const rpcUrl = secrets.get('SOLANA_RPC_URL');
    await assertMainnet(rpcUrl);
    if (body.action === 'options') return Response.json(await atomicV1RewardOptions(rpcUrl));
    const entities = base44.entities;
    const publicLaunch = row => { const { signedTransactionBase64, messageBase64, submitTokenHash, ...safe } = row; return safe; };
    if (body.action === 'history') {
      const rows = await entities.AtomicV1Launch.filter({ created_by_id: user.id }, '-created_date', 20);
      return Response.json({ launches: rows.filter(row => !row.walletAddress).map(publicLaunch) });
    }
    if (body.action === 'confirm') {
      const { confirmAtomicV1Launch, requestPattern } = await import('../../shared/atomicV1Launcher.ts');
      if (!requestPattern.test(String(body.requestId || ''))) return Response.json({ error: 'Invalid launch request.' }, { status: 400 });
      const [row] = await entities.AtomicV1Launch.filter({ requestId: body.requestId, created_by_id: user.id });
      if (!row || row.walletAddress) return Response.json({ error: 'Admin V1 launch not found.' }, { status: 404 });
      return Response.json({ launch: publicLaunch(await confirmAtomicV1Launch(entities, rpcUrl, row)) });
    }
    return Response.json({ error: 'Invalid legacy action.' }, { status: 400 });
  } catch (error) { return Response.json({ error: error.message || 'Unable to process the admin V1 launch.' }, { status: 500 }); }
}