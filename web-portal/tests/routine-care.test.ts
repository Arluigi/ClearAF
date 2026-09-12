import test from 'node:test';
import assert from 'node:assert/strict';
import './env';
import { RoutineCareController } from '../src/lib/routine-care';
import { apiService, authStorage, supabase } from '../src/lib/api';
import { APIError } from '../src/types/api';

const morning = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  timeOfDay: 'morning' as const,
  version: 1,
  createdBy: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  createdAt: '2026-09-12T12:00:00.000Z',
  name: 'Original morning',
  isActive: true,
  steps: [{ title: 'Wash', instructions: 'Use water.' }],
};

const snapshot = { routines: [morning], completions: [] };
const emptyHistory = { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

test('lost-response retry preserves the draft and reuses the exact revision identity and body', async () => {
  const requests: Array<{ revisionId: string; body: unknown }> = [];
  let fail = true;
  const controller = new RoutineCareController({
    fetchSnapshot: async () => snapshot,
    saveRevision: async (_slot, revisionId, body) => {
      requests.push({ revisionId, body: structuredClone(body) });
      if (fail) throw new Error('connection lost after write');
      return { ...morning, id: revisionId, version: 2, name: 'Synthetic morning' };
    },
    fetchHistory: async () => emptyHistory,
    createRevisionId: () => '22222222-2222-4222-8222-222222222222',
  });

  await controller.load();
  controller.setName('morning', 'Synthetic morning');
  await controller.save('morning');
  assert.equal(controller.snapshot().slots.morning.draft.name, 'Synthetic morning');
  assert.equal(controller.snapshot().slots.morning.status, 'error');

  fail = false;
  await controller.retry('morning');
  assert.equal(requests.length, 2);
  assert.equal(requests[1].revisionId, requests[0].revisionId);
  assert.deepEqual(requests[1].body, requests[0].body);
  assert.equal(controller.snapshot().slots.morning.expectedRevisionId, requests[0].revisionId);
  assert.equal(controller.snapshot().slots.morning.status, 'ready');
});

test('a 409 locks the conflicted draft until reload replaces it with the latest revision', async () => {
  const latest = {
    ...morning,
    id: '33333333-3333-4333-8333-333333333333',
    version: 2,
    name: 'Externally edited morning',
  };
  let loaded = snapshot;
  const controller = new RoutineCareController({
    fetchSnapshot: async () => loaded,
    saveRevision: async () => { throw Object.assign(new Error('provider detail'), { status: 409 }); },
    fetchHistory: async () => emptyHistory,
    createRevisionId: () => '22222222-2222-4222-8222-222222222222',
  });

  await controller.load();
  controller.setName('morning', 'Clinician draft');
  await controller.save('morning');
  assert.equal(controller.snapshot().slots.morning.status, 'conflict');
  assert.match(controller.snapshot().slots.morning.error, /changed.*reload/i);
  controller.setName('morning', 'Must not reuse the conflicted ID');
  assert.equal(controller.snapshot().slots.morning.draft.name, 'Clinician draft');

  loaded = { routines: [latest], completions: [] };
  await controller.load();
  assert.equal(controller.snapshot().slots.morning.draft.name, 'Externally edited morning');
  assert.equal(controller.snapshot().slots.morning.expectedRevisionId, latest.id);
  assert.equal(controller.snapshot().slots.morning.status, 'ready');
});

test('patient replacement rejects a late routine snapshot from the prior controller lifecycle', async () => {
  const pending = deferred<typeof snapshot>();
  const controller = new RoutineCareController({
    fetchSnapshot: () => pending.promise,
    saveRevision: async () => morning,
    fetchHistory: async () => emptyHistory,
  });

  const load = controller.load();
  controller.cancel();
  pending.resolve(snapshot);
  await load;

  assert.equal(controller.snapshot().slots.morning.routine, null);
  assert.equal(controller.snapshot().slots.morning.expectedRevisionId, null);
});

test('patient replacement rejects a late save response from the prior controller lifecycle', async () => {
  const pending = deferred<typeof morning>();
  const controller = new RoutineCareController({
    fetchSnapshot: async () => snapshot,
    saveRevision: () => pending.promise,
    fetchHistory: async () => emptyHistory,
    createRevisionId: () => '22222222-2222-4222-8222-222222222222',
  });
  await controller.load();
  controller.setName('morning', 'Prior patient draft');

  const save = controller.save('morning');
  controller.cancel();
  pending.resolve({ ...morning, id: '22222222-2222-4222-8222-222222222222', version: 2 });
  await save;

  assert.equal(controller.snapshot().slots.morning.expectedRevisionId, morning.id);
  assert.equal(controller.snapshot().slots.morning.draft.name, 'Prior patient draft');
});

test('history pagination renders each completion with its immutable saved revision', async () => {
  const completedRevision = { ...morning, name: 'Completed version name' };
  const currentRevision = {
    ...morning,
    id: '33333333-3333-4333-8333-333333333333',
    version: 2,
    name: 'Current version name',
  };
  const completion = {
    id: '44444444-4444-4444-8444-444444444444',
    userId: morning.userId,
    revisionId: morning.id,
    completedAt: '2026-09-11T23:30:00.000Z',
    localDate: '2026-09-11',
    timeZone: 'America/Chicago',
    receivedAt: '2026-09-12T00:00:00.000Z',
    routine: completedRevision,
  };
  const controller = new RoutineCareController({
    fetchSnapshot: async () => ({ routines: [currentRevision], completions: [] }),
    saveRevision: async () => currentRevision,
    fetchHistory: async page => ({
      data: page === 1 ? [completion] : [],
      pagination: { page, limit: 1, total: 1, totalPages: 2 },
    }),
  });

  await controller.load();
  await controller.loadHistory(1);
  assert.equal(controller.snapshot().slots.morning.routine?.version, 2);
  assert.equal(controller.snapshot().history.entries[0].routine.name, 'Completed version name');
  assert.equal(controller.snapshot().history.entries[0].routine.version, 1);
  assert.equal(controller.snapshot().history.total, 1);
  assert.equal(controller.snapshot().history.totalPages, 2);

  await controller.loadHistory(2);
  assert.deepEqual(controller.snapshot().history.entries, []);
  assert.equal(controller.snapshot().history.page, 2);
});

test('routine API failures retain a typed HTTP status for conflict handling', async () => {
  const getSession = supabase.auth.getSession;
  const originalFetch = globalThis.fetch;
  const session = { access_token: 'synthetic-token', user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } };
  authStorage.beginLogin();
  apiService.acceptSession(session);
  supabase.auth.getSession = async () => ({ data: { session }, error: null }) as Awaited<ReturnType<typeof getSession>>;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Routine changed', code: 'ROUTINE_CONFLICT' }), {
    status: 409,
    headers: { 'content-type': 'application/json' },
  });
  try {
    await assert.rejects(
      apiService.savePatientRoutine(morning.userId, 'morning', '22222222-2222-4222-8222-222222222222', {
        expectedRevisionId: morning.id,
        name: morning.name,
        isActive: morning.isActive,
        steps: morning.steps,
      }),
      error => error instanceof APIError && error.status === 409 && error.code === 'ROUTINE_CONFLICT',
    );
  } finally {
    supabase.auth.getSession = getSession;
    globalThis.fetch = originalFetch;
  }
});

