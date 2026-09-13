import sharp from 'sharp';
import { prisma } from '../config/database';
import { supabaseAdmin, PHOTO_BUCKET } from '../config/supabase';
import { ownedPhotoPath } from './photoAccess';

export const THUMBNAIL_LIMITS = {
  inputBytes: 10 * 1024 * 1024,
  pixels: 64_000_000,
  timeoutMs: 15_000,
  jobs: 2,
  cacheBytes: 16 * 1024 * 1024,
  ttlMs: 60_000,
};

type Actor = { id: string; userType: string };
type StoredPhoto = { id: string; userId: string; photoUrl: string };
type Dependencies = {
  findPhoto: (id: string) => Promise<StoredPhoto | null>;
  isAssigned: (ownerId: string, clinicianId: string) => Promise<boolean>;
  sign: (path: string) => Promise<string>;
  fetch: typeof fetch;
};
export class ThumbnailError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const dependencies: Dependencies = {
  findPhoto: id => prisma.skinPhoto.findUnique({ where: { id }, select: { id: true, userId: true, photoUrl: true } }),
  isAssigned: async (id, dermatologistId) => !!await prisma.user.findUnique({ where: { id, dermatologistId }, select: { id: true } }),
  sign: async path => {
    const { data, error } = await supabaseAdmin.storage.from(PHOTO_BUCKET).createSignedUrl(path, 60);
    if (error || !data?.signedUrl) throw new ThumbnailError(502, 'Unable to load photo. Please retry.');
    return data.signedUrl;
  },
  fetch: (input, init) => fetch(input, init),
};

/** The shared authorization boundary for both thumbnail and original access. */
export async function authorizedPhotoPath(id: string, actor: Actor, deps = dependencies): Promise<string> {
  const photo = await deps.findPhoto(id);
  if (!photo || !((actor.userType === 'patient' && actor.id === photo.userId)
    || (actor.userType === 'dermatologist' && await deps.isAssigned(photo.userId, actor.id)))) {
    throw new ThumbnailError(404, 'Photo not found');
  }
  try { return ownedPhotoPath(photo.photoUrl, photo.userId); }
  catch { throw new ThumbnailError(422, 'Photo is unavailable.'); }
}

export async function photoOriginal(id: string, actor: Actor) {
  return { photoUrl: await dependencies.sign(await authorizedPhotoPath(id, actor)) };
}

/** Process-local, byte-bounded LRU. No derivative is persisted in Storage or SQL. */
export class PhotoThumbnailService {
  private cache = new Map<string, { bytes: Buffer; expires: number }>();
  private cacheSize = 0;
  private active = 0;
  private limits;
  private now: () => number;

  constructor(private deps = dependencies, options: Partial<typeof THUMBNAIL_LIMITS> & { now?: () => number } = {}) {
    this.limits = { ...THUMBNAIL_LIMITS, ...options };
    this.now = options.now ?? Date.now;
  }

  async get(id: string, actor: Actor): Promise<Buffer> {
    // Authorization and path ownership are never memoized, including for warm hits.
    const path = await authorizedPhotoPath(id, actor, this.deps);
    for (const [key, value] of this.cache) {
      if (value.expires <= this.now()) this.remove(key);
    }
    const cached = this.cache.get(path);
    if (cached) {
      this.cache.delete(path);
      this.cache.set(path, cached);
      return cached.bytes;
    }
    if (this.active >= this.limits.jobs) throw new ThumbnailError(503, 'Photos are busy. Please retry.');
    this.active++;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    // The response deadline must not retire actual upstream work. In particular,
    // the Storage SDK's signing request has no per-call AbortSignal support.
    // A timed-out signer keeps its slot until it settles; further misses fail fast.
    const job = this.generate(path, abort.signal).finally(() => { this.active--; });
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new ThumbnailError(504, 'Photo download timed out. Please retry.'));
        abort.abort();
      }, this.limits.timeoutMs);
    });
    try { return await Promise.race([job, timeout]); }
    finally { clearTimeout(timer!); abort.abort(); }
  }

  private async generate(path: string, signal: AbortSignal): Promise<Buffer> {
    const input = await this.download(path, signal);
    let bytes: Buffer;
    try {
      const image = sharp(input, { limitInputPixels: this.limits.pixels, failOn: 'warning' });
      const info = await image.metadata();
      if (!['jpeg', 'png', 'webp', 'heif'].includes(info.format ?? '')) throw new Error('Unsupported photo');
      // Defaults strip all metadata. Rotation respects orientation before removal.
      bytes = await image.rotate().resize(400, 400, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 }).timeout({ seconds: 15 }).toBuffer();
    } catch { throw new ThumbnailError(422, 'Photo cannot be processed.'); }
    signal.throwIfAborted();
    if (bytes.length <= this.limits.cacheBytes) {
      this.remove(path);
      while (this.cacheSize + bytes.length > this.limits.cacheBytes) this.remove(this.cache.keys().next().value!);
      this.cache.set(path, { bytes, expires: this.now() + this.limits.ttlMs });
      this.cacheSize += bytes.length;
    }
    return bytes;
  }

  private remove(path: string) {
    const value = this.cache.get(path);
    if (value) { this.cacheSize -= value.bytes.length; this.cache.delete(path); }
  }

  private async download(path: string, signal: AbortSignal): Promise<Buffer> {
    try {
      const url = await this.deps.sign(path);
      signal.throwIfAborted();
      // The signer only receives a validated owned path; redirects cannot widen that trust.
      const response = await this.deps.fetch(url, { signal, redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer' });
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw new ThumbnailError(502, 'Unable to load photo. Please retry.');
      }
      const reader = response.body.getReader();
      let size = 0;
      const chunks: Buffer[] = [];
      const cancel = () => { void reader.cancel().catch(() => {}); };
      signal.addEventListener('abort', cancel, { once: true });
      try {
        if (Number(response.headers.get('content-length')) > this.limits.inputBytes) throw new ThumbnailError(422, 'Photo exceeds the size limit.');
        while (true) {
          signal.throwIfAborted();
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > this.limits.inputBytes) throw new ThumbnailError(422, 'Photo exceeds the size limit.');
          chunks.push(Buffer.from(part.value));
        }
        signal.throwIfAborted();
        if (!size) throw new ThumbnailError(422, 'Photo is empty.');
        return Buffer.concat(chunks, size);
      } finally {
        signal.removeEventListener('abort', cancel);
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    } catch (error) {
      if (error instanceof ThumbnailError) throw error;
      throw new ThumbnailError(502, 'Unable to load photo. Please retry.');
    }
  }
}

export const photoThumbnails = new PhotoThumbnailService();
