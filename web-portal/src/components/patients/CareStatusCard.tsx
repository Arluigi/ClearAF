'use client';
import { useCallback, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useClinicalAPI } from '@/lib/auth';
import { useRead, LoadState, Pages } from '@/components/care-support/shared';
import { decisionLabel, refundLabel } from '@/lib/care-decisions';
import type { CareDecision, DecisionKind } from '@/lib/care-decisions';
import CareDecisionDialog from './CareDecisionDialog';

function DecisionRow({ decision, muted = false }: { decision: CareDecision; muted?: boolean }) {
  return (
    <div className={muted ? 'space-y-1 text-sm text-muted-foreground' : 'space-y-1 text-sm'}>
      <p className="flex items-center gap-1 font-medium text-foreground">
        {decision.decision !== 'async_care' && <AlertTriangle aria-hidden className="h-3.5 w-3.5 text-destructive" />}
        {decisionLabel(decision.decision)}
      </p>
      <p>{decision.clinicianName} · {new Date(decision.createdAt).toLocaleString()}</p>
      {decision.patientMessage && <p className="whitespace-pre-wrap break-words text-foreground">{decision.patientMessage}</p>}
      {refundLabel(decision.refundStatus) && <p>{refundLabel(decision.refundStatus)}</p>}
    </div>
  );
}

export default function CareStatusCard({ patientId, refresh }: { patientId: string; refresh: number }) {
  const api = useClinicalAPI();
  const [page, setPage] = useState(1);
  // `refresh` forces a reload after a photo-linked decision is saved elsewhere; it is not read in the body.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetch = useCallback(() => api.getCareDecisions(patientId, page), [api, patientId, page, refresh]);
  const result = useRead(fetch);
  const [dialogDecision, setDialogDecision] = useState<DecisionKind | null>(null);
  const [refundPending, setRefundPending] = useState(false);
  const [refundError, setRefundError] = useState(false);

  const rows = result.data?.data ?? [];
  const current = page === 1 ? (rows[0] ?? null) : null;
  const history = page === 1 ? rows.slice(1) : rows;
  const currentKind: DecisionKind = current?.decision ?? 'async_care';

  const markRefund = async () => {
    if (!current) return;
    setRefundPending(true);
    setRefundError(false);
    try {
      await api.markRefundIssued(patientId, current.id);
      result.retry();
    } catch {
      setRefundError(true);
    } finally {
      setRefundPending(false);
    }
  };

  return (
    <section aria-label="Care status" className="space-y-4 border-t pt-6">
      <h2 className="text-lg font-semibold">Care status</h2>
      <LoadState {...result} />
      {result.data && (
        <>
          <div className="space-y-3 rounded-md border p-4">
            {current ? (
              <DecisionRow decision={current} />
            ) : (
              <p className="text-sm text-muted-foreground">No care decision recorded. Online care is the current default.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setDialogDecision('refer_out')}>Refer out</Button>
              <Button size="sm" variant="outline" onClick={() => setDialogDecision('needs_in_person')}>Needs in-person</Button>
              {currentKind !== 'async_care' && (
                <Button size="sm" variant="outline" onClick={() => setDialogDecision('async_care')}>Resume online care</Button>
              )}
              {current && current.refundStatus === 'pending' && (
                <Button size="sm" variant="outline" disabled={refundPending} onClick={() => void markRefund()}>
                  {refundPending ? 'Marking refund issued…' : 'Mark refund issued'}
                </Button>
              )}
            </div>
            {refundError && <p role="alert" className="text-sm">Refund could not be saved. Try again.</p>}
          </div>
          {history.length > 0 && (
            <ul className="space-y-3 divide-y">
              {history.map((decision) => (
                <li key={decision.id} className="pt-3">
                  <DecisionRow decision={decision} muted />
                </li>
              ))}
            </ul>
          )}
          <Pages page={page} totalPages={result.data.pagination.totalPages} onPage={setPage} />
        </>
      )}
      <CareDecisionDialog
        patientId={patientId}
        photoId={null}
        defaultDecision={dialogDecision ?? 'refer_out'}
        open={dialogDecision !== null}
        onOpenChange={(next) => { if (!next) setDialogDecision(null); }}
        onSaved={() => { setDialogDecision(null); result.retry(); }}
      />
    </section>
  );
}