test('step editing preserves clinician order and sends only title and instructions', async () => {
  let savedBody: unknown;
  const controller = new RoutineCareController({
    fetchSnapshot: async () => snapshot,
    saveRevision: async (_slot, revisionId, body) => {
      savedBody = structuredClone(body);
      return { ...morning, id: revisionId, version: 2, steps: body.steps };
    },
    fetchHistory: async () => emptyHistory,
    createRevisionId: () => '22222222-2222-4222-8222-222222222222',
  });
  await controller.load();

  controller.addStep('morning');
  controller.setStepTitle('morning', 1, 'Moisturize');
  controller.setStepInstructions('morning', 1, 'Apply synthetic moisturizer.');
  controller.moveStep('morning', 1, 0);
  controller.addStep('morning');
  controller.removeStep('morning', 2);
  await controller.save('morning');

  assert.deepEqual(controller.snapshot().slots.morning.draft.steps, [
    { title: 'Moisturize', instructions: 'Apply synthetic moisturizer.' },
    { title: 'Wash', instructions: 'Use water.' },
  ]);
  assert.deepEqual(savedBody, {
    expectedRevisionId: morning.id,
    name: morning.name,
    isActive: true,
    steps: [
      { title: 'Moisturize', instructions: 'Apply synthetic moisturizer.' },
      { title: 'Wash', instructions: 'Use water.' },
    ],
  });
});

