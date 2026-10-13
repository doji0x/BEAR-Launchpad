import React from 'react';
import { Image } from '@/components/ui/image';
import NormalLaunchImageField from '@/components/launch/NormalLaunchImageField';

export default function LaunchImageSource({ state }) {
  const { file, setFile, recovery } = state;
  return <section className="space-y-4 p-5 sm:p-6">
    <div><h2 className="font-heading font-semibold">Coin image</h2></div>
    {recovery ? <div className="flex items-center gap-3">{recovery.imageUrl && <Image src={recovery.imageUrl} alt="Saved launch artwork" className="h-20 w-20 rounded-lg" fittingType="fit" />}<p className="text-xs text-muted-foreground">Using the image and metadata from your saved launch.</p></div> : <NormalLaunchImageField file={file} setFile={setFile} />}
    {!recovery && <p className="text-xs leading-5 text-muted-foreground">This image and metadata cannot be edited through BEAR after launch.</p>}
  </section>;
}