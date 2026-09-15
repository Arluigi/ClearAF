'use client';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useClinicalAPI } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useRead, LoadState, Pages } from '@/components/care-support/shared';
import { categoryLabel, runReportAction, statusLabel } from '@/lib/urgent-reports';
import type { UrgentReport } from '@/lib/urgent-reports';

export default function PatientUrgentReports({ patientId }: { patientId: string }) {
  const api = useClinicalAPI();
  const [page, setPage] = useState(1);
  const fetch = useCallback(() => api.getPatientUrgentReports(patientId, page), [api, patientId, page]);
  const result = useRead(fetch);
  const [rows, setRows] = useState<UrgentReport[]>([]);
  useEffect(() => { setRows(result.data?.data ?? []); }, [result.data]);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [resolving, setResolving] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const replace = (row: UrgentReport) => setRows((current) => current.map((r) => (r.id === row.id ? row : r)));

  // A failed transition (e.g. 409 REPORT_RESOLVED after someone else resolved it) refetches the
  // page so the row shows its current state rather than a stale one.
  const run = async (id: string, action: () => Promise<UrgentReport>, afterSave?: () => void) => {
    setPending((p) => ({ ...p, [id]: true }));
    setErrors((e) => ({ ...e, [id]: false }));
    try {
      const saved = await runReportAction(action, {
        saved: replace,
        failed: () => setErrors((e) => ({ ...e, [id]: true })),
        refetch: result.retry,
      });
      if (saved) afterSave?.();
    } finally {
      setPending((p) => ({ ...p, [id]: false }));
    }
  };

  const acknowledge = (id: string) => run(id, () => api.acknowledgeUrgentReport(id));

  const resolve = (id: string) =>
    run(
      id,
      () => api.resolveUrgentReport(id, notes[id]?.trim() ? notes[id] : null),
      () => setResolving((r) => ({ ...r, [id]: false })),
    );

  return (
    <section id="urgent" aria-label="Urgent reports" className="space-y-4 border-t pt-6">
      <h2 className="text-lg font-semibold">Urgent reports</h2>
      <LoadState {...result} />
      {result.data && (rows.length === 0 ? (
        <p>No urgent reports for this patient.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((report) => (
            <li key={report.id} className="space-y-2 rounded-md border p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                <span>{categoryLabel(report.category)}</span>
                <Badge variant={report.status === 'open' ? 'destructive' : 'secondary'} className="gap-1">
                  {report.status === 'open' && <AlertTriangle aria-hidden className="h-3 w-3" />}
                  {statusLabel(report.status)}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{new Date(report.createdAt).toLocaleString()}</p>
              <p className="whitespace-pre-wrap break-words text-sm">{report.description}</p>
              {report.resolutionNote && <p className="text-sm text-muted-foreground">Note to patient: {report.resolutionNote}</p>}
              {errors[report.id] && <p role="alert" className="text-sm">Not saved. Showing the latest state; try again if still needed.</p>}
              {report.status !== 'resolved' && (
                <div className="flex flex-wrap items-start gap-2">
                  {report.status === 'open' && (
                    <Button size="sm" variant="outline" disabled={pending[report.id]} onClick={() => void acknowledge(report.id)}>
                      {pending[report.id] ? 'Saving…' : 'Acknowledge'}
                    </Button>
                  )}
                  {!resolving[report.id] ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending[report.id]}
                      onClick={() => setResolving((r) => ({ ...r, [report.id]: true }))}
                    >
                      Resolve
                    </Button>
                  ) : (
                    <div className="w-full space-y-2">
                      <label className="block text-sm" htmlFor={`resolve-note-${report.id}`}>Note to the patient (optional)</label>
                      <Textarea
                        id={`resolve-note-${report.id}`}
                        maxLength={2000}
                        disabled={pending[report.id]}
                        value={notes[report.id] ?? ''}
                        onChange={(event) => setNotes((n) => ({ ...n, [report.id]: event.target.value }))}
                      />
                      <Button size="sm" disabled={pending[report.id]} onClick={() => void resolve(report.id)}>
                        {pending[report.id] ? 'Saving…' : 'Confirm resolve'}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      ))}
      {result.data && result.data.pagination.totalPages > 1 && (
        <Pages page={page} totalPages={result.data.pagination.totalPages} onPage={setPage} />
      )}
    </section>
  );
}
