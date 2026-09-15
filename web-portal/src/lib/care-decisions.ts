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
type State<R> = { status: 'idle' | 'saving' | 'error' | 'saved'; error: string; result: R | null };
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
  async submit(body: B) {
    if (this.state.status === 'saving') return;
    this.attempt ??= { id: this.uuid(), body: structuredClone(body) };
    const attempt = this.attempt,
      generation = this.generation;
    this.publish({ ...this.state, status: 'saving', error: '' });
    try {
      const result = await this.send(attempt.id, attempt.body);
      if (generation !== this.generation) return;
      this.attempt = null;
      this.publish({ status: 'saved', error: '', result });
    } catch (cause) {
      if (generation !== this.generation) return;
      const rejected = typeof cause === 'object' && cause !== null && 'status' in cause && (cause as { status: number }).status === 400;
      if (rejected) this.attempt = null;
      this.publish({
        status: 'error',
        result: null,
        error: rejected ? 'The server rejected these fields. Review and try again.' : 'Not confirmed. Retry sends the same decision.',
      });
    }
  }
}
