import { test } from 'node:test';
import assert from 'node:assert/strict';
import './env';
import { PrivateThumbnailController } from '../src/lib/private-thumbnail';
import { apiService, authStorage, supabase } from '../src/lib/api';
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { resolve, promise }; }
test('two-request limit; cancellation unblocks queue and late bytes never create URLs', async () => {
  const requests: { id: string; signal: AbortSignal; result: ReturnType<typeof deferred<Blob>> }[] = [];
  const made: string[] = [], revoked: string[] = [];
  const controller = new PrivateThumbnailController((id, signal) => {
    const result = deferred<Blob>(); requests.push({ id, signal: signal!, result }); return result.promise;
  }, { createObjectURL: () => { const url = `blob:${made.length}`; made.push(url); return url; }, revokeObjectURL: url => { revoked.push(url); } });
  controller.load(['a', 'b', 'c']); assert.deepEqual(requests.map(r => r.id), ['a', 'b']);
  controller.load(['d']); await tick();
  assert.equal(requests[0].signal.aborted, true); assert.equal(requests[1].signal.aborted, true);
  assert.equal(requests[2].id, 'd');
  requests[0].result.resolve(new Blob(['old'])); requests[1].result.resolve(new Blob(['old']));
  requests[2].result.resolve(new Blob(['new'])); await tick();
  assert.deepEqual(made, ['blob:0']); assert.equal(controller.snapshot().d.url, 'blob:0');
  controller.load(['e']); assert.deepEqual(revoked, ['blob:0']);
  controller.dispose(); requests[3].result.resolve(new Blob(['disposed'])); await tick();
  assert.deepEqual(made, ['blob:0']); controller.dispose(); assert.deepEqual(revoked, ['blob:0']);
});
test('all created URLs revoked once at refresh/dispose and failures are retryable', async () => {
  let fail = true; let count = 0; const revoked: string[] = [];
  const controller = new PrivateThumbnailController(async () => { if (fail) throw new Error('network'); return new Blob(['jpeg']); }, {
    createObjectURL: () => `blob:${++count}`, revokeObjectURL: url => { revoked.push(url); },
  });
  controller.load(['a', 'b', 'c']); await tick(); assert.equal(controller.snapshot().c.status, 'error');
  fail = false; controller.load(['a', 'b', 'c']); await tick();
  assert.equal(controller.snapshot().c.status, 'ready'); controller.dispose();
  assert.deepEqual(revoked, ['blob:1', 'blob:2', 'blob:3']);
});
test('blob transport guards token lookup, response and body across account changes and cancellation', async () => {
  const originalSession = supabase.auth.getSession, originalFetch = globalThis.fetch;
  authStorage.beginLogin();
  try {
    for (const stage of ['session', 'response', 'body', 'abort']) {
      const session = { access_token: 'synthetic-token-a', user: { id: 'A' } };
      apiService.acceptSession(session);
      const pause = deferred<any>(); const entered = deferred<void>(); const abort = new AbortController();
      let config: RequestInit | undefined;
      supabase.auth.getSession = async () => {
        if (stage === 'session') { entered.resolve(); return pause.promise; }
        return { data: { session }, error: null } as any;
      };
      globalThis.fetch = async (_url, options) => {
        config = options;
        if (stage === 'response') { entered.resolve(); return pause.promise; }
        return { ok: true, headers: new Headers({ 'content-type': 'image/jpeg' }), blob: async () => { entered.resolve(); return pause.promise; } } as Response;
      };
      const request = apiService.getPhotoThumbnail('photo', abort.signal);
      await entered.promise;
      if (stage === 'abort') abort.abort(); else apiService.acceptSession({ access_token: 'synthetic-token-b', user: { id: 'B' } });
      pause.resolve(stage === 'session' ? { data: { session }, error: null } : stage === 'response' ? new Response('secret') : new Blob(['secret']));
      await assert.rejects(request, stage === 'abort' ? /abort/i : /changed/);
      if (stage !== 'session') { assert.equal(config?.cache, 'no-store'); assert.equal(config?.referrerPolicy, 'no-referrer'); assert.equal(new Headers(config?.headers).get('authorization'), 'Bearer synthetic-token-a'); }
    }
  } finally { supabase.auth.getSession = originalSession; globalThis.fetch = originalFetch; }
});
test('aborting while session lookup is pending never sends a request', async () => {
  const originalSession = supabase.auth.getSession, originalFetch = globalThis.fetch;
  authStorage.beginLogin();
  const session = { access_token: 'synthetic-token-a', user: { id: 'A' } };
  apiService.acceptSession(session);
  const pause = deferred<any>(); let fetched = false;
  supabase.auth.getSession = () => pause.promise;
  globalThis.fetch = async () => { fetched = true; return new Response('jpeg'); };
  try {
    const abort = new AbortController();
    const request = apiService.getPhotoThumbnail('photo', abort.signal);
    abort.abort(); pause.resolve({ data: { session }, error: null });
    await assert.rejects(request, /abort/i);
    assert.equal(fetched, false);
  } finally { supabase.auth.getSession = originalSession; globalThis.fetch = originalFetch; }
});
