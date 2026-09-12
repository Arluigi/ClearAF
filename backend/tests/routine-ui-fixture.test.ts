import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const scriptDirectory = path.resolve(__dirname, '../scripts');
const source = fs.readFileSync(path.join(scriptDirectory, 'routine-ui-fixture.cjs'), 'utf8');
const run = '11111111-1111-4111-8111-111111111111';
const accounts = ['patient', 'clinician'].map((role, index) => ({
  id: index === 0 ? '22222222-2222-4222-8222-222222222222' : '33333333-3333-4333-8333-333333333333',
  role,
  email: `clearaf-routine-ui-${run}-${role}@example.invalid`,
}));

// Execute the actual CLI with only external Auth, database, and state-file I/O replaced.
function fixture() {
  const state = { run, accounts: structuredClone(accounts), revisions: [] };
  const users = new Map(accounts.map(account => [account.id, { ...account }]));
  let stateExists = true;
  const queries = [];
  const deletions = [];
  let lookupError;
  let failDelete;
  const admin = {
    async getUserById(id) {
      if (lookupError) return { data: { user: null }, error: lookupError };
      const user = users.get(id);
      return user ? { data: { user }, error: null } : {
        data: { user: null }, error: { status: 404, code: 'user_not_found' },
      };
    },
    async deleteUser(id) {
      deletions.push(id);
      if (id === failDelete) return { data: { user: null }, error: { status: 500 } };
      assert(users.delete(id), 'Already absent users must not be deleted again');
      return { data: { user: null }, error: null };
    },
  };
  async function cleanup(env = {}) {
    const processStub = {
      argv: ['node', 'routine-ui-fixture.cjs', 'cleanup'],
      env: { DATABASE_URL: 'postgres://localhost:54322/postgres', SUPABASE_URL: 'http://127.0.0.1:54321', ...env },
      exitCode: 0,
    };
    const errors = [];
    const modules = {
      dotenv: { config() {} },
      '@supabase/supabase-js': { createClient: () => ({ auth: { admin } }) },
      pg: { Client: class {
        async connect() {}
        async end() {}
        async query(sql, [ids]) {
          assert.deepEqual(Array.from(ids), accounts.map(account => account.id));
          queries.push(sql);
          return { rows: [{ count: ids.filter(id => users.has(id)).length }] };
        }
      } },
    };
    try {
      await vm.runInNewContext(source, {
        __dirname: scriptDirectory,
        URL,
        process: processStub,
        console: { log() {}, error: message => errors.push(message) },
        require: name => {
          if (name === 'node:module') return { createRequire: () => name => modules[name] };
          if (name === 'node:fs') return {
            readFileSync() { assert(stateExists); return JSON.stringify(state); },
            unlinkSync() { stateExists = false; },
          };
          return require(name);
        },
      });
    } catch (error) { errors.push(error.message); processStub.exitCode = 1; }
    return { exitCode: processStub.exitCode, errors };
  }
  return {
    state, users, queries, deletions, cleanup,
    stateExists: () => stateExists,
    setLookupError: value => { lookupError = value; },
    setFailDelete: value => { failDelete = value; },
  };
}

test('cleanup resumes after one Auth deletion succeeds and the next fails', async () => {
  const f = fixture();
  f.setFailDelete(accounts[1].id);
  assert.equal((await f.cleanup()).exitCode, 1);
  assert.equal(f.stateExists(), true);
  assert.equal(f.users.size, 1);

  f.setFailDelete(undefined);
  assert.equal((await f.cleanup()).exitCode, 0);
  assert.equal(f.users.size, 0);
  assert.equal(f.stateExists(), false);
  assert.equal(f.deletions.filter(id => id === accounts[0].id).length, 1);
});

for (const error of [
  { status: 500, code: 'unexpected_failure' },
  { status: 401, code: 'user_not_found' },
  { status: 404, code: 'unexpected_failure' },
]) {
  test(`cleanup preserves state and records on unconfirmed absence ${error.status}/${error.code}`, async () => {
    const f = fixture();
    f.setLookupError(error);
    assert.equal((await f.cleanup()).exitCode, 1);
    assert.equal(f.queries.length, 0);
    assert.equal(f.deletions.length, 0);
    assert.equal(f.stateExists(), true);
  });
}

for (const field of ['id', 'email']) {
  test(`cleanup rejects a live Auth ${field} mismatch before deleting any records`, async () => {
    const f = fixture();
    f.users.get(accounts[1].id)[field] = 'unrelated';
    assert.equal((await f.cleanup()).exitCode, 1);
    assert.equal(f.queries.length, 0);
    assert.equal(f.deletions.length, 0);
  });
}

test('cleanup validates synthetic email even for an already absent identity', async () => {
  const f = fixture();
  f.users.delete(accounts[0].id);
  f.state.accounts[0].email = 'unrelated@example.invalid';
  assert.equal((await f.cleanup()).exitCode, 1);
  assert.equal(f.queries.length, 0);
  assert.equal(f.deletions.length, 0);
});

for (const key of ['DATABASE_URL', 'SUPABASE_URL']) {
  test(`cleanup rejects non-loopback ${key} before accessing records`, async () => {
    const f = fixture();
    assert.equal((await f.cleanup({ [key]: 'https://remote.example.invalid' })).exitCode, 1);
    assert.equal(f.queries.length, 0);
    assert.equal(f.deletions.length, 0);
  });
}
