import test from 'node:test';
import assert from 'node:assert/strict';
const { requireLoopback, cleanup } = require('../scripts/mvp-volume-fixture.cjs');
const run = '11111111-1111-4111-8111-111111111111';
const patient = '22222222-2222-4222-8222-222222222222';
const clinician = '33333333-3333-4333-8333-333333333333';
const photo = '44444444-4444-4444-8444-444444444444';
function fixture() {
  const accounts = [patient, clinician].map((id, index) => ({ id, role: index ? 'clinician' : 'patient', index,
    email: `clearaf-volume-${run}-${index}@example.invalid` }));
  const state = { run, accounts, photos: [{ id: photo, owner: patient, path: `${patient}/${photo}.jpg` }] };
  const users = new Map([...accounts.map(a => [a.id, { ...a }]), ['unrelated', { id: 'unrelated' }]]);
  const removed = []; let fail = false;
  const ports = {
    async user(id) { return users.has(id) ? { data: { user: users.get(id) } } : { data: { user: null }, error: { status: 404, code: 'user_not_found' } }; },
    async removeObjects(paths) { removed.push(['objects', paths]); },
    async removeRows(s) { removed.push(['rows', s.photos.map(p => p.id), s.accounts.map(a => a.id)]); },
    async removeUser(id) { if (fail && id === clinician) throw Error('temporary'); users.delete(id); removed.push(['user', id]); },
    async verify(s) { assert(s.accounts.every(a => !users.has(a.id))); },
  };
  return { state, users, ports, removed, setFail(v) { fail = v; } };
}
for (const url of ['https://example.com', 'http://localhost@remote.invalid', 'http://127.0.0.1/?host=remote', 'ftp://localhost', 'http://localhost/#x']) {
  test(`reject unsafe endpoint ${url}`, () => assert.throws(() => requireLoopback(url, ['http:'])));
}
test('exact cleanup preserves unrelated fixture identities and objects', async () => {
  const f = fixture(); await cleanup(f.state, f.ports);
  assert.deepEqual([...f.users.keys()], ['unrelated']);
  assert.deepEqual(f.removed[0], ['objects', [`${patient}/${photo}.jpg`]]);
  assert.deepEqual(f.removed[1], ['rows', [photo], [patient, clinician]]);
});
test('cleanup resumes after partial Auth deletion', async () => {
  const f = fixture(); f.setFail(true); await assert.rejects(cleanup(f.state, f.ports));
  f.setFail(false); await cleanup(f.state, f.ports);
  assert.equal(f.removed.filter(r => r[0] === 'user' && r[1] === patient).length, 1);
  assert.deepEqual([...f.users.keys()], ['unrelated']);
});
test('mismatched live identity stops before any deletion', async () => {
  const f = fixture(); f.users.get(clinician).email = 'unrelated@example.invalid';
  await assert.rejects(cleanup(f.state, f.ports)); assert.equal(f.removed.length, 0);
});
test('transient lookup failure is not absence', async () => {
  const f = fixture(); f.ports.user = async () => ({ data: { user: null }, error: { status: 500, code: 'user_not_found' } });
  await assert.rejects(cleanup(f.state, f.ports)); assert.equal(f.removed.length, 0);
});
test('malformed or foreign object manifest stops before deletion', async () => {
  const f = fixture(); f.state.photos[0].path = `unrelated/${photo}.jpg`;
  await assert.rejects(cleanup(f.state, f.ports)); assert.equal(f.removed.length, 0);
});
