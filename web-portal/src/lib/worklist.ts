import { APIError } from '@/types/api';
import type { WorklistAdherence, WorklistDayState, WorklistFilter, WorklistQuery, WorklistResponse, WorklistRow, WorklistSummary } from '@/types/api';

export const ADHERENCE_THRESHOLD = 60;
export const FILTER_LABEL: Record<WorklistFilter, string> = { 'needs-review': 'Needs review', all: 'All patients', flagged: 'Flagged' };
export const SORT_NOTE: Record<WorklistFilter, string> = {
  'needs-review': 'Sorted by oldest unreviewed upload',
  all: 'Most recently updated first',
  flagged: 'Oldest open report first',
};

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pad = (value: number) => String(value).padStart(2, '0');

export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
/** The clinician's calendar date, which anchors the 14-day window. */
export const localDateOf = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const clock = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
/** `02 SEP` */
export const day = (iso: string) => { const date = new Date(iso); return `${pad(date.getDate())} ${MONTHS[date.getMonth()]}`; };
/** `02 SEP · 07:04` */
export const stamp = (iso: string) => `${day(iso)} · ${clock(new Date(iso))}`;
/** `Wednesday 16 September · 08:40` (rendered as an uppercase eyebrow) */
export const longDate = (date: Date) => `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTH_NAMES[date.getMonth()]} · ${clock(date)}`;

const hoursSince = (iso: string, now: Date) => Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 3_600_000));
/** Mono waiting time: `<1H`, `6H`, `4D`. */
export function waited(iso: string, now: Date) {
  const hours = hoursSince(iso, now);
  return hours < 1 ? '<1H' : hours < 24 ? `${hours}H` : `${Math.floor(hours / 24)}D`;
}
export function waitedWords(iso: string, now: Date) {
  const hours = hoursSince(iso, now);
  return hours < 1 ? 'under an hour' : hours < 24 ? plural(hours, 'hour') : plural(Math.floor(hours / 24), 'day');
}

export type SummaryTile = { label: string; value: number | null; note: string; unread: boolean };
export function summaryTiles(summary: WorklistSummary | null, now: Date): SummaryTile[] {
  if (!summary) {
    return ['Photos to review', 'Unread messages', 'Check-ins submitted', `Adherence under ${ADHERENCE_THRESHOLD}%`]
      .map((label) => ({ label, value: null, note: '', unread: false }));
  }
  const { photosToReview: photos, unreadMessages: unread, checkInsSubmitted: checkIns, adherenceUnderThreshold: adherence } = summary;
  return [
    { label: 'Photos to review', value: photos.count, note: photos.oldestUploadAt ? `Oldest waiting ${waitedWords(photos.oldestUploadAt, now)}` : 'None waiting', unread: false },
    { label: 'Unread messages', value: unread.count, note: unread.patients ? plural(unread.patients, 'patient') : 'None unread', unread: unread.count > 0 },
    { label: 'Check-ins submitted', value: checkIns.count, note: `Last ${checkIns.days} days`, unread: false },
    { label: `Adherence under ${adherence.threshold}%`, value: adherence.count, note: `${adherence.windowDays}-day window`, unread: false },
  ];
}

/** Rows waiting on the clinician get the §4.9 attention bar. */
export const isWaiting = (row: WorklistRow) => row.photos.unreviewedCount > 0 || row.unreadMessages > 0;

export function rowAction(filter: WorklistFilter, row: WorklistRow, context: string) {
  const href = `/patients/${encodeURIComponent(row.patientId)}?${context}`;
  const name = row.name || 'patient';
  if (filter === 'needs-review') return { label: 'Review photos', href, ariaLabel: `Review photos for ${name}` };
  if (filter === 'flagged') return { label: 'Open report', href: `${href}#urgent`, ariaLabel: `Open urgent report for ${name}` };
  return { label: 'Open patient', href, ariaLabel: `Open ${name}` };
}

