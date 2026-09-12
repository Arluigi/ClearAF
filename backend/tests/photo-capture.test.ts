import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Module from 'node:module';

const OWNER_A = '11111111-1111-4111-8111-111111111111';
const OWNER_B = '22222222-2222-4222-8222-222222222222';
const CLINICIAN = '33333333-3333-4333-8333-333333333333';
const CAPTURE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PHOTO_A = '09ed5bf5-248c-57f2-9949-115cb1fa52ce';
const PHOTO_B = 'c522cbe2-0127-5746-9841-97d29ad5fef1';
const PATH_A = `${OWNER_A}/${PHOTO_A}.jpg`;
const PATH_B = `${OWNER_B}/${PHOTO_B}.jpg`;
const ORIGINAL_DATE = '2026-07-04T15:16:17.000Z';

process.env.SUPABASE_URL = 'https://capture-test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'synthetic-anon';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-service';

type StoredObject = { size: number; contentType: string };

let photos: any[] = [];
let objects = new Map<string, StoredObject>();
let uploadAuthorizations: Array<{ path: string; options: unknown }> = [];
let downloadAuthorizations: string[] = [];
let infoRequests: string[] = [];
let userUpdates: any[] = [];
let createCalls = 0;
let forceInfoOutage = false;
let concurrentCreateBarrier = false;
let releaseFirstCreate: (() => void) | undefined;

function matches(row: any, where: any): boolean {
  return Object.entries(where).every(([key, value]) => row?.[key] === value);
}

const skinPhoto = {
  findUnique: async ({ where }: any) => photos.find(row => matches(row, where)) ?? null,
  create: async ({ data }: any) => {
    createCalls += 1;
    if (concurrentCreateBarrier && createCalls === 1) {
      await new Promise<void>(resolve => { releaseFirstCreate = resolve; });
    }

    if (photos.some(row => row.id === data.id)) {
      const error: any = new Error('Synthetic unique constraint');
      error.code = 'P2002';
      throw error;
    }

    const row = {
      ...data,
      createdAt: new Date('2026-07-04T15:17:00.000Z'),
      updatedAt: new Date('2026-07-04T15:17:00.000Z')
    };
    photos.push(row);
    releaseFirstCreate?.();
    return row;
  }
};

const db: any = {
  skinPhoto,
  user: { update: async (input: any) => { userUpdates.push(input); return input; } },
  $transaction: async (callback: any) => callback(db)
};

const originalLoad = (Module as any)._load;
(Module as any)._load = function(name: string, ...args: any[]) {
  if (name === '@prisma/client') {
    return { PrismaClient: class { constructor() { return db; } } };
  }
  return originalLoad.call(this, name, ...args);
};

const config = require('../src/config/supabase');
config.supabaseAdmin.storage.from = () => ({
  info: async (path: string) => {
    infoRequests.push(path);
    if (forceInfoOutage) {
      return { data: null, error: { statusCode: '503', message: 'provider token=secret-provider-detail' } };
    }
    const object = objects.get(path);
    return object
      ? { data: object, error: null }
      : { data: null, error: { statusCode: '404', message: 'Object not found' } };
  },
  createSignedUploadUrl: async (path: string, options: unknown) => {
    uploadAuthorizations.push({ path, options });
    return {
      data: { signedUrl: `https://capture-test.supabase.co/storage/v1/object/upload/sign/patient-photos/${path}?token=signed-upload-secret` },
      error: null
    };
  },
  createSignedUrl: async (path: string) => {
    downloadAuthorizations.push(path);
    return {
      data: { signedUrl: `https://capture-test.supabase.co/storage/v1/object/sign/patient-photos/${path}?token=signed-download-secret` },
      error: null
    };
  }
});

const app = express();
app.use(express.json());
app.use((req: any, res, next) => {
  const identity = req.header('x-test-identity');
  if (!identity) return res.sendStatus(401);
  req.user = {
    id: identity,
    userType: identity === CLINICIAN ? 'dermatologist' : 'patient',
    email: 'synthetic@test.invalid'
  };
  next();
});
app.use('/photos', require('../src/routes/photos').default);
app.use(require('../src/middleware/errorHandler').errorHandler);
(Module as any)._load = originalLoad;