test('active routines require a step while an archive revision may keep an empty step list', async () => {
  const requests: Array<{ isActive: boolean; steps: unknown[] }> = [];
  const controller = new RoutineCareController({
    fetchSnapshot: async () => snapshot,
    saveRevision: async (_slot, revisionId, body) => {
      requests.push({ isActive: body.isActive, steps: body.steps });
      return { ...morning, id: revisionId, version: 2, isActive: body.isActive, steps: body.steps };
    },
    fetchHistory: async () => emptyHistory,
    createRevisionId: () => '22222222-2222-4222-8222-222222222222',
  });
  await controller.load();
  controller.removeStep('morning', 0);

  await controller.save('morning');
  assert.equal(requests.length, 0);
  assert.match(controller.snapshot().slots.morning.error, /active.*step/i);

  controller.setActive('morning', false);
  await controller.save('morning');
  assert.deepEqual(requests, [{ isActive: false, steps: [] }]);
  assert.equal(controller.snapshot().slots.morning.routine?.isActive, false);
});

test('account invalidation rejects an old routine facade before it can start another patient request', () => {
  authStorage.beginLogin();
  apiService.acceptSession({ access_token: 'token-a', user: { id: 'account-a' } });
  const oldFacade = apiService.scoped();
  apiService.acceptSession({ access_token: 'token-b', user: { id: 'account-b' } });

  assert.throws(
    () => oldFacade.getPatientRoutines(morning.userId, '2026-09-12'),
    /account changed/i,
  );
});

test('account invalidation while awaiting an HTTP error body rejects the stale error response', async () => {
  await new Promise<void>(resolve => setImmediate(resolve));
  const getSession = supabase.auth.getSession;
  const originalFetch = globalThis.fetch;
  const body = deferred<{ error: string; code: string }>();
  const session = { access_token: 'token-a', user: { id: 'account-a' } };
  let bodyStarted!: () => void;
  const started = new Promise<void>(resolve => { bodyStarted = resolve; });
  authStorage.beginLogin();
  apiService.acceptSession(session);
  supabase.auth.getSession = async () => ({ data: { session }, error: null }) as Awaited<ReturnType<typeof getSession>>;
  globalThis.fetch = async () => ({
    ok: false,
    status: 409,
    statusText: 'Conflict',
    json: () => { bodyStarted(); return body.promise; },
  }) as Response;
  try {
    const request = apiService.getPatientRoutines(morning.userId, '2026-09-12');
    const rejected = assert.rejects(request, /account changed/i);
    await started;
    apiService.acceptSession({ access_token: 'token-b', user: { id: 'account-b' } });
    body.resolve({ error: 'stale private detail', code: 'ROUTINE_CONFLICT' });
    await rejected;
  } finally {
    supabase.auth.getSession = getSession;
    globalThis.fetch = originalFetch;
  }
});

