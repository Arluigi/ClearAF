import * as React from 'react';
import { adherenceText, dayBar } from '@/lib/worklist';
import type { WorklistAdherence } from '@/types/api';

// Spec §4.6, clinician side. Read from recorded completions; no target line, no colour grading.
export default function AdherenceSparkline({ adherence }: { adherence: WorklistAdherence | null }) {
  if (!adherence || adherence.percent === null) return <p className="text-xs text-ink-secondary">{adherenceText(adherence)}</p>;
  return (
    <div className="flex items-end gap-2">
      <div aria-hidden className="flex h-[26px] items-end gap-0.5">
        {adherence.days.map((entry) => <span key={entry.localDate} data-day={entry.routines ?? 'uncounted'} className={dayBar(entry.routines)} />)}
      </div>
      <p className="font-data text-xs font-medium tabular-nums text-ink">
        {adherenceText(adherence)}
        <span className="sr-only">{`, ${adherence.completedDays} of ${adherence.countedDays} days with a recorded completion`}</span>
      </p>
    </div>
  );
}
