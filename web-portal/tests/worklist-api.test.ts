import test from 'node:test';
import assert from 'node:assert/strict';
import './env';
import { apiService, authStorage, supabase } from '../src/lib/api';

test('worklist reads use one bounded clinician endpoint through the session-scoped facade', async () => {
  await new Promise<void>((resolve) => setImmediate(resolve));
  const getSession = supabase.auth.getSession;
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  const session = { access_token: 'synthetic-token', user: { id: 'account-a' } };
  authStorage.beginLogin();
  apiService.acceptSession(session);
  supabase.auth.getSession = async () => ({ data: { session }, error: null }) as Awaited<ReturnType<typeof getSession>>;
  globalThis.fetch = async (input) => { requests.push(String(input)); return new Response('{}', { status: 200 }); };
  try {
    const api = apiService.scoped();
    await api.getWorklist({ filter: 'flagged', page: 2, search: '  Ada ', localDate: '2026-09-16' });
    await api.getWorklist({ filter: 'needs-review', page: 1, search: '', localDate: '2026-09-16' });
    assert.deepEqual(requests.map((url) => new URL(url).pathname + new URL(url).search), [
      '/api/worklist?filter=flagged&page=2&limit=20&localDate=2026-09-16&search=Ada',
      '/api/worklist?filter=needs-review&page=1&limit=20&localDate=2026-09-16',
    ]);
    apiService.acceptSession({ access_token: 'other', user: { id: 'account-b' } });
    assert.throws(() => api.getWorklist({ filter: 'all', page: 1, search: '', localDate: '2026-09-16' }));
    assert.equal(requests.length, 2);
  } finally {
    supabase.auth.getSession = getSession;
    globalThis.fetch = originalFetch;
  }
});
