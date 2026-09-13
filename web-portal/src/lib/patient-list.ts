import type { PaginatedResponse, User } from '@/types/api';
export type PatientListState = { patients: User[]; page: number; total: number; totalPages: number; search: string; status: 'idle'|'loading'|'ready'|'error'; error: string };
type Loader = (page: number, search: string) => Promise<PaginatedResponse<User>>;
export class PatientListController {
  private state: PatientListState = { patients: [], page: 1, total: 0, totalPages: 1, search: '', status: 'idle', error: '' };
  private listeners = new Set<() => void>(); private request = 0; private disposed = false;
  constructor(private readonly loader: Loader) {}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  private publish(next: PatientListState) { if (!this.disposed) { this.state = next; this.listeners.forEach(listener => listener()); } }
  async load(page = this.state.page) {
    const request = ++this.request; const search = this.state.search;
    this.publish({ ...this.state, page, status: 'loading', error: '' });
    try {
      const result = await this.loader(page, search);
      if (request !== this.request || this.disposed) return;
      this.publish({ ...this.state, patients: result.data, page: result.pagination.page, total: result.pagination.total, totalPages: Math.max(1, result.pagination.totalPages), status: 'ready', error: '' });
    } catch {
      if (request !== this.request || this.disposed) return;
      this.publish({ ...this.state, status: 'error', error: 'Unable to load assigned patients. Please try again.' });
    }
  }
  restore(page: number, search: string) { this.publish({ ...this.state, page, search }); return this.load(page); }
  search(search: string) { this.publish({ ...this.state, search, page: 1 }); return this.load(1); }
  goToPage(page: number) { return this.load(page); }
  retry() { return this.load(); }
  // Effect cleanup retires its request; subscription cleanup owns listener removal.
  cancelPending() { this.request += 1; }
  dispose() { this.disposed = true; this.request += 1; this.listeners.clear(); }
}
