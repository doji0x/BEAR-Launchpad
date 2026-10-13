import { Buffer } from 'node:buffer';
import { AddressLookupTableAccount, AddressLookupTableProgram, PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { policyAssert } from './treasuryPolicy.js';

export const nativeLaunchTableLabel = 'pump-launch-bear-v1';
export async function loadNativeLookupTables(connection, addresses) {
  policyAssert(Array.isArray(addresses) && addresses.length <= 4 && new Set(addresses).size === addresses.length, 'Invalid launch lookup tables.');
  const tables = [];
  for (const address of addresses) {
    const key = new PublicKey(address), info = await connection.getAccountInfo(key, 'confirmed');
    policyAssert(info?.owner.equals(AddressLookupTableProgram.programId), 'Launch lookup table is missing or has the wrong owner.');
    const table = new AddressLookupTableAccount({ key, state: AddressLookupTableAccount.deserialize(Buffer.from(info.data)) });
    policyAssert(table.isActive() && table.state.addresses.length <= 256, 'Launch lookup table is inactive.');
    tables.push(table);
  }
  if (tables.length) {
    const slot = await connection.getSlot('confirmed');
    policyAssert(tables.every(table => slot > table.state.lastExtendedSlot), 'Launch lookup table is not active in this slot yet. Retry after the next slot.');
  }
  return tables;
}
export async function configuredNativeLookupTables(base44, connection) {
  const rows = await base44.asServiceRole.entities.LaunchLookupTable.filter({ label: nativeLaunchTableLabel }, 'created_date', 2);
  policyAssert(rows.length <= 1, 'Duplicate BEAR lookup-table configuration requires administrator review.');
  return loadNativeLookupTables(connection, rows[0]?.address ? [rows[0].address] : []);
}
