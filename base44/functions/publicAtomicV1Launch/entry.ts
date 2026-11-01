/** Retired coin-creation endpoint. No wallet key is read and no transaction is sent. */
export default async function(_req: Request): Promise<Response> {
  return Response.json({ enabled: false, error: 'Legacy inscription coin creation is retired. Use /launch-coin for BEAR pairing and mandatory fee locking.' }, { status: 410 });
}
