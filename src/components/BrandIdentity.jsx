import React from 'react';
import { Link } from 'react-router-dom';
import { Image } from '@/components/ui/image';

export default function BrandIdentity({ compact = false, className = '' }) {
  return <Link to="/" aria-label="BEAR — The Black Bear home" className={`inline-flex shrink-0 items-center gap-2 ${className}`}>
    <Image src="https://media.base44.com/images/public/6aa8d3c82020abebe308c467/1eaceafbf_8D366CA6-F323-4E8E-8069-DA3421FD82BF.png" alt="The Black Bear" className={compact ? 'h-7 w-7 rounded-lg ring-1 ring-primary/30' : 'h-10 w-10 rounded-xl ring-1 ring-primary/30'} />
    <span className="text-left leading-none"><span className={compact ? 'gold-text block font-display text-xs font-semibold tracking-wider' : 'gold-text block font-display font-semibold tracking-wider'}>BEAR</span><span className={compact ? 'mt-1 block text-[7px] text-muted-foreground' : 'mt-1 block text-[10px] text-muted-foreground'}>The Black Bear</span></span>
  </Link>;
}