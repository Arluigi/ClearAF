import * as React from 'react';
import { cn } from '@/lib/utils';
import { summaryTiles } from '@/lib/worklist';
import type { WorklistSummary as Summary } from '@/types/api';

// The four counts that drive a morning (spec §6 portal #1). Mono figures; ochre only on unread.
export default function WorklistSummary({ summary, now }: { summary: Summary | null; now: Date }) {
  return (
    <dl aria-label="Worklist counts" className="grid grid-cols-2 gap-px bg-rule lg:grid-cols-4">
      {summaryTiles(summary, now).map((tile) => (
        <div key={tile.label} className="bg-rail px-4 py-3.5">
          <dt className="font-data text-[10px] font-medium uppercase leading-none tracking-[0.16em] text-ink-tertiary">{tile.label}</dt>
          <dd className={cn('mt-2 font-data text-[28px] font-medium leading-none tabular-nums', tile.unread ? 'text-attention-text' : 'text-ink')}>{tile.value ?? '–'}</dd>
          <dd className="mt-1.5 min-h-[18px] text-xs text-ink-secondary">{tile.note}</dd>
        </div>
      ))}
    </dl>
  );
}
