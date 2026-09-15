import type { PaginatedResponse } from '@/types/api';
export type DecisionKind = 'async_care' | 'refer_out' | 'needs_in_person';
export type RefundStatus = 'not_applicable' | 'pending' | 'issued';
export interface CareDecision {
  id: string;
  patientId: string;
  clinicianId: string;
  clinicianName: string;
  decision: DecisionKind;
  patientMessage: string | null;
  photoId: string | null;
  refundStatus: RefundStatus;
  refundUpdatedAt: string | null;
  createdAt: string;
}
export type DecisionBody = { decision: DecisionKind; patientMessage: string | null; photoId: string | null };
export const decisionLabel = (d: DecisionKind) => ({ async_care: 'Online care', refer_out: 'Referred out', needs_in_person: 'Needs in-person care' } as const)[d];
export const refundLabel = (r: RefundStatus) => (r === 'pending' ? 'Refund pending' : r === 'issued' ? 'Refund issued' : null);
/** Any decision whose refund is still pending can be marked issued, not only the current one
 * (e.g. refer out, then resume online care leaves the earlier refund pending in history). */
export const canMarkRefund = (d: CareDecision) => d.refundStatus === 'pending';
/** The iOS app shows no card for online care, so a message there would never be seen. */
export const showsPatientMessage = (d: DecisionKind) => d !== 'async_care';
export const decisionBody = (decision: DecisionKind, message: string, photoId: string | null): DecisionBody => ({
  decision,
  patientMessage: showsPatientMessage(decision) && message.trim() ? message : null,
  photoId,
});

export type CareStatusView = { current: CareDecision | null; currentKind: DecisionKind; historyRows: CareDecision[]; canOfferRefund: boolean };
/**
 * The current decision always comes from the page-1 read, independent of the history page the
 * clinician is browsing, so paging never hides or misrepresents the current state. Page 1's
 * history excludes that same row; later pages show their rows as-is.
 */
export function careStatusView(
  currentPage: PaginatedResponse<CareDecision> | null,
  historyPage: PaginatedResponse<CareDecision> | null,
  page: number,
): CareStatusView {
  const current = currentPage?.data[0] ?? null;
  const historyRows = historyPage ? (page === 1 ? historyPage.data.slice(1) : historyPage.data) : [];
  return { current, currentKind: current?.decision ?? 'async_care', historyRows, canOfferRefund: current !== null && canMarkRefund(current) };
}
type State<R> = { status: 'idle' | 'saving' | 'error' | 'saved'; error: string; result: R | null };
/** 'cancelled': the caller cancelled while the request was in flight and it has since settled; the
 * server may have stored it, so the caller should refresh. The action's own state is unchanged. */
export type SubmitOutcome = 'saved' | 'error' | 'cancelled' | 'busy';
/** Keeps one client id and frozen body per attempt until the server accepts or rejects it (400). */
export class IdempotentAction<B, R> {
  private state: State<R> = { status: 'idle', error: '', result: null };
  private listeners = new Set<() => void>();
  private attempt: { id: string; body: B } | null = null;
  private generation = 0;
  constructor(private send: (id: string, body: B) => Promise<R>, private uuid: () => string = () => crypto.randomUUID()) {}
  snapshot = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  get frozenBody() {
    return this.attempt?.body ?? null;
  }
  private publish(next: State<R>) {
    this.state = next;
    this.listeners.forEach(fn => fn());
  }
  cancel() {
    this.generation++;
  }
  reset() {
    this.attempt = null;
    this.publish({ status: 'idle', error: '', result: null });
  }
  async submit(body: B): Promise<SubmitOutcome> {
    if (this.state.status === 'saving') return 'busy';
    this.attempt ??= { id: this.uuid(), body: structuredClone(body) };
    const attempt = this.attempt,
      generation = this.generation;
    this.publish({ ...this.state, status: 'saving', error: '' });
    try {
      const result = await this.send(attempt.id, attempt.body);
      if (generation !== this.generation) return 'cancelled';
      this.attempt = null;
      this.publish({ status: 'saved', error: '', result });
      return 'saved';
    } catch (cause) {
      if (generation !== this.generation) return 'cancelled';
      const rejected = typeof cause === 'object' && cause !== null && 'status' in cause && (cause as { status: number }).status === 400;
      if (rejected) this.attempt = null;
      this.publish({
        status: 'error',
        result: null,
        error: rejected ? 'The server rejected these fields. Review and try again.' : 'Not confirmed. Retry sends the same decision.',
      });
      return 'error';
    }
  }
}
