import { day } from './worklist';
import type { PhotoSummary } from '../types/api';
import type { PhotoReview } from './photo-review';

export const WORKSPACE_TABS = ['photos', 'routine', 'check-ins', 'messages', 'history'] as const;
export type WorkspaceTab = (typeof WORKSPACE_TABS)[number];
export const TAB_LABEL: Record<WorkspaceTab, string> = {
  photos: 'Photos',
  routine: 'Routine',
  'check-ins': 'Check-ins',
  messages: 'Messages',
  history: 'History',
};

export function workspaceTab(params: { get(name: string): string | null }): WorkspaceTab {
  return WORKSPACE_TABS.find(tab => tab === params.get('tab')) ?? 'photos';
}

/** Workspace URLs carry only the worklist context, the tab and message reference keys; never a return URL. */
export function workspaceHref(patientId: string, listQuery: string, tab: WorkspaceTab, extra: Record<string, string> = {}) {
  const query = new URLSearchParams(listQuery);
  if (tab !== 'photos') query.set('tab', tab);
  for (const [key, value] of Object.entries(extra)) query.set(key, value);
  return `/patients/${encodeURIComponent(patientId)}?${query}`;
}

/** `Since 02 MAR 2026`, set in mono uppercase by `.meta-mono`. */
export function sinceLabel(iso: string | undefined) {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? `Since ${day(iso)} ${date.getFullYear()}` : '';
}

export const firstName = (name: string | null | undefined) => (name ?? '').trim().split(/\s+/)[0] ?? '';

const byCapture = (a: PhotoSummary, b: PhotoSummary) => Date.parse(a.captureDate) - Date.parse(b.captureDate) || a.id.localeCompare(b.id);

/** Default comparison: the newest photo on the page and the one before it. */
export function defaultPair(photos: PhotoSummary[]) {
  return [...photos].sort(byCapture).slice(-2).map(photo => photo.id);
}

/** Selected photos in capture order, older on the left. */
export function comparePanes(photos: PhotoSummary[], selected: string[]) {
  return photos.filter(photo => selected.includes(photo.id)).sort(byCapture);
}

/** A reply is about the newer photo in the comparison. */
export function replyTarget(photos: PhotoSummary[], selected: string[]): PhotoSummary | null {
  const panes = comparePanes(photos, selected);
  return panes[panes.length - 1] ?? null;
}

export function reviewWords(review?: PhotoReview) {
  return review ? `Reviewed · ${review.reviewerName} · ${day(review.reviewedAt)}` : 'Not reviewed';
}
