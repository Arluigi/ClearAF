// Only list state can travel through patient workspace URLs; never arbitrary return URLs.
export function patientListContext(params: { get(name: string): string | null }) {
  const raw = params.get('page') || '1';
  const value = /^\d+$/.test(raw) ? Number(raw) : 1;
  return { page: Number.isSafeInteger(value) && value > 0 ? value : 1, search: (params.get('search') || '').slice(0, 120) };
}
export function patientListQuery(page: number, search: string) {
  return new URLSearchParams({ page: String(page), ...(search ? { search } : {}) }).toString();
}
