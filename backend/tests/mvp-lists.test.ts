import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePagination, parsePatientSearch } from '../src/services/pagination';

test('pagination defaults to the caller limit', () => {
  assert.deepEqual(parsePagination({}, 20), { page: 1, limit: 20, skip: 0 });
});

test('pagination accepts bounded decimal integers', () => {
  assert.deepEqual(parsePagination({ page: '2', limit: '50' }, 20), { page: 2, limit: 50, skip: 50 });
});

test('pagination rejects malformed and out-of-range pages', () => {
  for (const page of ['0', '-1', '1.5', '1x', '10001', ['1'], '9007199254740992']) {
    assert.throws(() => parsePagination({ page }, 20));
  }
});

test('pagination rejects limits above the API bound', () => {
  assert.throws(() => parsePagination({ limit: '51' }, 20));
});

test('patient search is trimmed, name-only input', () => {
  assert.equal(parsePatientSearch('  Synthetic Patient  '), 'Synthetic Patient');
  assert.equal(parsePatientSearch('   '), undefined);
  assert.throws(() => parsePatientSearch(['Synthetic Patient']));
  assert.throws(() => parsePatientSearch('x'.repeat(101)));
});
