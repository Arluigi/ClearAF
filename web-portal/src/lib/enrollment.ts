export type EnrollmentSummary = {
  status: 'screening_required' | 'ineligible' | 'consent_required' | 'enrolled';
  screening: { eligible: boolean; reasons: string[]; flags: string[]; stateCode: string; submittedAt: string } | null;
  screeningCount: number;
  consent: { version: number; acceptedAt: string | null };
};
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
