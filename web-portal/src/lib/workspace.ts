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

export function consentReceipts(consents: import('../types/api').LaunchConsent[]) {
  const keys = ['telehealth','medication','privacy_notice','subscription_terms'] as const;
  return keys.map(key => {
    const receipt=consents.find(item=>item.key===key);
    return {key,accepted:!!receipt?.acceptedAt,text:receipt ? `${receipt.title} · ${receipt.versionLabel} (v${receipt.version}) · ${receipt.acceptedAt || 'Not accepted'}` : `${key.replaceAll('_',' ')} · Missing consent`};
  });
}
export function intakeAnswer(value:unknown):string {
  if (value===null) return 'Not applicable';
  if (value===undefined) return 'Not answered';
  if (typeof value==='boolean') return value ? 'Yes' : 'No';
  if (typeof value==='string') return value.trim() ? value.replaceAll('_',' ') : 'Blank';
  if (Array.isArray(value)) return value.length ? value.map(intakeAnswer).join(', ') : 'None selected';
  if (typeof value==='object') return Object.entries(value).map(([key,answer])=>key==='none' && answer===true ? 'None' : `${key.replaceAll('_',' ')}: ${intakeAnswer(answer)}`).join('; ');
  return String(value);
}
/** Submitted snapshots are validated for full intake completeness by the server. These are UI prerequisites only. */
export function launchApprovalBlock(enrollment: import('../types/api').LaunchEnrollmentResponse):string|null {
  const record=enrollment.case;
  if (record.identity?.status!=='approved') return 'Manual identity approval is required.';
  if (!record.identity.attestedInNC) return 'Current affirmative NC attestation is required.';
  if (consentReceipts(enrollment.consents).some(receipt=>!receipt.accepted)) return 'All four consent receipts are required.';
  if (record.status!=='submitted') return 'A complete submitted package is required.';
  if (!record.photoSet || record.photoSet.requiredSlots.some(slot=>!record.photoSet!.items.some(item=>item.slot===slot))) return 'The required photo set is incomplete.';
  if (!record.destination) return 'A destination is required.';
  if (enrollment.membership?.status!=='paid_pending_review') return 'Confirmed payment pending review is required.';
  return null;
}
