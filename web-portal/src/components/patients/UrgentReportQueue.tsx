'use client';
import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useClinicalAPI } from '@/lib/auth';
import { sessionBoundary } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { categoryLabel, statusLabel } from '@/lib/urgent-reports';
import type { UrgentQueue } from '@/lib/urgent-reports';

export default function UrgentReportQueue({ context }: { context: string }) {
  const api = useClinicalAPI();
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<UrgentQueue | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setResult(null);
    setError(false);
    void api.getUrgentQueue(page).then((value) => { if (active) setResult(value); }).catch(() => { if (active) setError(true); });
    const unsubscribe = sessionBoundary.subscribe(() => { active = false; setResult(null); setError(false); });
    return () => { active = false; unsubscribe(); };
  }, [api, page, revision]);
  return (
    <section aria-label="Urgent reports" className="space-y-4">
      <div>
        <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
          <AlertTriangle aria-hidden className="h-5 w-5 text-destructive" />
          Urgent reports
          {result && <span className="text-sm font-normal text-muted-foreground">{result.openCount} open</span>}
        </h2>
        <p className="text-sm text-muted-foreground">Reported by assigned patients. Open reports appear first, oldest first. This is not a live alert.</p>
      </div>
      <Button variant="outline" size="sm" onClick={() => setRevision((value) => value + 1)}>Refresh urgent reports</Button>
      {error ? (
        <div role="alert"><p>Urgent reports unavailable.</p><Button variant="outline" onClick={() => setRevision((value) => value + 1)}>Retry urgent reports</Button></div>
      ) : !result ? (
        <p role="status">Loading urgent reports…</p>
      ) : (
        <>
          {result.data.length === 0 ? <p>No urgent reports.</p> : (
            <ul className="divide-y rounded-xl bg-card">
              {result.data.map((report) => (
                <li key={report.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">{report.patientName || 'Unnamed patient'}</p>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span>{categoryLabel(report.category)}</span>
                      <Badge variant={report.status === 'open' ? 'destructive' : 'secondary'} className="gap-1">
                        {report.status === 'open' && <AlertTriangle aria-hidden className="h-3 w-3" />}
                        {statusLabel(report.status)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{new Date(report.createdAt).toLocaleString()}</p>
                    <p className="line-clamp-2 text-sm">{report.description}</p>
                  </div>
                  <Button variant="outline" asChild>
                    <a href={`/patients/${encodeURIComponent(report.patientId)}?${context}#urgent`} aria-label={`Open patient ${report.patientName || 'Unnamed patient'}`}>Open patient</a>
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <nav aria-label="Urgent report pages" className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous urgent reports</Button>
            <p className="text-sm" role="status">Page {result.pagination.page} of {Math.max(1, result.pagination.totalPages)} · {result.pagination.total} reports</p>
            <Button variant="outline" disabled={page >= result.pagination.totalPages} onClick={() => setPage(page + 1)}>Next urgent reports</Button>
          </nav>
        </>
      )}
    </section>
  );
}
