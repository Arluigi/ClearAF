import test from 'node:test';
import assert from 'node:assert/strict';
import { read } from './letterpress-rules';

test('the patients page is the worklist; the separate queues live only in the legacy fallback', () => {
  const page = read('src/app/patients/page.tsx');
  assert.match(page, /<Worklist \/>/);
  assert.doesNotMatch(page, /PhotoReviewQueue|UrgentReportQueue|PatientListController/);
  const container = read('src/components/patients/worklist/Worklist.tsx');
  assert.match(container, /if \(state\.status === 'unsupported'\) return <LegacyPatientList \/>;/);
  assert.match(container, /patientListQuery\(state\.page, state\.search, state\.filter\)/);
  const legacy = read('src/components/patients/LegacyPatientList.tsx');
  for (const text of ['<UrgentReportQueue', '<PhotoReviewQueue', 'Previous patients', 'Next patients', 'api.getPatients(page, 20, search)']) assert.ok(legacy.includes(text), text);
});

test('the workspace back link returns to the same filter, page and search', () => {
  assert.ok(read('src/app/patients/[id]/page.tsx').includes("'/patients?' + patientListQuery(context.page, context.search, context.filter)"));
});
