'use client';
import { useCallback } from 'react';
import { useClinicalAPI } from '@/lib/auth';
import { enrollmentLines } from '@/lib/enrollment';
import { useRead, LoadState } from '@/components/care-support/shared';
import { cn } from '@/lib/utils';

// Eligibility and consent as mono metadata. Lines that need attention say so in words and are set in ink at weight 500.
export default function EnrollmentStatus({ patientId }: { patientId: string }) {
  const api = useClinicalAPI();
  const fetch = useCallback(() => api.getEnrollmentSummary(patientId), [api, patientId]);
  const result = useRead(fetch);
  return (
    <div aria-label="Enrollment status">
      {result.status === 'loading' && <p role="status" className="meta-mono">Checking eligibility</p>}
      {result.status === 'error' && <LoadState {...result} />}
      {result.data && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {enrollmentLines(result.data).map((line, index) => (
            <li
              key={index}
              className={cn('font-data text-[11px] uppercase tracking-[0.06em] tabular-nums', line.tone === 'alert' ? 'font-medium text-ink' : 'text-ink-secondary')}
            >
              {line.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
