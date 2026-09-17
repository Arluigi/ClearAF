'use client';
import { useCallback, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useClinicalAPI } from '@/lib/auth';
import { useRead, LoadState, Pages } from '@/components/care-support/shared';
import { canMarkRefund, careStatusView, decisionLabel, refundLabel } from '@/lib/care-decisions';
import type { CareDecision, DecisionKind } from '@/lib/care-decisions';
import { stamp } from '@/lib/worklist';
import CareDecisionDialog from './CareDecisionDialog';

// Decisions and refunds are said in words; nothing here uses a warning glyph, error hue or ochre.
function DecisionMeta({ decision }: { decision: CareDecision }) {
  const refund = refundLabel(decision.refundStatus);
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={decision.decision === 'async_care' ? 'secondary' : 'default'}>{decisionLabel(decision.decision)}</Badge>
        {refund && <Badge variant="outline">{refund}</Badge>}
      </div>
      <p className="meta-mono">{decision.clinicianName} · {stamp(decision.createdAt)}</p>
      {decision.patientMessage && <p className="max-w-prose whitespace-pre-wrap break-words text-sm">{decision.patientMessage}</p>}
    </div>
  );
}

export default function CareStatusCard({ patientId, refresh }: { patientId: string; refresh: number }) {
  const api = useClinicalAPI();
  const [page, setPage] = useState(1);
  const [dialogDecision, setDialogDecision] = useState<DecisionKind | null>(null);
  // A refund can be pending on any decision, so the action and its error are tracked per decision id.
  const [refundPendingId, setRefundPendingId] = useState<string | null>(null);
  const [refundErrorId, setRefundErrorId] = useState<string | null>(null);

  // The current decision is always the newest one (page 1, first row), independent of the history page. `refresh`
  // bumps when a decision is recorded elsewhere (e.g. from a photo); referencing it forces these reads to reload.
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
    <Button size="sm" variant="outline" disabled={refundPendingId !== null} aria-label={refundPendingId === decision.id ? undefined : label} onClick={() => void markRefund(decision.id)}>
      {refundPendingId === decision.id ? 'Marking refund issued…' : 'Mark refund issued'}
    </Button>
  );
  const refundError = (decision: CareDecision) =>
    refundErrorId === decision.id && <p role="alert" className="text-sm text-error">Refund could not be saved. Try again.</p>;

  return (
    <section aria-label="Care status" className="space-y-4">
      <div className="space-y-1">
        <p className="eyebrow">Care status</p>
        <h2 className="editorial-title text-2xl">Current care decision</h2>
      </div>
      <div className="space-y-3 border-y-2 border-ink py-4">
        <LoadState {...currentResult} loading="Loading care status" />
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
      <LoadState {...historyResult} loading="Loading earlier decisions" />
      {historyResult.data && (
        <>
          {historyRows.length > 0 && (
            <div className="space-y-2">
              <p className="eyebrow">Earlier decisions</p>
              <ul className="divide-y divide-rule border-b border-rule">
                {historyRows.map((decision) => (
                  <li key={decision.id} className="space-y-2 py-3">
                    <DecisionMeta decision={decision} />
                    {canMarkRefund(decision) &&
                      refundButton(decision, `Mark refund issued for ${decisionLabel(decision.decision)} recorded ${stamp(decision.createdAt)}`)}
                    {refundError(decision)}
                  </li>
                ))}
              </ul>
            </div>
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
