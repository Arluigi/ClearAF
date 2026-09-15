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
