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

type TextSegment = { text: string; data: boolean };
// Time (07:04), day+month (15 SEP) and bare counts — the mono figures spec §4.9 wants set in
// font-data tabular-nums, leaving the surrounding words in the UI font. Order matters: the date/time
// alternatives are tried before the bare `\d+` so "15 SEP" and "07:04" match whole, not digit-by-digit.
const DATA_TOKEN = /\d{1,2}:\d{2}|\d{1,2} [A-Z]{3}\b|\d+/g;
/** Splits a line into plain-word and mono-data segments; see `DATA_TOKEN`. */
export function dataSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(DATA_TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) segments.push({ text: text.slice(last, index), data: false });
    segments.push({ text: match[0], data: true });
    last = index + match[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), data: false });
  return segments.length ? segments : [{ text, data: false }];
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
  // The exact query that produced `result` — kept separate from the live filter/page/search so a row
  // link (or anything else describing "what's on screen") follows the loaded data, not in-flight typing.
  query: WorklistQuery | null;
  checkedAt: Date | null;
};
type Loader = (query: WorklistQuery) => Promise<WorklistResponse>;
const SEARCH_DEBOUNCE_MS = 250;

export class WorklistController {
  private state: WorklistState = { filter: 'needs-review', page: 1, search: '', status: 'idle', result: null, query: null, checkedAt: null };
  private listeners = new Set<() => void>();
  private request = 0;
  private disposed = false;
  // The status to fall back to when a pending load is cancelled without a following load/restore —
  // see `cancelPending`.
  private lastSettledStatus: WorklistState['status'] = 'idle';
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private searchResolve: (() => void) | null = null;
  constructor(private readonly loader: Loader, private readonly now: () => Date = () => new Date()) {}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(next: WorklistState) { if (!this.disposed) { this.state = next; this.listeners.forEach((listener) => listener()); } }
  private clearSearchTimer() {
    if (this.searchTimer === null) return;
    clearTimeout(this.searchTimer);
    this.searchTimer = null;
    // A superseded debounce never gets a load, so its promise resolves as a no-op rather than hanging.
    this.searchResolve?.();
    this.searchResolve = null;
  }
  async load(page = this.state.page): Promise<void> {
    if (this.state.status === 'unsupported') return;
    const request = ++this.request;
    const { filter, search } = this.state;
    // The previous result stays on screen while loading so the layout does not jump.
    this.publish({ ...this.state, page, status: 'loading' });
    try {
      const query = { filter, page, search, localDate: localDateOf(this.now()) };
      const result = await this.loader(query);
      if (request !== this.request || this.disposed) return;
      // A page reviewed away from under the clinician (or opened straight from a stale link) comes
      // back with zero rows past the real last page: reload the last real page instead of publishing
      // a false empty state. `state.page` (and the URL, via the view's existing sync effect) follow.
      if (result.data.length === 0 && page > 1 && page > result.pagination.totalPages) {
        return this.load(Math.max(1, result.pagination.totalPages));
      }
      this.lastSettledStatus = 'ready';
      this.publish({ ...this.state, page: result.pagination.page, result, query: { ...query, page: result.pagination.page }, status: 'ready', checkedAt: this.now() });
    } catch (cause) {
      if (request !== this.request || this.disposed) return;
      // An API deployed before GET /worklist answers 404 with this exact catch-all body (server.ts);
      // anything else — including a route's own "not found" 404 — is a real error, not a missing route.
      const unsupported = cause instanceof APIError && cause.status === 404 && cause.message === 'Route not found';
      this.lastSettledStatus = unsupported ? 'unsupported' : 'error';
      this.publish({ ...this.state, status: this.lastSettledStatus });
    }
  }
  restore(filter: WorklistFilter, page: number, search: string) { this.publish({ ...this.state, filter, page, search }); return this.load(page); }
  setFilter(filter: WorklistFilter) { if (filter === this.state.filter) return Promise.resolve(); this.publish({ ...this.state, filter, page: 1 }); return this.load(1); }
  // Reloads debounce ~250ms so a fast typist doesn't fire one request per keystroke; the input itself
  // (state.search) updates immediately. Identical text is a no-op, mirroring setFilter.
  search(search: string) {
    if (search === this.state.search) return Promise.resolve();
    this.publish({ ...this.state, search, page: 1 });
    this.clearSearchTimer();
    return new Promise<void>((resolve) => {
      this.searchResolve = resolve;
      this.searchTimer = setTimeout(() => {
        this.searchTimer = null;
        this.searchResolve = null;
        void this.load(1).then(resolve);
      }, SEARCH_DEBOUNCE_MS);
    });
  }
  goToPage(page: number) { return this.load(page); }
  retry() { return this.load(); }
  // Effect cleanup retires its request and any pending debounce; subscription cleanup owns listener
  // removal. Not paired with a following load/restore (e.g. on unmount), so a load left mid-flight
  // would otherwise strand the state at 'loading' forever — instead it restores the last settled
  // status. A caller that does go on to load/restore/search simply overwrites this again.
  cancelPending() {
    this.request += 1;
    this.clearSearchTimer();
    if (this.state.status === 'loading') this.publish({ ...this.state, status: this.lastSettledStatus });
  }
  dispose() { this.disposed = true; this.request += 1; this.clearSearchTimer(); this.listeners.clear(); }
}
