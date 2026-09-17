import type { MessageBody, MessageRecord } from './assigned-messaging';

export type FeedbackStatus = 'draft' | 'sending' | 'marking' | 'sent' | 'send-failed' | 'mark-failed';
export interface FeedbackState {
  text: string;
  photoId: string | null;
  status: FeedbackStatus;
  /** Whether the last completed reply also marked its photo reviewed. */
  reviewed: boolean;
}
type Attempt = { id: string; photoId: string; body: MessageBody; mark: boolean };

/**
 * "Send & mark reviewed" as two existing idempotent calls in order. The reply keeps one client id and a frozen body until
 * the server confirms it; a failed review after a confirmed send retries only the review.
 */
export class PhotoFeedbackController {
  private state: FeedbackState = { text: '', photoId: null, status: 'draft', reviewed: false };
  private attempt: Attempt | null = null;
  private generation = 0;
  private listeners = new Set<() => void>();
  constructor(
    private send: (id: string, body: MessageBody) => Promise<MessageRecord>,
    private markReviewed: (photoId: string) => Promise<void>,
    private uuid: () => string = () => crypto.randomUUID(),
  ) {}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(change: Partial<FeedbackState>) {
    this.state = { ...this.state, ...change };
    this.listeners.forEach(listener => listener());
  }
  get frozen() { return this.attempt !== null; }
  target(photoId: string | null) {
    if (this.attempt || photoId === this.state.photoId) return;
    this.publish({ photoId, status: 'draft' });
  }
  edit(text: string) {
    if (this.attempt) return;
    this.publish({ text: text.slice(0, 4000), status: 'draft' });
  }
  newDraft() {
    if (this.state.status !== 'send-failed') return;
    this.attempt = null;
    this.publish({ status: 'draft' });
  }
  leaveUnreviewed() {
    if (this.state.status !== 'mark-failed') return;
    this.attempt = null;
    this.publish({ status: 'draft', reviewed: false });
  }
  cancel() {
    this.generation++;
    this.attempt = null;
    this.publish({ text: '', status: 'draft' });
  }
  async submit(alreadyReviewed: boolean) {
    if (this.state.status === 'sending' || this.state.status === 'marking') return;
    if (!this.attempt) {
      const content = this.state.text.trim();
      const photoId = this.state.photoId;
      if (!content || !photoId) return;
      this.attempt = { id: this.uuid(), photoId, body: { content, reference: { type: 'photo', id: photoId } }, mark: !alreadyReviewed };
    }
    const attempt = this.attempt;
    const generation = this.generation;
    if (this.state.status !== 'mark-failed') {
      this.publish({ status: 'sending' });
      try {
        const message = await this.send(attempt.id, attempt.body);
        if (generation !== this.generation) return;
        if (message.id !== attempt.id || message.content !== attempt.body.content) throw new Error('Invalid send result');
      } catch {
        if (generation === this.generation) this.publish({ status: 'send-failed' });
        return;
      }
      if (!attempt.mark) {
        this.attempt = null;
        this.publish({ text: '', status: 'sent', reviewed: false });
        return;
      }
    }
    this.publish({ text: '', status: 'marking' });
    try {
      await this.markReviewed(attempt.photoId);
      if (generation !== this.generation) return;
      this.attempt = null;
      this.publish({ status: 'sent', reviewed: true });
    } catch {
      if (generation === this.generation) this.publish({ status: 'mark-failed' });
    }
  }
}