let server: any;
let baseUrl: string;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise<void>(resolve => server.close(resolve)));

beforeEach(() => {
  photos = [];
  objects = new Map();
  uploadAuthorizations = [];
  downloadAuthorizations = [];
  infoRequests = [];
  userUpdates = [];
  createCalls = 0;
  forceInfoOutage = false;
  concurrentCreateBarrier = false;
  releaseFirstCreate = undefined;
});

function request(path: string, identity = OWNER_A, body?: unknown) {
  return fetch(baseUrl + path, {
    method: 'POST',
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), 'x-test-identity': identity },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function complete(identity: string, captureId: string, captureDate = ORIGINAL_DATE, notes = 'synthetic') {
  return request(`/photos/captures/${captureId}/complete`, identity, { captureDate, notes });
}

async function withoutExpectedErrorLog<T>(action: () => Promise<T>): Promise<T> {
  const originalError = console.error;
  console.error = () => {};
  try {
    return await action();
  } finally {
    console.error = originalError;
  }
}

test('repeat upload intent keeps the same owner-derived identity and disables overwrite', async () => {
  const first = await request(`/photos/captures/${CAPTURE}/upload-url`);
  const retry = await request(`/photos/captures/${CAPTURE}/upload-url`);
  assert.equal(first.status, 200);
  assert.equal(retry.status, 200);
  assert.equal((await first.json() as any).storagePath, PATH_A);
  assert.equal((await retry.json() as any).storagePath, PATH_A);
  assert.deepEqual(uploadAuthorizations, [
    { path: PATH_A, options: { upsert: false } },
    { path: PATH_A, options: { upsert: false } }
  ]);
});

test('the same capture UUID is isolated by verified owner identity', async () => {
  const ownerA = await request(`/photos/captures/${CAPTURE}/upload-url`, OWNER_A);
  const ownerB = await request(`/photos/captures/${CAPTURE}/upload-url`, OWNER_B);
  assert.equal((await ownerA.json() as any).storagePath, PATH_A);
  assert.equal((await ownerB.json() as any).storagePath, PATH_B);
  assert.notEqual(PHOTO_A, PHOTO_B);
});

test('upload intent reports already uploaded bytes without authorizing overwrite', async () => {
  objects.set(PATH_A, { size: 1024, contentType: 'image/jpeg' });
  const response = await request(`/photos/captures/${CAPTURE}/upload-url`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { storagePath: PATH_A, uploaded: true });
  assert.equal(uploadAuthorizations.length, 0);
});

test('lost completion response is recovered by intent returning the existing photo', async () => {
  objects.set(PATH_A, { size: 1024, contentType: 'image/jpeg' });
  const completed = await complete(OWNER_A, CAPTURE);
  assert.equal(completed.status, 201);

  const retry = await request(`/photos/captures/${CAPTURE}/upload-url`);
  assert.equal(retry.status, 200);
  const body: any = await retry.json();
  assert.equal(body.photo.id, PHOTO_A);
  assert.equal(body.photo.userId, OWNER_A);
  assert.match(body.photo.photoUrl, /\/object\/sign\//);
  assert.equal(infoRequests.length, 1);
  assert.equal(uploadAuthorizations.length, 0);
});

test('repeat completion preserves the original capture date and notes in one row', async () => {
  objects.set(PATH_A, { size: 1024, contentType: 'image/jpeg' });
  const first = await complete(OWNER_A, CAPTURE, ORIGINAL_DATE, 'original notes');
  const retry = await complete(OWNER_A, CAPTURE, '2026-08-09T10:11:12.000Z', 'changed notes');
  assert.equal(first.status, 201);
  assert.equal(retry.status, 200);
  const firstBody: any = await first.json();
  const retryBody: any = await retry.json();
  assert.equal(firstBody.photo.id, PHOTO_A);
  assert.equal(retryBody.photo.id, PHOTO_A);
  assert.equal(retryBody.photo.captureDate, ORIGINAL_DATE);
  assert.equal(retryBody.photo.notes, 'original notes');
  assert.equal(photos.length, 1);
  assert.equal(infoRequests.length, 1);
});

test('concurrent completion recovers the unique winner and returns one photo', async () => {
  objects.set(PATH_A, { size: 1024, contentType: 'image/jpeg' });
  concurrentCreateBarrier = true;
  const [one, two] = await Promise.all([
    complete(OWNER_A, CAPTURE),
    complete(OWNER_A, CAPTURE)
  ]);
  assert.deepEqual([one.status, two.status].sort(), [200, 201]);
  assert.equal((await one.json() as any).photo.id, PHOTO_A);
  assert.equal((await two.json() as any).photo.id, PHOTO_A);
  assert.equal(photos.length, 1);
  assert.equal(createCalls, 2);
});

test('capture completion always creates score zero without score or streak mutation', async () => {
  objects.set(PATH_A, { size: 1024, contentType: 'image/jpeg' });
  const response = await complete(OWNER_A, CAPTURE);
  const body: any = await response.json();
  assert.equal(response.status, 201);
  assert.equal(body.photo.skinScore, 0);
  assert.equal(photos[0].skinScore, 0);
  assert.equal(userUpdates.length, 0);
});

test('capture endpoints reject malformed UUIDs and clinical metadata in intent', async () => {
  const [invalidId, intentMetadata] = await withoutExpectedErrorLog(async () => Promise.all([
    request('/photos/captures/not-a-uuid/upload-url'),
    request(`/photos/captures/${CAPTURE}/upload-url`, OWNER_A, { notes: 'must be completed later' })
  ]));
  assert.equal(invalidId.status, 400);
  assert.equal(intentMetadata.status, 400);
  assert.equal(infoRequests.length, 0);
  assert.equal(uploadAuthorizations.length, 0);
});

test('capture completion rejects invalid dates before touching storage', async () => {
  const [malformed, impossible] = await withoutExpectedErrorLog(async () => Promise.all([
    complete(OWNER_A, CAPTURE, 'July 4, 2026'),
    complete(OWNER_A, CAPTURE, '2026-02-30T10:00:00.000Z')
  ]));
  assert.equal(malformed.status, 400);
  assert.equal(impossible.status, 400);
  assert.equal(infoRequests.length, 0);
  assert.equal(createCalls, 0);
});

for (const [label, object] of [
  ['empty', { size: 0, contentType: 'image/jpeg' }],
  ['oversized', { size: 10 * 1024 * 1024 + 1, contentType: 'image/jpeg' }],
  ['non-JPEG', { size: 1024, contentType: 'image/png' }]
] as const) {
  test(`capture completion rejects ${label} stored bytes`, async () => {
    objects.set(PATH_A, object);
    const response = await complete(OWNER_A, CAPTURE);
    assert.equal(response.status, 400);
    assert.equal(createCalls, 0);
    assert.equal(photos.length, 0);
  });
}

test('storage provider errors are not mistaken for missing bytes or exposed to clients', async () => {
  forceInfoOutage = true;
  const response = await withoutExpectedErrorLog(() => request(`/photos/captures/${CAPTURE}/upload-url`));
  const text = await response.text();
  assert.equal(response.status, 500);
  assert.equal(uploadAuthorizations.length, 0);
  assert.doesNotMatch(text, /secret-provider-detail|signed-upload-secret|token=/);
});

test('clinicians cannot create patient capture intents or completions', async () => {
  const intent = await request(`/photos/captures/${CAPTURE}/upload-url`, CLINICIAN);
  const completion = await complete(CLINICIAN, CAPTURE);
  assert.equal(intent.status, 403);
  assert.equal(completion.status, 403);
  assert.equal(infoRequests.length, 0);
  assert.equal(createCalls, 0);
});
