import { v5 as uuidv5 } from 'uuid';

export const MAX_CAPTURE_BYTES = 10 * 1024 * 1024;

export interface CaptureIdentity {
  id: string;
  storagePath: string;
}

export function captureIdentity(ownerId: string, captureId: string): CaptureIdentity {
  const id = uuidv5(captureId.toLowerCase(), ownerId.toLowerCase());
  return { id, storagePath: `${ownerId.toLowerCase()}/${id}.jpg` };
}

export function isMissingStorageObject(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const storageError = error as { status?: number; statusCode?: string };
  return storageError.status === 404 || storageError.statusCode === '404';
}

export function isValidCaptureObject(object: unknown): object is { size: number; contentType: 'image/jpeg' } {
  if (!object || typeof object !== 'object') return false;
  const info = object as { size?: unknown; contentType?: unknown };
  return typeof info.size === 'number'
    && Number.isFinite(info.size)
    && info.size >= 1
    && info.size <= MAX_CAPTURE_BYTES
    && info.contentType === 'image/jpeg';
}
