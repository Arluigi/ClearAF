// Local-only synthetic fixture for routine Simulator and portal verification.
// Generated credentials stay in ignored .local state with mode0600.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../..');
const req = createRequire(path.join(root, 'backend/package.json'));
req('dotenv').config({ path: path.join(root, 'backend/.env'), quiet: true });
const { Client } = req('pg');
const { createClient } = req('@supabase/supabase-js');
const { enrollFixture, unenrollFixture } = require(path.join(__dirname, 'lib/enrollment-fixture.cjs'));
const statePath = path.join(root, '.local/routine-ui-fixture.json');
const mode = process.argv[2];
assert(['create', 'inspect', 'cleanup'].includes(mode),
  'Usage: node backend/scripts/routine-ui-fixture.cjs create|inspect|cleanup');
for (const key of ['DATABASE_URL', 'SUPABASE_URL']) {
  assert(['127.0.0.1', 'localhost'].includes(new URL(process.env[key]).hostname), 'Loopback required');
}
const authOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, authOptions);
const db = new Client({ connectionString: process.env.DATABASE_URL });

function save(state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.chmodSync(statePath, 0o600);
}

async function login(account) {
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, authOptions);
  const result = await client.auth.signInWithPassword({ email: account.email, password: account.password });
  assert(!result.error, 'Fixture login failed');
  return result.data.session.access_token;
}

async function call(token, url, method = 'GET', body) {
  const response = await fetch('http://127.0.0.1:3001/api/routines' + url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  assert(response.ok, `Routine request failed ${response.status}`);
  return response.json();
}

async function create() {
  assert(!fs.existsSync(statePath), 'Existing fixture must be preserved');
  const state = { run: crypto.randomUUID(), accounts: [], revisions: [] };
  save(state);
  for (const role of ['patient', 'clinician']) {
    const account = {
      role,
      email: `clearaf-routine-ui-${state.run}-${role}@example.invalid`,
      password: crypto.randomBytes(24).toString('base64url'),
    };
    const result = await admin.auth.admin.createUser({
      email: account.email,
      password: account.password,
      email_confirm: true,
      user_metadata: { name: `Synthetic Routine ${role}` },
    });
    assert(!result.error, 'Fixture creation failed');
    account.id = result.data.user.id;
    state.accounts.push(account);
    save(state);
  }
  const [patient, clinician] = state.accounts;
  await db.query('insert into dermatologists(id,name,email,password) values($1,$2,$3,$4)',
    [clinician.id, 'Synthetic Routine Clinician', clinician.email, 'UNUSED_SUPABASE_AUTH']);
  await db.query('update user_profiles set "dermatologistId"=$1,"onboardingCompleted"=true where id=$2',
    [clinician.id, patient.id]);
  const clinicianToken = await login(clinician);
  for (const slot of ['morning', 'evening']) {
    const id = crypto.randomUUID();
    const body = {
      expectedRevisionId: null,
      name: slot === 'morning' ? 'Synthetic Morning Routine' : 'Synthetic Evening Routine',
      isActive: true,
      steps: [
        { title: 'Synthetic step one', instructions: 'Synthetic test instruction one.' },
        { title: 'Synthetic step two', instructions: 'Synthetic test instruction two.' },
      ],
    };
    const result = await call(clinicianToken, `/patients/${patient.id}/${slot}/revisions/${id}`, 'PUT', body);
    state.revisions.push(result.routine);
    save(state);
  }
  const patientToken = await login(patient);
  const enrollmentResponse = await fetch('http://127.0.0.1:3001/api/enrollment', {
    headers: { Authorization: `Bearer ${patientToken}` },
  });
  assert(enrollmentResponse.ok, `Enrollment lookup failed ${enrollmentResponse.status}`);
  const enrollment = await enrollmentResponse.json();
  await enrollFixture(db, [patient.id], {
    rulesVersion: enrollment.rulesVersion,
    documentVersion: enrollment.consent.version,
    documentSha256: enrollment.consent.sha256,
  });
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const completedAt = yesterday.toISOString();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const localDate = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(yesterday);
  const result = await call(patientToken, `/completions/${crypto.randomUUID()}`, 'PUT', {
    revisionId: state.revisions[1].id, completedAt, localDate, timeZone,
  });
  state.yesterdayCompletion = result.completion;
  save(state);
  console.log(JSON.stringify({
    created: true,
    accounts: state.accounts.map(({ id, role }) => ({ id, role })),
    routines: state.revisions.map(({ name, id }) => ({ name, id })),
    yesterday: localDate,
  }));
}

async function inspectOrCleanup() {
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const liveAccounts = [];
  for (const account of state.accounts) {
    assert(['patient', 'clinician'].includes(account.role)
      && account.email === `clearaf-routine-ui-${state.run}-${account.role}@example.invalid`,
    'Synthetic fixture identity required');
    const result = await admin.auth.admin.getUserById(account.id);
    // Auth is durable cleanup progress: only an exact not-found response permits a skip.
    if (result.error?.status === 404 && result.error.code === 'user_not_found'
      && result.data.user === null) continue;
    assert(!result.error && result.data.user?.id === account.id
      && result.data.user.email === account.email, 'Exact fixture identity required');
    liveAccounts.push(account);
  }
  const ids = state.accounts.map(account => account.id);
  if (mode === 'inspect') {
    const result = await db.query(
      'select "revisionId","localDate",count(*)::int as count from care_routine_completions where "userId"=$1 group by "revisionId","localDate" order by "localDate"',
      [state.accounts.find(account => account.role === 'patient')?.id],
    );
    console.log(JSON.stringify({ completionGroups: result.rows }));
    return;
  }
  await db.query('delete from care_routine_completions where "userId"=any($1::uuid[])', [ids]);
  await db.query('delete from care_routine_revisions where "userId"=any($1::uuid[])', [ids]);
  await unenrollFixture(db, ids);
  await db.query('delete from user_profiles where id=any($1::uuid[])', [ids]);
  await db.query('delete from dermatologists where id=any($1::uuid[])', [ids]);
  for (const account of liveAccounts) {
    assert(!(await admin.auth.admin.deleteUser(account.id)).error, 'Fixture deletion failed');
  }
  const remaining = await db.query('select count(*)::int as count from auth.users where id=any($1::uuid[])', [ids]);
  assert.equal(remaining.rows[0].count, 0);
  fs.unlinkSync(statePath);
  console.log('Exact synthetic routine fixture cleaned');
}

(async () => {
  await db.connect();
  try {
    if (mode === 'create') await create();
    else await inspectOrCleanup();
  } finally {
    await db.end();
  }
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
