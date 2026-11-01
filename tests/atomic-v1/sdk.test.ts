// Actual pinned SDK/Kit integration. No RPC, wallet approval or broadcasts.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { deflateSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { Keypair, PublicKey, VersionedTransaction as LegacyVersionedTransaction } from 'npm:@solana/web3.js@1.98.4';
import { VersionedTransaction } from 'npm:@solana/web3.js@1.99.0';
import BN from 'npm:bn.js@5.2.2';
import nacl from 'npm:tweetnacl@1.0.3';
import { atomicV1Codec } from '../../base44/shared/atomicV1Kit.ts';
import { buildUnsignedAtomicV1 } from '../../base44/shared/atomicV1NativeBuilder.ts';
import { WSOL, equalBytes, fromBase64, inspectMessage, metadataUriFor, sha256, verifyWire } from '../../base44/shared/atomicV1Protocol.js';
import { BUY, validateIntent } from '../../base44/shared/atomicV1Intent.js';
import { requestPhantomExactMessage } from '../../src/lib/atomicV1ExactMessage.js';
import { requestPhantomV1 } from '../../src/lib/atomicV1PhantomRequest.js';
import { createV1WalletTransaction } from '../../src/lib/atomicV1WalletTransaction.js';
import { fixture } from './fixtures.mjs';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { PUMP_SDK } = require('@pump-fun/pump-sdk');

function png16() {
  const chunk = (type, bytes) => {
    const data = Buffer.concat([Buffer.from(type), bytes]);
    let crc = 0xffffffff;
    for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    const length = Buffer.alloc(4), tail = Buffer.alloc(4); length.writeUInt32BE(bytes.length); tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, data, tail]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(16, 0); ihdr.writeUInt32BE(16, 4); ihdr[8] = 8; ihdr[9] = 2;
  const pixels = Buffer.from(crypto.getRandomValues(new Uint8Array(16 * 49)));
  for (let row = 0; row < 16; row++) pixels[row * 49] = 0;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}
