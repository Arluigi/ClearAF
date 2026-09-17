'use client';
import { useCallback, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useClinicalAPI } from '@/lib/auth';
import { useRead, LoadState, Pages } from '@/components/care-support/shared';
import { canMarkRefund, careStatusView, decisionLabel, refundLabel } from '@/lib/care-decisions';
import type { CareDecision, DecisionKind } from '@/lib/care-decisions';
import CareDecisionDialog from './CareDecisionDialog';

function DecisionMeta({ decision }: { decision: CareDecision }) {
  const alert = decision.decision !== 'async_care';
  const refund = refundLabel(decision.refundStatus);
  return (
    <div className="space-y-1 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={alert ? 'destructive' : 'secondary'} className="gap-1">
          {alert && <AlertTriangle aria-hidden className="h-3 w-3" />}
          {decisionLabel(decision.decision)}
        </Badge>
        {refund && (
          <Badge variant={decision.refundStatus === 'pending' ? 'destructive' : 'secondary'} className="gap-1">
            {decision.refundStatus === 'pending' && <AlertTriangle aria-hidden className="h-3 w-3" />}
            {refund}
          </Badge>
        )}
      </div>
      <p className="text-ink-secondary">{decision.clinicianName} · {new Date(decision.createdAt).toLocaleString()}</p>
      {decision.patientMessage && <p className="whitespace-pre-wrap break-words text-ink">{decision.patientMessage}</p>}
    </div>
  );
}

export default function CareStatusCard({ patientId, refresh }: { patientId: string; refresh: number }) {
  const api = useClinicalAPI();
  const [page, setPage] = useState(1);
  const [dialogDecision, setDialogDecision] = useState<DecisionKind | null>(null);
  // A refund can be pending on any decision (e.g. refer out, then resume online care), so the
  // action and its error are tracked per decision id.
  const [refundPendingId, setRefundPendingId] = useState<string | null>(null);
  const [refundErrorId, setRefundErrorId] = useState<string | null>(null);

  // The current decision is always the newest one (page 1, first row), independent of the
  // history page the clinician is browsing. `refresh` bumps when a decision is recorded
  // elsewhere (e.g. from a photo); referencing it here is what forces this read to reload.
  const currentFetch = useCallback(() => {
    void refresh;
    return api.getCareDecisions(patientId, 1);
  }, [api, patientId, refresh]);
  const currentResult = useRead(currentFetch);

  const historyFetch = useCallback(() => {
    void refresh;
    return api.getCareDecisions(patientId, page);
  }, [api, patientId, page, refresh]);
  const historyResult = useRead(historyFetch);

  const { current, currentKind, historyRows, canOfferRefund } = careStatusView(currentResult.data, historyResult.data, page);

  const refreshAll = () => {
    currentResult.retry();
    historyResult.retry();
  };

  const markRefund = async (decisionId: string) => {
    setRefundPendingId(decisionId);
    setRefundErrorId(null);
    try {
      await api.markRefundIssued(patientId, decisionId);
      refreshAll();
    } catch {
      setRefundErrorId(decisionId);
    } finally {
      setRefundPendingId(null);
    }
  };

  const refundButton = (decision: CareDecision, label?: string) => (
    <Button
      size="sm"
      variant="outline"
      disabled={refundPendingId !== null}
      aria-label={refundPendingId === decision.id ? undefined : label}
      onClick={() => void markRefund(decision.id)}
    >
      {refundPendingId === decision.id ? 'Marking refund issued…' : 'Mark refund issued'}
    </Button>
  );
  const refundError = (decision: CareDecision) =>
    refundErrorId === decision.id && <p role="alert" className="text-sm">Refund could not be saved. Try again.</p>;

  return (
    <section aria-label="Care status" className="space-y-4 border-t pt-6">
      <h2 className="text-lg font-semibold">Care status</h2>
      <div className="space-y-3 rounded-none border p-4">
        <LoadState {...currentResult} />
        {currentResult.data && (current ? (
          <DecisionMeta decision={current} />
        ) : (
          <p className="text-sm text-ink-secondary">No care decision recorded. Online care is the current default.</p>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setDialogDecision('refer_out')}>Refer out</Button>
          <Button size="sm" variant="outline" onClick={() => setDialogDecision('needs_in_person')}>Needs in-person</Button>
          {currentKind !== 'async_care' && (
            <Button size="sm" variant="outline" onClick={() => setDialogDecision('async_care')}>Resume online care</Button>
          )}
          {current && canOfferRefund && refundButton(current)}
        </div>
        {current && refundError(current)}
      </div>
      <LoadState {...historyResult} />
      {historyResult.data && (
        <>
          {historyRows.length > 0 && (
            <ul className="space-y-3 divide-y">
              {historyRows.map((decision) => (
                <li key={decision.id} className="space-y-2 pt-3">
                  <DecisionMeta decision={decision} />
                  {canMarkRefund(decision) &&
                    refundButton(decision, `Mark refund issued for ${decisionLabel(decision.decision)} recorded ${new Date(decision.createdAt).toLocaleString()}`)}
                  {refundError(decision)}
                </li>
              ))}
            </ul>
          )}
          <Pages page={page} totalPages={historyResult.data.pagination.totalPages} onPage={setPage} />
        </>
      )}
      <CareDecisionDialog
        patientId={patientId}
        photoId={null}
        defaultDecision={dialogDecision ?? 'refer_out'}
        open={dialogDecision !== null}
        onOpenChange={(next) => { if (!next) setDialogDecision(null); }}
        onSaved={() => { setDialogDecision(null); refreshAll(); }}
        onSettledAfterClose={refreshAll}
      />
    </section>
  );
}
