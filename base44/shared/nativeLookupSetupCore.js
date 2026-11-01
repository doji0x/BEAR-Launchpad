import { TREASURY_ADDRESS, policyAssert } from './treasuryPolicy.js';

/** Only a treasury-owned lookup-table create/extend can be approved by this setup UI. */
export function validateNativeLookupSetup(web3, plan, index) {
  const { PublicKey, AddressLookupTableProgram, TransactionMessage, VersionedTransaction } = web3;
  policyAssert(plan.authority === TREASURY_ADDRESS && typeof plan.createRequired === 'boolean', 'Unexpected setup authority or operation.');
  policyAssert(Number.isInteger(index) && index >= 0 && index < plan.transactions.length && plan.transactions.length <= 6, 'Invalid setup transaction index.');
  for (const values of [plan.requiredAddresses, plan.missingAddresses]) policyAssert(Array.isArray(values) && values.length <= 100 && new Set(values).size === values.length, 'Invalid setup address list.');
  policyAssert(plan.missingAddresses.every(key => plan.requiredAddresses.includes(key)), 'Setup contains unrelated addresses.');
  const wallet = new PublicKey(TREASURY_ADDRESS), address = new PublicKey(plan.address);
  const expected = [];
  if (plan.createRequired && index === 0) {
    policyAssert(Number.isSafeInteger(plan.recentSlot) && plan.recentSlot >= 0, 'Invalid setup slot.');
    const [create, derived] = AddressLookupTableProgram.createLookupTable({ authority: wallet, payer: wallet, recentSlot: plan.recentSlot });
    policyAssert(derived.equals(address), 'Lookup table address does not match its treasury authority and slot.');
    expected.push(create);
  }
  const batch = plan.missingAddresses.slice(index * 18, index * 18 + 18).map(key => new PublicKey(key));
  if (batch.length) expected.push(AddressLookupTableProgram.extendLookupTable({ lookupTable: address, authority: wallet, payer: wallet, addresses: batch }));
  const transaction = VersionedTransaction.deserialize(Uint8Array.from(atob(plan.transactions[index]), char => char.charCodeAt(0)));
  policyAssert(transaction.version === 0 && transaction.serialize().length <= 1232 && transaction.message.header.numRequiredSignatures === 1 &&
    transaction.message.staticAccountKeys[0].equals(wallet) && transaction.message.addressTableLookups.length === 0, 'Unexpected setup signer or transaction size.');
  const actual = TransactionMessage.decompile(transaction.message).instructions;
  policyAssert(expected.length > 0 && actual.length === expected.length, 'Unexpected setup instructions.');
  expected.forEach((ix, i) => policyAssert(ix.programId.equals(actual[i].programId) && ix.data.equals(actual[i].data) &&
    ix.keys.length === actual[i].keys.length && ix.keys.every((key, j) => key.pubkey.equals(actual[i].keys[j].pubkey) &&
      (!key.isSigner || actual[i].keys[j].isSigner) && (!key.isWritable || actual[i].keys[j].isWritable)), 'The setup transaction contains an unapproved operation.'));
  return transaction;
}
