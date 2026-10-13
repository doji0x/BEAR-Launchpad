import React from 'react';

export default function AtomicV1SizeMeter({ size, loading, hasFile }) {
  if (loading) return <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">Calculating the exact signed V1 transaction size…</div>;
  if (!size) return <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">{hasFile ? 'The signed transaction size could not be calculated for this image yet.' : 'Select an image to calculate size, then add the coin name and ticker.'}</div>;
  const over = size.remainingBytes < 0;
  const rows = [['Raw image', size.imageBytes], ['On-chain image payload', size.commitmentBytes], ['Transaction without image', size.transactionBytesWithoutImage], ['Final signed transaction', size.finalSerializedTransactionBytes]];
  return <section className={`rounded-2xl border p-5 ${over ? 'border-destructive/60 bg-destructive/5' : 'border-primary/35 bg-card'}`}>
    <div className="flex items-end justify-between gap-3"><div><p className="font-mono text-[10px] tracking-widest text-primary">SIGNED V1 SIZE</p><p className="mt-1 font-display text-2xl font-semibold">{size.finalSerializedTransactionBytes.toLocaleString()} / 4,096 bytes</p></div><p className={`font-mono text-xs ${over ? 'text-destructive' : 'text-primary'}`}>{over ? `${size.requiredReductionBytes} bytes must be removed` : `${size.remainingBytes} bytes remaining`}</p></div>
    <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${over ? 'bg-destructive' : 'bg-primary'}`} style={{ width: `${Math.min(100, size.finalSerializedTransactionBytes / 40.96)}%` }} /></div>
    <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">{rows.map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 font-mono text-foreground">{value.toLocaleString()} bytes</dd></div>)}</dl>
  </section>;
}