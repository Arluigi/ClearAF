import type { PhotoSummary, PaginatedResponse } from '../types/api';

export interface PhotoHistoryState {
  photos: PhotoSummary[];
  page: number;
  total: number;
  totalPages: number;
  status: 'loading' | 'ready' | 'error';
  error: string;
}

/** Owns one mounted patient's history. Request order, not response timing, wins. */
export class PhotoHistoryController {
  private state: PhotoHistoryState = { photos: [], page: 1, total: 0, totalPages: 1, status: 'loading', error: '' };
  private request = 0;
  private listeners = new Set<() => void>();

  constructor(private fetchPage: (page: number) => Promise<PaginatedResponse<PhotoSummary>>) {}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  cancel() { this.request += 1; }
  private publish(state: PhotoHistoryState) {
    this.state = state;
    this.listeners.forEach(listener => listener());
  }
  async load(page: number) {
    const request = ++this.request;
    this.publish({ ...this.state, photos: [], page, status: 'loading', error: '' });
    try {
      const result = await this.fetchPage(page);
      if (request !== this.request) return;
      this.publish({ photos: result.data, page: result.pagination.page, total: result.pagination.total,
        totalPages: Math.max(1, result.pagination.totalPages), status: 'ready', error: '' });
    } catch {
      if (request !== this.request) return;
      this.publish({ ...this.state, photos: [], status: 'error', error: 'Photos could not be loaded. Check your connection and try again.' });
    }
  }
}