/** Latest activity in words. The worklist never shows message, answer or report text. */
export function activity(row: WorklistRow): string[] {
  const lines: string[] = [];
  const reports = row.urgent.open + row.urgent.acknowledged;
  if (reports) {
    lines.push([reports === 1 ? 'Urgent report' : 'Urgent reports', row.urgent.open ? `${row.urgent.open} open` : '', row.urgent.acknowledged ? `${row.urgent.acknowledged} seen` : ''].filter(Boolean).join(' · '));
  }
  if (row.unreadMessages) lines.push(plural(row.unreadMessages, 'unread message'));
  if (row.latestCheckInAt) lines.push(`Check-in · ${stamp(row.latestCheckInAt)}`);
  return lines.length ? lines : ['No new activity'];
}

/** Clinician-side figure (`79% / 14d`); patients never see a percentage. */
export function adherenceText(adherence: WorklistAdherence | null) {
  if (!adherence) return 'No active routine';
  if (adherence.percent === null) return 'No days recorded yet';
  return `${adherence.percent}% / ${adherence.days.length}d`;
}

/** Spec §4.6: both = full ink bar, one = 70%, none = 40% sunk (with an ink hairline so it holds on rail); uncounted = hairline. */
export function dayBar(state: WorklistDayState) {
  if (state === null) return 'block h-px w-1.5 bg-rule';
  if (state === 0) return 'block h-[40%] w-1.5 border border-ink/30 bg-sunk';
  return state === 2 ? 'block h-full w-1.5 bg-ink' : 'block h-[70%] w-1.5 bg-ink';
}

export function emptyCopy(filter: WorklistFilter, search: string): { title: string; body: string; action: 'clear-search' | 'show-all' | null } {
  if (search.trim()) return { title: 'No patients match this name', body: 'Check the spelling or clear the search.', action: 'clear-search' };
  if (filter === 'needs-review') return { title: 'No photos waiting', body: 'Shared photos appear here until you mark them reviewed.', action: 'show-all' };
  if (filter === 'flagged') return { title: 'No urgent reports', body: 'Nothing your patients have reported is waiting.', action: null };
  return { title: 'No assigned patients yet', body: 'Patients assigned to you will appear here.', action: null };
}

export type WorklistState = {
  filter: WorklistFilter;
  page: number;
  search: string;
  status: 'idle' | 'loading' | 'ready' | 'error' | 'unsupported';
  result: WorklistResponse | null;
  checkedAt: Date | null;
};
type Loader = (query: WorklistQuery) => Promise<WorklistResponse>;

export class WorklistController {
  private state: WorklistState = { filter: 'needs-review', page: 1, search: '', status: 'idle', result: null, checkedAt: null };
  private listeners = new Set<() => void>();
  private request = 0;
  private disposed = false;
  constructor(private readonly loader: Loader, private readonly now: () => Date = () => new Date()) {}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(next: WorklistState) { if (!this.disposed) { this.state = next; this.listeners.forEach((listener) => listener()); } }
  async load(page = this.state.page) {
    if (this.state.status === 'unsupported') return;
    const request = ++this.request;
    const { filter, search } = this.state;
    // The previous result stays on screen while loading so the layout does not jump.
    this.publish({ ...this.state, page, status: 'loading' });
    try {
      const result = await this.loader({ filter, page, search, localDate: localDateOf(this.now()) });
      if (request !== this.request || this.disposed) return;
      this.publish({ ...this.state, page: result.pagination.page, result, status: 'ready', checkedAt: this.now() });
    } catch (cause) {
      if (request !== this.request || this.disposed) return;
      // An API deployed before GET /worklist answers 404: fall back to the separate queue and list.
      this.publish({ ...this.state, status: cause instanceof APIError && cause.status === 404 ? 'unsupported' : 'error' });
    }
  }
  restore(filter: WorklistFilter, page: number, search: string) { this.publish({ ...this.state, filter, page, search }); return this.load(page); }
  setFilter(filter: WorklistFilter) { if (filter === this.state.filter) return Promise.resolve(); this.publish({ ...this.state, filter, page: 1 }); return this.load(1); }
  search(search: string) { this.publish({ ...this.state, search, page: 1 }); return this.load(1); }
  goToPage(page: number) { return this.load(page); }
  retry() { return this.load(); }
  // Effect cleanup retires its request; subscription cleanup owns listener removal.
  cancelPending() { this.request += 1; }
  dispose() { this.disposed = true; this.request += 1; this.listeners.clear(); }
}
