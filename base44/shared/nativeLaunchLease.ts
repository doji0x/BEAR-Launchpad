import { policyAssert } from './treasuryPolicy.js';

/** Atomic compare-and-set lease. Every write for an existing native attempt uses it. */
export async function withNativeLaunchLease(db, row, operation) {
  const token = crypto.randomUUID(), now = Date.now();
  await db.updateMany({ id: row.id, lockUntil: { $lte: new Date(now).toISOString() } },
    { $set: { lockToken: token, lockUntil: new Date(now + 180000).toISOString() } });
  const [locked] = await db.filter({ id: row.id });
  policyAssert(locked?.lockToken === token, 'Another request is processing this launch. Check its status before retrying.');
  async function save(patch) {
    await db.updateMany({ id: row.id, lockToken: token, lockUntil: { $gt: new Date().toISOString() } }, { $set: patch });
    const [updated] = await db.filter({ id: row.id });
    policyAssert(updated?.lockToken === token && Date.parse(updated.lockUntil) > Date.now(), 'Launch lease expired. Check status before retrying.');
    return updated;
  }
  try { return await operation(locked, save); }
  finally { await db.updateMany({ id: row.id, lockToken: token }, { $set: { lockToken: '', lockUntil: '1970-01-01T00:00:00.000Z' } }); }
}
