import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_URL = 'https://security-test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'synthetic-anon';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-service';
const { PhotoThumbnailService, THUMBNAIL_LIMITS } = require('../src/services/photoThumbnail');
const sharp = require('sharp');
const owner = '11111111-1111-4111-8111-111111111111';
const actor = { id: owner, userType: 'patient' };
const photo = { id: 'photo', userId: owner, photoUrl: `${owner}/image.jpg` };
const jpeg = () => sharp({ create: { width: 800, height: 600, channels: 3, background: 'red' } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
function fixture(options = {}, overrides = {}) {
  let downloads = 0;
  const deps = {
    findPhoto: async () => ({ ...photo }), isAssigned: async () => true,
    sign: async () => 'https://security-test.supabase.co/trusted',
    fetch: async () => { downloads++; return new Response(await jpeg()); }, ...overrides,
  };
  return { service: new PhotoThumbnailService(deps, options), deps, downloads: () => downloads };
}
test('bounds and JPEG dimensions/EXIF removal/no enlargement', async () => {
  assert.deepEqual(THUMBNAIL_LIMITS, { inputBytes: 10 * 1024 * 1024, pixels: 64_000_000, timeoutMs: 15_000, jobs: 2, cacheBytes: 16 * 1024 * 1024, ttlMs: 60_000 });
  const info = await sharp(await fixture().service.get('photo', actor)).metadata();
  assert.ok(info.width <= 400 && info.height <= 400);
  assert.equal(info.format, 'jpeg'); assert.equal(info.exif, undefined);
  const small = fixture({}, { fetch: async () => new Response(await sharp({ create: { width: 20, height: 10, channels: 3, background: 'red' } }).png().toBuffer()) });
  const tiny = await sharp(await small.service.get('photo', actor)).metadata();
  assert.equal(tiny.width, 20); assert.equal(tiny.height, 10);
});
test('every cache hit rechecks owner/current assignment and trusted owned path', async () => {
  const f = fixture(); await f.service.get('photo', actor);
  await f.service.get('photo', { id: 'doctor', userType: 'dermatologist' }); assert.equal(f.downloads(), 1);
  f.deps.isAssigned = async () => false;
  await assert.rejects(f.service.get('photo', { id: 'doctor', userType: 'dermatologist' }), { status: 404 });
  await assert.rejects(f.service.get('photo', { id: 'foreign', userType: 'patient' }), { status: 404 });
  f.deps.findPhoto = async () => ({ ...photo, photoUrl: 'https://attacker.invalid/image.jpg' });
  await assert.rejects(f.service.get('photo', actor)); assert.equal(f.downloads(), 1);
});
test('stream bytes bounded with absent or false Content-Length', async () => {
  for (const headers of [{}, { 'Content-Length': '1' }, { 'Content-Length': String(11 * 1024 * 1024) }]) {
    let cancelled = false;
    const f = fixture({}, { fetch: async () => new Response(new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(1024 * 1024)); }, cancel() { cancelled = true; } }), { headers }) });
    await assert.rejects(f.service.get('photo', actor), { status: 422 }); assert.equal(cancelled, true);
  }
});
test('malformed and oversized pixel images fail then generation retries', async () => {
  const f = fixture({}, { fetch: async () => new Response('not an image') });
  await assert.rejects(f.service.get('photo', actor), { status: 422 });
  f.deps.fetch = async () => new Response(await sharp({ create: { width: 8001, height: 8000, channels: 3, background: 'white' } }).png().toBuffer());
  await assert.rejects(f.service.get('photo', actor), { status: 422 });
  f.deps.fetch = async () => new Response(await jpeg()); assert.ok((await f.service.get('photo', actor)).length > 0);
});
test('stalled upstream aborts on timeout and releases capacity', async () => {
  let aborted = false;
  const f = fixture({ timeoutMs: 20 }, { fetch: async (_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
    options.signal!.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); });
  }) });
  await assert.rejects(f.service.get('photo', actor), { status: 504 }); assert.equal(aborted, true);
  const recoveredImage = await jpeg();
  f.deps.fetch = async () => new Response(recoveredImage); assert.ok((await f.service.get('photo', actor)).length > 0);
});
test('two active uncached jobs fail fast on overload and recover', async () => {
  const resolvers: ((r: Response) => void)[] = [];
  const f = fixture({}, { fetch: () => new Promise(resolve => resolvers.push(resolve)) });
  const first = f.service.get('1', actor), second = f.service.get('2', actor);
  await new Promise(resolve => setImmediate(resolve)); await assert.rejects(f.service.get('3', actor), { status: 503 });
  resolvers.forEach(resolve => resolve(new Response('bad')));
  await Promise.all([assert.rejects(first), assert.rejects(second)]);
  f.deps.fetch = async () => new Response(await jpeg()); assert.ok((await f.service.get('3', actor)).length > 0);
});
test('TTL and LRU byte budget evict cached bytes', async () => {
  let now = 0;
  const bytes = await fixture().service.get('photo', actor);
  const f = fixture({ cacheBytes: bytes.length * 2, ttlMs: 60, now: () => now }, { findPhoto: async (id: string) => ({ ...photo, id, photoUrl: `${owner}/${id}.jpg` }) });
  await f.service.get('a', actor); await f.service.get('b', actor); await f.service.get('a', actor);
  await f.service.get('c', actor); await f.service.get('b', actor); assert.equal(f.downloads(), 4);
  now = 61; await f.service.get('b', actor); assert.equal(f.downloads(), 5);
});
