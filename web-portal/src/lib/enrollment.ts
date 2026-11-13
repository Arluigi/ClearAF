import type { LaunchChartResponse } from '../types/api';

export type EnrollmentSummary = {
  status: 'screening_required' | 'ineligible' | 'consent_required' | 'enrolled';
  screening: { eligible: boolean; reasons: string[]; flags: string[]; stateCode: string; submittedAt: string } | null;
  screeningCount: number;
  consent: { version: number; acceptedAt: string | null };
};
export type EnrollmentHeader = { careModel: 'launch' } | { careModel: 'legacy'; summary: EnrollmentSummary };

/** Legacy records are meaningful only after the authorized chart confirms that care model. */
export async function readEnrollmentHeader(
  readChart: () => Promise<Pick<LaunchChartResponse, 'careModel'>>,
  readLegacy: () => Promise<EnrollmentSummary>,
): Promise<EnrollmentHeader> {
  const chart = await readChart();
  if (chart.careModel === 'launch') return { careModel: 'launch' };
  if (chart.careModel !== 'legacy') throw new Error('Care model not confirmed. Refresh the chart.');
  return { careModel: 'legacy', summary: await readLegacy() };
}

export type StatusLine = { text: string; tone: 'neutral' | 'alert' };
const reasonText: Record<string, string> = { state: 'outside licensed states', age: 'under minimum age', pregnancy: 'pregnant', breastfeeding: 'breastfeeding' };
const acceptedOn = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
export function enrollmentLines(s: EnrollmentSummary): StatusLine[] {
  const lines: StatusLine[] = [];
  if (!s.screening) lines.push({ text: 'Eligibility not screened', tone: 'alert' });
  else if (s.screening.eligible) lines.push({ text: `Eligible (${s.screening.stateCode})`, tone: 'neutral' });
  else lines.push({ text: 'Not eligible: ' + s.screening.reasons.map(r => reasonText[r] ?? r).join(', '), tone: 'alert' });
  if (s.screening?.flags.includes('trying_to_conceive')) lines.push({ text: 'Reported trying to conceive', tone: 'alert' });
  const accepted = s.consent.acceptedAt;
  lines.push({ text: `Consent v${s.consent.version} ${accepted ? `accepted ${acceptedOn(accepted)}` : 'not accepted'}`, tone: accepted ? 'neutral' : 'alert' });
  return lines;
}
