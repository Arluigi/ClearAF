'use client';
import { useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useClinicalAPI } from '@/lib/auth';
import { enrollmentLines } from '@/lib/enrollment';
import { useRead, LoadState } from '@/components/care-support/shared';

export default function EnrollmentStatus({ patientId }: { patientId: string }) {
  const api = useClinicalAPI();
  const fetch = useCallback(() => api.getEnrollmentSummary(patientId), [api, patientId]);
  const result = useRead(fetch);
  return (
    <div aria-label="Enrollment status">
      {result.status === 'loading' && <p role="status">Checking eligibility…</p>}
      {result.status === 'error' && <LoadState {...result} />}
      {result.data && (
        <ul className="flex flex-wrap gap-2">
          {enrollmentLines(result.data).map((line, index) => (
            <li key={index}>
              <span
                className={
                  'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm' +
                  (line.tone === 'alert' ? ' border-destructive/60' : '')
                }
              >
                {line.tone === 'alert' && <AlertTriangle aria-hidden className="h-3.5 w-3.5 text-destructive" />}
                {line.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
