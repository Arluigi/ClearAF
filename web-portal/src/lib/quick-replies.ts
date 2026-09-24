// Approved clinician quick replies (owner sign-off 2026-09-24). These five strings deliberately carry brief
// encouragement after a factual clause and so break spec §7 (sentence case, no exclamation marks, no
// motivational copy) — see "Clinician quick replies" in docs/design/design-language.md for the documented
// exception. They never assess the skin: that stays something the clinician types.
export interface QuickReplyContext {
  /** The patient's active routine version, or null when it can't be said without a guess (see activeRoutineVersion). */
  activeVersion: number | null;
  /** The patient's check-in day, written out for a patient-facing message ("2 Sep"), or null when unavailable. */
  checkInDay: string | null;
}

export interface QuickReply {
  id: string;
  text: string;
}

const TEMPLATES: { id: string; render: (context: QuickReplyContext) => string | null }[] = [
  { id: 'no-change', render: () => 'Reviewed — no change to your routine. Keep it up!' },
  {
    id: 'stay-version',
    render: ({ activeVersion }) =>
      activeVersion === null ? null : `Reviewed. Stay with v${activeVersion} as written — you're doing the right things.`,
  },
  { id: 'photos-clear', render: () => 'Photos are coming through clearly. Keep them coming!' },
  {
    id: 'next-check-in',
    render: ({ checkInDay }) => (checkInDay === null ? null : `Recorded. Next check-in is ${checkInDay} — see you then.`),
  },
  { id: 'closer-photo', render: () => 'Reviewed. Could I get a closer photo in better light next time?' },
];

/** Resolves the approved copy against page data, omitting any chip whose token can't be sourced honestly. */
export function quickReplies(context: QuickReplyContext): QuickReply[] {
  return TEMPLATES.flatMap(template => {
    const text = template.render(context);
    return text === null ? [] : [{ id: template.id, text }];
  });
}

/** A tapped chip fills the draft; with existing text it appends on a new line rather than overwriting it. */
export function appendQuickReply(current: string, reply: string): string {
  return current.trim() ? `${current}\n${reply}` : reply;
}
