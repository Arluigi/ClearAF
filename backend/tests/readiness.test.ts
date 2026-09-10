import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadiness, createDependencyProbes } from '../src/services/readiness';

const healthy = () => ({ database: async () => true, auth: async () => true, storage: async () => true });
test('ready requires all dependencies; errors cannot escape public result', async () => {
  assert.deepEqual(await createReadiness(healthy())(), { status: 'ready' });
  for (const dependency of ['database', 'auth', 'storage']) {
    const probes = healthy();
    probes[dependency] = async () => { throw new Error('postgres://secret/patient-data'); };
    assert.deepEqual(await createReadiness(probes)(), { status: 'unavailable' });
    probes[dependency] = async () => false;
    assert.deepEqual(await createReadiness(probes)(), { status: 'unavailable' });
  }
});
test('coalesces concurrent requests, caches briefly, and retries after expiry', async () => {
  let calls = 0, now = 0;
  const check = createReadiness({ ...healthy(), database: async () => { calls++; return true; } }, { now: () => now, cacheMs: 10 });
  await Promise.all(Array.from({length: 30}, () => check()));
  await check();
  assert.equal(calls, 1);
  now = 11;
  await check();
  assert.equal(calls, 2);
});
test('timeout aborts probes and never duplicates unresolved work after cache expiry', async () => {
  let calls = 0, signal: AbortSignal;
  const check = createReadiness({ ...healthy(), database: async (s) => { signal = s; calls++; return new Promise(() => {}); } }, { timeoutMs: 15, cacheMs: 0 });
  const start = Date.now();
  assert.deepEqual(await check(), { status: 'unavailable' });
  assert.ok(Date.now() - start < 500);
  assert.equal(signal.aborted, true);
  assert.deepEqual(await check(), { status: 'unavailable' });
  assert.equal(calls, 1);
});
test('HTTP probes only request Auth health and private bucket metadata', async () => {
  const requests: string[] = [];
  const probes = createDependencyProbes({
    database: async () => true, url: 'http://127.0.0.1:54321', serviceKey: 'test-key',
    fetch: async (url, init) => {
      requests.push(String(url));
      assert.equal(init.redirect, 'error');
      assert.ok(init.signal);
      return new Response(JSON.stringify({ id: 'patient-photos', public: false }), { status: 200 });
    }
  });
  assert.deepEqual(await createReadiness(probes)(), {status: 'ready'});
  assert.deepEqual(requests.sort(), ['http://127.0.0.1:54321/auth/v1/health', 'http://127.0.0.1:54321/storage/v1/bucket/patient-photos']);
});
test('public, missing, malformed or unauthorized buckets fail readiness', async () => {
  for (const [body, status] of [[{id:'patient-photos',public:true},200], [{public:false},200], ['broken',200], [{},403]] as const) {
    const probes = createDependencyProbes({database: async () => true, url:'http://localhost', serviceKey:'key', fetch:async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), {status})});
    assert.deepEqual(await createReadiness(probes)(), {status:'unavailable'});
  }
});

test('HTTP health stays live without probes; readiness uses 503 and prohibits caching', async () => {
  const { default: express } = await import('express');
  const { installHealthRoutes } = await import('../src/services/readiness');
  const app = express();
  let calls = 0;
  installHealthRoutes(app, async () => { calls++; return {status:'unavailable'}; });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${(server.address() as any).port}`;
    const live = await fetch(base+'/health');
    assert.equal(live.status, 200);
    assert.deepEqual(await live.json(), {status:'healthy'});
    assert.equal(calls, 0);
    const ready = await fetch(base+'/ready');
    assert.equal(ready.status, 503);
    assert.deepEqual(await ready.json(), {status:'unavailable'});
    assert.match(ready.headers.get('cache-control')!, /no-store/);
    assert.match(live.headers.get('cache-control')!, /no-cache/);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('database probe destroys a stalled connection and recovers on a fresh attempt', async () => {
  const { createDatabaseProbe } = await import('../src/services/readiness');
  let attempts = 0, active = 0, maxActive = 0;
  const database = createDatabaseProbe('postgres://synthetic', 20, (config: any) => ({
    on() {},
    async connect() {
      attempts++; active++; maxActive = Math.max(maxActive, active);
      config.stream().once('close', () => active--);
      if (attempts === 1) await new Promise(() => {});
    },
    async query(sql: string) { assert.equal(sql, 'SELECT 1'); },
    async end() { config.stream().destroy(); }
  } as any));
  const check = createReadiness({ ...healthy(), database }, {cacheMs: 0, timeoutMs: 100});
  assert.deepEqual(await check(), {status:'unavailable'});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(active, 0);
  assert.deepEqual(await check(), {status:'ready'});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(attempts, 2);
  assert.equal(active, 0);
  assert.equal(maxActive, 1);
});

test('real pg connection to an unresponsive local server is closed before retry', async () => {
  const { createServer } = await import('node:net');
  const { createDatabaseProbe } = await import('../src/services/readiness');
  const sockets = new Set<import('node:net').Socket>();
  let accepted = 0;
  const server = createServer(socket => {
    accepted++; sockets.add(socket);
    socket.on('data', () => {}); // Consume startup bytes but never answer.
    socket.on('close', () => sockets.delete(socket));
  });
  server.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    const port = (server.address() as any).port;
    const database = createDatabaseProbe(`postgres://synthetic:synthetic@127.0.0.1:${port}/synthetic?sslmode=disable`, 30);
    const check = createReadiness({...healthy(), database}, {cacheMs:0, timeoutMs:100});
    for (let i = 0; i < 2; i++) {
      assert.deepEqual(await check(), {status:'unavailable'});
      await new Promise(resolve => setTimeout(resolve, 10));
      assert.equal(sockets.size, 0);
    }
    assert.equal(accepted, 2);
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
