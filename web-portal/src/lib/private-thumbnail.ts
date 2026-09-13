export type ThumbnailState = { status: 'loading' | 'ready' | 'error'; url?: string };
type ObjectURLs = Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>;

/** Owns transient bytes for one grid. Each load retires the previous grid. */
export class PrivateThumbnailController {
  private state: Record<string, ThumbnailState> = {};
  private listeners = new Set<() => void>();
  private pending: string[] = [];
  private active = new Set<AbortController>();
  private generation = 0;
  private disposed = false;

  constructor(
    private fetchThumbnail: (id: string, signal?: AbortSignal) => Promise<Blob>,
    private urls: ObjectURLs = URL,
  ) {}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish(state: Record<string, ThumbnailState>) {
    this.state = state;
    this.listeners.forEach(listener => listener());
  }
  private retire() {
    this.generation++;
    this.pending = [];
    for (const abort of this.active) abort.abort();
    this.active.clear();
    for (const value of Object.values(this.state)) if (value.url) this.urls.revokeObjectURL(value.url);
    this.publish({});
  }
  load(ids: string[]) {
    this.retire();
    this.disposed = false;
    this.pending = [...new Set(ids)];
    this.publish(Object.fromEntries(this.pending.map(id => [id, { status: 'loading' }])));
    this.pump();
  }
  dispose() { this.disposed = true; this.retire(); }

  private pump() {
    while (!this.disposed && this.active.size < 2 && this.pending.length) {
      const id = this.pending.shift()!;
      const abort = new AbortController();
      const generation = this.generation;
      this.active.add(abort);
      void this.run(id, abort, generation);
    }
  }
  private async run(id: string, abort: AbortController, generation: number) {
    let cancel!: () => void;
    const cancelled = new Promise<never>((_resolve, reject) => {
      cancel = () => reject(new DOMException('Request aborted', 'AbortError'));
      abort.signal.addEventListener('abort', cancel, { once: true });
    });
    try {
      const blob = await Promise.race([this.fetchThumbnail(id, abort.signal), cancelled]);
      if (this.disposed || generation !== this.generation || abort.signal.aborted) return;
      const url = this.urls.createObjectURL(blob);
      this.publish({ ...this.state, [id]: { status: 'ready', url } });
    } catch {
      if (!this.disposed && generation === this.generation && !abort.signal.aborted) {
        this.publish({ ...this.state, [id]: { status: 'error' } });
      }
    } finally {
      abort.signal.removeEventListener('abort', cancel);
      this.active.delete(abort);
      if (generation === this.generation) this.pump();
    }
  }
}
