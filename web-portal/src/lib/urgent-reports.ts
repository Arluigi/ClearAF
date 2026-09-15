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

/** Normalizes a resolution note the same way the send path does: trimmed, empty becomes null. */
export function normalizeNote(note: string | null | undefined): string | null {
  const trimmed = note?.trim();
  return trimmed ? trimmed : null;
}

/** What a failed acknowledge/resolve attempt was trying to do, so a later refetch can tell
 * whether it actually took effect (as opposed to merely landing on a "no longer needs action"
 * status reached some other way, e.g. someone else resolving with a different note). */
export type UrgentAttempt = { type: 'acknowledge' } | { type: 'resolve'; note: string | null };

/** Clears a row's error only when the refetched row shows that row's failed attempt actually
 * took effect: for acknowledge, status is acknowledged or resolved; for resolve, status is
 * resolved AND resolutionNote equals the attempted note. Otherwise the error (and the attempt
 * that failed) is kept, so a resolve that silently lost to a conflicting concurrent resolve
 * doesn't look like it succeeded. */
export function clearStaleErrors(
  errors: Record<string, boolean>,
  rows: UrgentReport[],
  attempts: Record<string, UrgentAttempt>,
): Record<string, boolean> {
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const confirmedIds = new Set(
    Object.keys(errors).filter((id) => {
      const attempt = attempts[id];
      const row = rowById.get(id);
      if (!attempt || !row) return false;
      if (attempt.type === 'acknowledge') return row.status === 'acknowledged' || row.status === 'resolved';
      return row.status === 'resolved' && row.resolutionNote === attempt.note;
    }),
  );
  return Object.fromEntries(
    Object.entries(errors).filter(([id]) => errors[id] && !confirmedIds.has(id)),
  );
}
