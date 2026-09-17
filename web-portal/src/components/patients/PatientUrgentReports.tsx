'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useClinicalAPI } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useRead, LoadState, Pages } from '@/components/care-support/shared';
import { categoryLabel, clearStaleErrors, normalizeNote, runReportAction, splitReports, statusLabel } from '@/lib/urgent-reports';
import type { UrgentAttempt, UrgentReport } from '@/lib/urgent-reports';
import { plural, stamp } from '@/lib/worklist';

// Always above the workspace tabs. Status is said in words; nothing here uses ochre or a warning glyph.
export default function PatientUrgentReports({ patientId }: { patientId: string }) {
  const api = useClinicalAPI();
  const [page, setPage] = useState(1);
  const fetch = useCallback(() => api.getPatientUrgentReports(patientId, page), [api, patientId, page]);
  const result = useRead(fetch);
  const [rows, setRows] = useState<UrgentReport[]>([]);
  const [attempts, setAttempts] = useState<Record<string, UrgentAttempt>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [resolving, setResolving] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  useEffect(() => {
    const newRows = result.data?.data ?? [];
    setRows(newRows);
    setErrors((e) => clearStaleErrors(e, newRows, attempts));
  }, [result.data, attempts]);
  // The worklist Flagged tab links here with #urgent; the section mounts after the patient loads. Scroll once,
  // the first time data is ready — not on every later refetch/action, which would otherwise yank the page back
  // here after an acknowledge or resolve.
  const scrolled = useRef(false);
  useEffect(() => {
    if (scrolled.current || !result.data || window.location.hash !== '#urgent') return;
    scrolled.current = true;
    document.getElementById('urgent')?.scrollIntoView({ block: 'start' });
  }, [result.data]);

  const replace = (row: UrgentReport) => setRows((current) => current.map((r) => (r.id === row.id ? row : r)));

  // A failed transition refetches the page so the row shows its current state; the failed attempt is kept so the
  // error clears only once the refetched row shows it took effect.
  const run = async (id: string, action: () => Promise<UrgentReport>, attempt: UrgentAttempt, afterSave?: () => void) => {
    setPending((p) => ({ ...p, [id]: true }));
    setErrors((e) => ({ ...e, [id]: false }));
    try {
      const saved = await runReportAction(action, {
        saved: replace,
        failed: () => {
          setAttempts((a) => ({ ...a, [id]: attempt }));
          setErrors((e) => ({ ...e, [id]: true }));
        },
        refetch: result.retry,
      });
      if (saved) afterSave?.();
    } finally {
      setPending((p) => ({ ...p, [id]: false }));
    }
  };
  const acknowledge = (id: string) => run(id, () => api.acknowledgeUrgentReport(id), { type: 'acknowledge' });
  const resolve = (id: string) => {
    const note = normalizeNote(notes[id]);
    return run(id, () => api.resolveUrgentReport(id, note), { type: 'resolve', note }, () => setResolving((r) => ({ ...r, [id]: false })));
  };

  const { active, resolved } = splitReports(rows);
  const item = (report: UrgentReport) => (
    <li key={report.id} className="space-y-2 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-[15px] font-medium">{categoryLabel(report.category)}</p>
        <Badge variant="outline">{statusLabel(report.status)}</Badge>
        <span className="meta-mono">{stamp(report.createdAt)}</span>
      </div>
      <p className="max-w-prose whitespace-pre-wrap break-words text-sm">{report.description}</p>
      {report.resolutionNote && <p className="text-sm text-ink-secondary">Note to patient: {report.resolutionNote}</p>}
      {errors[report.id] && <p role="alert" className="text-sm text-error">Not saved. Showing the latest state; try again if still needed.</p>}
      {report.status !== 'resolved' && (
        <div className="flex flex-wrap items-start gap-2">
          {report.status === 'open' && (
            <Button size="sm" variant="outline" disabled={pending[report.id]} onClick={() => void acknowledge(report.id)}>
              {pending[report.id] ? 'Saving…' : 'Acknowledge'}
            </Button>
          )}
          {!resolving[report.id] ? (
            <Button size="sm" variant="outline" disabled={pending[report.id]} onClick={() => setResolving((r) => ({ ...r, [report.id]: true }))}>
              Resolve
            </Button>
          ) : (
            <div className="w-full max-w-xl space-y-2">
              <Label htmlFor={`resolve-note-${report.id}`}>Note to the patient (optional)</Label>
              <Textarea
                id={`resolve-note-${report.id}`}
                maxLength={2000}
                disabled={pending[report.id]}
                value={notes[report.id] ?? ''}
                onChange={(event) => setNotes((n) => ({ ...n, [report.id]: event.target.value }))}
              />
              <Button size="sm" variant="outline" disabled={pending[report.id]} onClick={() => void resolve(report.id)}>
                {pending[report.id] ? 'Saving…' : 'Confirm resolve'}
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  );

  return (
    <section id="urgent" aria-label="Urgent reports" className="scroll-mt-6 space-y-2">
      <p className="eyebrow">Urgent reports</p>
      <LoadState {...result} loading="Checking urgent reports" />
      {result.data && rows.length === 0 && <p className="text-sm text-ink-secondary">No urgent reports for this patient.</p>}
      {active.length > 0 && <ul className="divide-y divide-rule border-y-2 border-ink">{active.map(item)}</ul>}
      {resolved.length > 0 && (
        <details className="border-b border-rule pb-2">
          <summary className="cursor-pointer py-2 text-sm text-ink-secondary">{plural(resolved.length, 'resolved report')} on this page</summary>
          <ul className="divide-y divide-rule">{resolved.map(item)}</ul>
        </details>
      )}
      {result.data && result.data.pagination.totalPages > 1 && (
        <Pages page={page} totalPages={result.data.pagination.totalPages} onPage={setPage} />
      )}
    </section>
  );
}
