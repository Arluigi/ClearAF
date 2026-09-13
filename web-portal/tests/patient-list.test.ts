import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PaginatedResponse, User } from '../src/types/api';
import { PatientListController } from '../src/lib/patient-list';

const patient = (id: string, name = id): User => ({ id, name, userType: 'patient' });
const response = (patients: User[], page = 1, totalPages = 1): PaginatedResponse<User> => ({
  data: patients,
  pagination: { page, limit: 20, total: patients.length, totalPages },
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
};

test('newer search result remains visible when an older request finishes last', async () => {
  const a = deferred<PaginatedResponse<User>>();
  const b = deferred<PaginatedResponse<User>>();
  const controller = new PatientListController((_page, search) => search === 'A' ? a.promise : b.promise);
  const loadA = controller.search('A');
  const loadB = controller.search('B');
  b.resolve(response([patient('patient-b')]));
  await loadB;
  a.resolve(response([patient('patient-a')]));
  await loadA;
  assert.equal(controller.snapshot().search, 'B');
  assert.deepEqual(controller.snapshot().patients.map(p => p.id), ['patient-b']);
});

test('a failed request can be retried', async () => {
  let calls = 0;
  const controller = new PatientListController(async () => {
    calls += 1;
    if (calls === 1) throw new Error('offline');
    return response([patient('patient-retry')]);
  });
  await controller.load();
  assert.equal(controller.snapshot().status, 'error');
  await controller.retry();
  assert.equal(controller.snapshot().status, 'ready');
  assert.deepEqual(controller.snapshot().patients.map(p => p.id), ['patient-retry']);
});

test('dispose suppresses results from an active request', async () => {
  const pending = deferred<PaginatedResponse<User>>();
  const controller = new PatientListController(() => pending.promise);
  const load = controller.load();
  controller.dispose();
  pending.resolve(response([patient('patient-after-dispose')]));
  await load;
  assert.deepEqual(controller.snapshot().patients, []);
});

test('changing search resets the requested page to one', async () => {
  const calls: Array<[number, string]> = [];
  const controller = new PatientListController(async (page, search) => {
    calls.push([page, search]);
    return response([], page, 3);
  });
  await controller.goToPage(3);
  await controller.search('Ada');
  assert.deepEqual(calls, [[3, ''], [1, 'Ada']]);
  assert.equal(controller.snapshot().page, 1);
});
