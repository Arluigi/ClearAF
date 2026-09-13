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


export type PhotoOriginalState = { id: string; url?: string; error?: boolean };
type PhotoDetailState =
  | { status: 'ready'; photo: PhotoSummary; url: string }
  | { status: 'loading' | 'error' | 'unavailable'; message: string };

/** Resolve independent summary/original outcomes without an endless dialog spinner. */
export function photoDetailState(
  history: PhotoHistoryState,
  selected: string | null,
  original: PhotoOriginalState | null,
): PhotoDetailState {
  if (history.status === 'error') return { status: 'error', message: history.error };
  if (history.status === 'loading') return { status: 'loading', message: 'Loading photo…' };
  const photo = history.photos.find(item => item.id === selected);
  if (!photo) return { status: 'unavailable', message: 'This photo is no longer on this page. Close this view and refresh the history.' };
  if (original?.id === selected && original.error) {
    return { status: 'error', message: 'Photo could not be loaded. Use Refresh images to retry.' };
  }
  if (original?.id === selected && original.url) return { status: 'ready', photo, url: original.url };
  return { status: 'loading', message: 'Loading photo…' };
}
