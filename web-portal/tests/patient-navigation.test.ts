import { test } from 'node:test';
import assert from 'node:assert/strict';
import { patientListContext, patientListQuery } from '../src/lib/patient-navigation';
import { PatientListController } from '../src/lib/patient-list';
test('workspace return context preserves search and page without allowing redirect destinations', () => {
  const value = patientListContext(new URLSearchParams(patientListQuery(3, 'Ada & Ben')));
  assert.deepEqual(value, { page: 3, search: 'Ada & Ben' });
  assert.deepEqual(patientListContext(new URLSearchParams('page=-4&return=https://external.invalid')), { page: 1, search: '' });
});
test('restoring a patient list loads the original search and page together', async () => {
  const calls: unknown[] = [];
  const controller = new PatientListController(async (page, search) => {
    calls.push({ page, search });
    return { data: [], pagination: { page, limit: 20, total: 60, totalPages: 3 } };
  });
  await controller.restore(3, 'Ada');
  assert.deepEqual(calls, [{ page: 3, search: 'Ada' }]);
  assert.equal(controller.snapshot().page, 3);
  assert.equal(controller.snapshot().search, 'Ada');
});
