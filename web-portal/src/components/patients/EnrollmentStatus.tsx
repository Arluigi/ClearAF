'use client';
import * as React from 'react';
import { useCallback } from 'react';
import { useClinicalAPI } from '@/lib/auth';
import { enrollmentLines, readEnrollmentHeader, type EnrollmentHeader } from '@/lib/enrollment';
import { useRead, LoadState } from '@/components/care-support/shared';
import { cn } from '@/lib/utils';

export function EnrollmentStatusDetails({ data, onOpenReview }: { data: EnrollmentHeader; onOpenReview: () => void }) {
  if (data.careModel === 'launch') {
    return <p className="text-xs text-ink-secondary">Eligibility, identity and consent receipts are reviewed in{' '}
      <button type="button" onClick={onOpenReview} className="min-h-9 text-ink underline underline-offset-[3px]">Enrollment review</button>.
    </p>;
  }
  return <ul className="flex flex-wrap gap-x-4 gap-y-1">
    {enrollmentLines(data.summary).map((line, index) => (
      <li
        key={index}
        className={cn('font-data text-[11px] uppercase tracking-[0.06em] tabular-nums', line.tone === 'alert' ? 'font-medium text-ink' : 'text-ink-secondary')}
      >
        {line.text}
      </li>
    ))}
  </ul>;
}

// Launch receipts and legacy screening belong to different enrollment records.
export default function EnrollmentStatus({ patientId, onOpenReview }: { patientId: string; onOpenReview: () => void }) {
  const api = useClinicalAPI();
  const fetch = useCallback(() => readEnrollmentHeader(() => api.launch().chart(patientId), () => api.getEnrollmentSummary(patientId)), [api, patientId]);
  const result = useRead(fetch);
  return (
    <div aria-label="Enrollment status">
      {result.status === 'loading' && <p role="status" className="meta-mono">Checking enrollment</p>}
      {result.status === 'error' && <LoadState {...result} />}
      {result.data && <EnrollmentStatusDetails data={result.data} onOpenReview={onOpenReview} />}
    </div>
  );
}