test('routine facade targets clinician snapshot and bounded history endpoints', async () => {
  await new Promise<void>(resolve => setImmediate(resolve));
  const getSession = supabase.auth.getSession;
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  const session = { access_token: 'synthetic-token', user: { id: 'account-a' } };
  authStorage.beginLogin();
  apiService.acceptSession(session);
  supabase.auth.getSession = async () => ({ data: { session }, error: null }) as Awaited<ReturnType<typeof getSession>>;
  globalThis.fetch = async input => {
    const url = String(input);
    requests.push(url);
    return new Response(JSON.stringify(url.includes('/completions?') ? emptyHistory : snapshot), { status: 200 });
  };
  try {
    await apiService.getPatientRoutines(morning.userId, '2026-09-12');
    await apiService.getPatientRoutineCompletions(morning.userId, 2, 20);
    assert.deepEqual(requests.map(url => new URL(url).pathname + new URL(url).search), [
      `/api/routines/patients/${morning.userId}?localDate=2026-09-12`,
      `/api/routines/patients/${morning.userId}/completions?page=2&limit=20`,
    ]);
  } finally {
    supabase.auth.getSession = getSession;
    globalThis.fetch = originalFetch;
  }
});

test('late history cannot replace the page selected for the current patient', async () => {
  const olderRequest = deferred<typeof emptyHistory>();
  const currentPage = {
    data: [{
      id: '55555555-5555-4555-8555-555555555555',
      userId: morning.userId,
      revisionId: morning.id,
      completedAt: '2026-09-10T12:00:00.000Z',
      localDate: '2026-09-10',
      timeZone: 'UTC',
      receivedAt: '2026-09-10T12:00:01.000Z',
      routine: morning,
    }],
    pagination: { page: 2, limit: 20, total: 21, totalPages: 2 },
  };
  const controller = new RoutineCareController({
    fetchSnapshot: async () => snapshot,
    saveRevision: async () => morning,
    fetchHistory: page => page === 1 ? olderRequest.promise : Promise.resolve(currentPage),
  });

  const oldPage = controller.loadHistory(1);
  await controller.loadHistory(2);
  olderRequest.resolve(emptyHistory);
  await oldPage;
  assert.equal(controller.snapshot().history.page, 2);
  assert.equal(controller.snapshot().history.entries[0].id, currentPage.data[0].id);
});

test('late assignment refresh cannot replace the latest loaded revision', async () => {
  const first = deferred<typeof snapshot>();
  const latest = {
    ...morning,
    id: '66666666-6666-4666-8666-666666666666',
    version: 2,
    name: 'Latest assignment',
  };
  let requests = 0;
  const controller = new RoutineCareController({
    fetchSnapshot: () => ++requests === 1 ? first.promise : Promise.resolve({ routines: [latest], completions: [] }),
    saveRevision: async () => latest,
    fetchHistory: async () => emptyHistory,
  });

  const oldLoad = controller.load();
  await controller.load();
  first.resolve(snapshot);
  await oldLoad;
  assert.equal(controller.snapshot().slots.morning.routine?.id, latest.id);
  assert.equal(controller.snapshot().slots.morning.routine?.version, 2);
});

test('duplicate save actions serialize one in-flight request per routine slot', async () => {
  const response = deferred<typeof morning>();
  let requests = 0;
  const controller = new RoutineCareController({
    fetchSnapshot: async () => snapshot,
    saveRevision: () => { requests += 1; return response.promise; },
    fetchHistory: async () => emptyHistory,
    createRevisionId: () => '22222222-2222-4222-8222-222222222222',
  });
  await controller.load();
  controller.setName('morning', 'Serialized edit');

  const first = controller.save('morning');
  const second = controller.save('morning');
  assert.equal(first, second);
  assert.equal(requests, 1);
  response.resolve({ ...morning, id: '22222222-2222-4222-8222-222222222222', version: 2, name: 'Serialized edit' });
  await Promise.all([first, second]);
  assert.equal(requests, 1);
});
