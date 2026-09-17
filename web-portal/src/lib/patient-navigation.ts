import type { WorklistFilter } from '@/types/api';

export const WORKLIST_FILTERS: readonly WorklistFilter[] = ['needs-review', 'all', 'flagged'];
export const DEFAULT_WORKLIST_FILTER: WorklistFilter = 'needs-review';

// Only list state can travel through patient workspace URLs; never arbitrary return URLs.
export function patientListContext(params: { get(name: string): string | null }) {
  const raw = params.get('page') || '1';
  const value = /^\d+$/.test(raw) ? Number(raw) : 1;
  const filter = WORKLIST_FILTERS.find((candidate) => candidate === params.get('filter')) ?? DEFAULT_WORKLIST_FILTER;
  return { page: Number.isSafeInteger(value) && value > 0 ? value : 1, search: (params.get('search') || '').slice(0, 120), filter };
}

/** The default filter is omitted, so links built before the worklist are unchanged. */
export function patientListQuery(page: number, search: string, filter: WorklistFilter = DEFAULT_WORKLIST_FILTER) {
  return new URLSearchParams({
    page: String(page),
    ...(search ? { search } : {}),
    ...(filter !== DEFAULT_WORKLIST_FILTER ? { filter } : {}),
  }).toString();
}
