import * as React from 'react';
import { cn } from '@/lib/utils';
import { lockupGap, showsWordmark, svgNumber as n, wordmarkSize } from './geometry';
import { Mark } from './Mark';

type LockupProps = {
  /** Frame height of the mark in px (H). The wordmark, gap and fallback derive from it. */
  height: number;
  className?: string;
};

/**
 * Primary horizontal lockup (spec §10.3): mark + "clearaf" in Newsreader 300, tracked 0.18em, italic "af",
 * gap 0.4 × H, centred on each other. Below 96px wide it renders the mark alone.
 * Placements keep 0.5 × H clear on every side (clearSpace in ./geometry).
 */
export function Lockup({ height, className }: LockupProps): React.JSX.Element {
  if (!showsWordmark(height)) return <Mark height={height} title="ClearAF" className={cn('block', className)} />;
  return (
    <div className={cn('flex w-fit items-center', className)} style={{ gap: `${n(lockupGap(height))}px` }}>
      <Mark height={height} />
      <span aria-hidden className="font-display font-light lowercase leading-none tracking-[0.18em]" style={{ fontSize: `${n(wordmarkSize(height))}px` }}>
        clear<span className="italic">af</span>
      </span>
      <span className="sr-only">ClearAF</span>
    </div>
  );
}
