export type EnrollmentSummary = {
  status: 'screening_required' | 'ineligible' | 'consent_required' | 'enrolled';
  screening: { eligible: boolean; reasons: string[]; flags: string[]; stateCode: string; submittedAt: string } | null;
  screeningCount: number;
  consent: { version: number; acceptedAt: string | null };
};
export type StatusLine = { text: string; tone: 'neutral' | 'alert' };
const reasonText: Record<string, string> = { state: 'outside licensed states', age: 'under minimum age', pregnancy: 'pregnant', breastfeeding: 'breastfeeding' };
export function enrollmentLines(s: EnrollmentSummary): StatusLine[] {
  const lines: StatusLine[] = [];
  if (!s.screening) lines.push({ text: 'Eligibility not screened', tone: 'alert' });
  else if (s.screening.eligible) lines.push({ text: `Eligible (${s.screening.stateCode})`, tone: 'neutral' });
  else lines.push({ text: 'Not eligible: ' + s.screening.reasons.map(r => reasonText[r] ?? r).join(', '), tone: 'alert' });
  if (s.screening?.flags.includes('trying_to_conceive')) lines.push({ text: 'Reported trying to conceive', tone: 'alert' });
  lines.push({ text: `Consent v${s.consent.version} ${s.consent.acceptedAt ? 'accepted' : 'not accepted'}`, tone: s.consent.acceptedAt ? 'neutral' : 'alert' });
  return lines;
}
