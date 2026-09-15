export type UrgentCategory = 'reaction_to_treatment' | 'rapid_worsening' | 'pain_or_infection' | 'other';
export type UrgentStatus = 'open' | 'acknowledged' | 'resolved';
export interface UrgentReport {
  id: string;
  patientId: string;
  category: UrgentCategory;
  description: string;
  status: UrgentStatus;
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
}
export interface UrgentQueue {
  data: (UrgentReport & { patientName: string | null })[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  openCount: number;
}
export const categoryLabel = (c: UrgentCategory) =>
  ({
    reaction_to_treatment: 'Reaction to a treatment',
    rapid_worsening: 'Skin getting much worse quickly',
    pain_or_infection: 'Pain, swelling or signs of infection',
    other: 'Something else',
  } as const)[c];
export const statusLabel = (s: UrgentStatus) => ({ open: 'Open', acknowledged: 'Seen', resolved: 'Resolved' } as const)[s];
/** Runs an acknowledge/resolve. On any failure (e.g. 409 REPORT_RESOLVED because another clinician
 * resolved it) the row is flagged and the list refetched, so it shows its current state, not a stale one. */
export async function runReportAction(
  action: () => Promise<UrgentReport>,
  on: { saved: (row: UrgentReport) => void; failed: () => void; refetch: () => void },
): Promise<boolean> {
  let row: UrgentReport;
  try {
    row = await action();
  } catch {
    on.failed();
    on.refetch();
    return false;
  }
  on.saved(row);
  return true;
}

/** Clears error flags for reports that no longer need action (i.e., are resolved).
 * Returns a new errors object containing only errors for reports that still need action. */
export function clearStaleErrors(
  errors: Record<string, boolean>,
  rows: UrgentReport[],
): Record<string, boolean> {
  const resolvedIds = new Set(rows.filter((r) => r.status === 'resolved').map((r) => r.id));
  return Object.fromEntries(
    Object.entries(errors).filter(([id]) => !resolvedIds.has(id) && errors[id]),
  );
}
