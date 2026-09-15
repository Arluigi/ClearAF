'use client';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useClinicalAPI } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useRead, LoadState } from '@/components/care-support/shared';
import { categoryLabel, statusLabel } from '@/lib/urgent-reports';
import type { UrgentReport } from '@/lib/urgent-reports';

export default function PatientUrgentReports({ patientId }: { patientId: string }) {
  const api = useClinicalAPI();
  const fetch = useCallback(() => api.getPatientUrgentReports(patientId), [api, patientId]);
  const result = useRead(fetch);
  const [rows, setRows] = useState<UrgentReport[]>([]);
  useEffect(() => { setRows(result.data?.data ?? []); }, [result.data]);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [resolving, setResolving] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const replace = (row: UrgentReport) => setRows((current) => current.map((r) => (r.id === row.id ? row : r)));

  const acknowledge = async (id: string) => {
    setPending((p) => ({ ...p, [id]: true }));
    setErrors((e) => ({ ...e, [id]: false }));
    try {
      replace(await api.acknowledgeUrgentReport(id));
    } catch {
      setErrors((e) => ({ ...e, [id]: true }));
    } finally {
      setPending((p) => ({ ...p, [id]: false }));
    }
  };

  const resolve = async (id: string) => {
    setPending((p) => ({ ...p, [id]: true }));
    setErrors((e) => ({ ...e, [id]: false }));
    try {
      const note = notes[id]?.trim() ? notes[id] : null;
      replace(await api.resolveUrgentReport(id, note));
      setResolving((r) => ({ ...r, [id]: false }));
    } catch {
      setErrors((e) => ({ ...e, [id]: true }));
    } finally {
      setPending((p) => ({ ...p, [id]: false }));
    }
  };

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
              <p className="flex items-center gap-1 text-sm font-medium">
                {report.status !== 'resolved' && <AlertTriangle aria-hidden className="h-3.5 w-3.5 text-destructive" />}
                {categoryLabel(report.category)} · {statusLabel(report.status)}
              </p>
              <p className="text-sm text-muted-foreground">{new Date(report.createdAt).toLocaleString()}</p>
              <p className="whitespace-pre-wrap break-words text-sm">{report.description}</p>
              {report.resolutionNote && <p className="text-sm text-muted-foreground">Note to patient: {report.resolutionNote}</p>}
              {errors[report.id] && <p role="alert" className="text-sm">Not saved. Try again.</p>}
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
    </section>
  );
}