for (const firstBuy of [false, true]) Deno.test(`actual Pump ${firstBuy ? 'create+buy' : 'create'} + image -> Kit V1 -> versioned-object signing -> two signatures`, async () => {
  const payer = Keypair.generate(), mint = Keypair.generate();
  const walletAddress = payer.publicKey.toBase58(), coinMint = mint.publicKey.toBase58();
  const imageBytes = png16();
  const input = { name: 'V1 SDK test', symbol: 'V1TEST', firstBuyAmount: firstBuy ? '0.001' : '', walletAddress, coinMint,
    imageSha256: await sha256(imageBytes), imageByteLength: imageBytes.length };
  const shared = { mint: mint.publicKey, user: payer.publicKey, creator: payer.publicKey,
    name: input.name, symbol: input.symbol, uri: metadataUriFor(coinMint), mayhemMode: false, holderReward: false };
  // Synthetic global account DATA for offline construction, not a live quote.
  const instructions = firstBuy ? await PUMP_SDK.createV2AndBuyV2Instructions({ ...shared,
    global: { feeRecipient: Keypair.generate().publicKey, feeRecipients: [], buybackFeeRecipients: [Keypair.generate().publicKey] },
    amount: new BN(1000), quoteAmount: new BN(1000000), quoteMint: new PublicKey(WSOL) }) :
    [await PUMP_SDK.createV2Instruction(shared)];
  if (firstBuy) {
    const buy = instructions.find(ix => equalBytes(new Uint8Array(ix.data.subarray(0, 8)), BUY));
    assert.ok(buy); assert.equal(buy.data.length, 25); assert.equal(buy.data[24], 0);
    // Legacy V1 signing remains read-only. Reconstruct its historical 24-byte
    // buy payload by removing SDK 4's optional partial_fill=false tail.
    buy.data = buy.data.subarray(0, 24);
    new DataView(buy.data.buffer, buy.data.byteOffset, buy.data.byteLength).setBigUint64(16, 1000000n, true);
  }
  const latest = { blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 200 };
  const prepared = await buildUnsignedAtomicV1({ legacyInstructions: instructions, payerAddress: walletAddress, latest, mint: coinMint, imageBytes });
  const message = fromBase64(prepared.messageBase64), derived = await atomicV1Codec.derive(walletAddress, coinMint);
  const parsed = inspectMessage(message);
  await validateIntent(parsed, input, derived);
  const mintSignature = nacl.sign.detached(message, mint.secretKey);
  const codec = { ...atomicV1Codec,
    toWalletTransaction: wire => createV1WalletTransaction(VersionedTransaction, atomicV1Codec, wire) };
  let calls = 0;
  const provider = { isPhantom: true, publicKey: payer.publicKey,
    request: async () => { throw new Error('Legacy raw-message request must not be called'); },
    signTransaction: async transaction => {
      calls++;
      assert.ok(transaction instanceof VersionedTransaction); assert.equal(transaction.version, 1);
      assert.deepEqual(transaction.message.serialize(), message);
      const fullWire = transaction.serialize(); assert.equal(fullWire.length, message.length + 128);
      // Actual library decoder exercises the complete envelope, not a mock echo.
      const returned = VersionedTransaction.deserialize(fullWire);
      assert.equal(returned.version, 1); assert.deepEqual(returned.signatures[1], new Uint8Array(mintSignature));
      returned.signatures[0] = nacl.sign.detached(message, payer.secretKey);
      assert.throws(() => returned.serialize(), /Serialization of version 1/);
      return returned;
    },
  };
  const signed = await requestPhantomV1({ provider, message, mintAddress: coinMint, mintSignature, payerAddress: walletAddress,
    codec, isCurrent: () => true });
  assert.equal(calls, 1); assert.ok(signed.length > 1232 && signed.length <= 4096);
  assert.equal(signed.length, prepared.size.finalSerializedTransactionBytes);
  await verifyWire(signed);
  let messageCalls = 0;
  const messageProvider = { isPhantom: true, isConnected: true, publicKey: payer.publicKey,
    signMessage: async (bytes, display) => {
      messageCalls++; assert.equal(display, 'hex'); assert.deepEqual(bytes, message);
      return { signature: nacl.sign.detached(bytes, payer.secretKey), publicKey: payer.publicKey };
    } };
  const exactWire = await requestPhantomExactMessage({ provider: messageProvider, message, mintAddress: coinMint,
    mintSignature, payerAddress: walletAddress, intent: input, prepared, codec: atomicV1Codec,
    isCurrent: () => true, assertFresh: async () => {}, authorize: async review => {
      assert.equal(review.name, input.name); assert.equal(review.firstBuySol, input.firstBuyAmount || '0');
      assert.equal(review.transactionBytes, signed.length); return review.messageHash;
    } });
  assert.equal(messageCalls, 1); assert.deepEqual(exactWire, signed); await verifyWire(exactWire);
  const decoded = atomicV1Codec.decode(signed);
  assert.deepEqual(decoded.message, message); assert.deepEqual(decoded.signatures[coinMint], new Uint8Array(mintSignature));
});
Deno.test('schema still declares native state and keeps admin-only RLS', () => {
  const schema = JSON.parse(readFileSync(new URL('../../base44/entities/AtomicV1Launch.jsonc', import.meta.url), 'utf8'));
  for (const name of ['walletAddress','messageBase64','messageHash','signerAddresses','submitTokenHash','stateVersion','signedTransactionBase64','blockhash','nativeProtocol','size','signingTransport','metadataAuthorized']) assert.ok(schema.properties[name], name);
  for (const operation of ['read','create','update','delete']) assert.equal(schema.rls[operation].user_condition.role, 'admin');
});
Deno.test('reproduce buffer error with old decoder or incomplete envelope; complete V1 decodes', async () => {
  const f = await fixture(1941);
  // Two real reproductions; neither establishes Phantom's private implementation.
  assert.throws(() => LegacyVersionedTransaction.deserialize(f.wire), /Reached end of buffer unexpectedly/);
  assert.throws(() => VersionedTransaction.deserialize(f.message), /Reached end of buffer unexpectedly/);
  const tx = VersionedTransaction.deserialize(f.wire);
  assert.equal(tx.version, 1); assert.equal(tx.signatures.length, 2);
  assert.throws(() => tx.message.serialize(), /Serialization of version 1/);
  const adapter = createV1WalletTransaction(VersionedTransaction, atomicV1Codec, f.wire);
  assert.ok(adapter.transaction instanceof VersionedTransaction);
  assert.deepEqual(adapter.transaction.serialize(), f.wire);
  assert.deepEqual(adapter.transaction.message.serialize(), f.message);
  assert.deepEqual(adapter.encodeResult(tx), f.wire);
});
Deno.test('Kit bridge keeps all 4096 bytes and refuses a changed message view', async () => {
  const empty = await fixture(1), f = await fixture(4096 - empty.wire.length + 1);
  const adapter = createV1WalletTransaction(VersionedTransaction, atomicV1Codec, f.wire), tx = adapter.transaction;
  assert.equal(tx.serialize().length, 4096);
  assert.deepEqual(VersionedTransaction.deserialize(tx.serialize()).signatures, tx.signatures);
  const copy = tx.serialize(); copy[10] ^= 1; assert.deepEqual(tx.serialize(), f.wire);
  tx.message.recentBlockhash = Keypair.generate().publicKey.toBase58();
  assert.throws(() => tx.serialize(), /changed the prepared message/);
  assert.throws(() => tx.message.serialize(), /changed the prepared message/);
});
