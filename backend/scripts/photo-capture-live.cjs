// Exercises deterministic capture against loopback-only API, Auth, DB and Storage.
// Every fixture has a unique run identity and cleanup targets only recorded IDs/paths.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const { v5: uuidv5 } = require('uuid');
const { enrollFixture, unenrollFixture } = require('./lib/enrollment-fixture.cjs');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

function requireLoopbackUrl(label, value, protocols) {
  assert(value, `${label} is required`);
  const url = new URL(value);
  assert(protocols.includes(url.protocol), `${label} has an unexpected protocol`);
  assert(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), `${label} must use loopback; production is never allowed`);
  assert.equal(url.search, '', `${label} cannot contain query overrides`);
  assert.equal(url.hash, '', `${label} cannot contain a fragment`);
  return url;
}

const apiUrl = requireLoopbackUrl(
  'PHOTO_CAPTURE_API_URL',
  process.env.PHOTO_CAPTURE_API_URL || 'http://127.0.0.1:3002/api',
  ['http:']
);
assert(['/api', '/api/'].includes(apiUrl.pathname), 'PHOTO_CAPTURE_API_URL path must be /api');
const apiBase = apiUrl.href.replace(/\/$/, '');

const supabaseUrl = requireLoopbackUrl('SUPABASE_URL', process.env.SUPABASE_URL, ['http:', 'https:']).href.replace(/\/$/, '');
requireLoopbackUrl('DATABASE_URL', process.env.DATABASE_URL, ['postgres:', 'postgresql:']);
assert(process.env.SUPABASE_ANON_KEY, 'SUPABASE_ANON_KEY is required');
assert(process.env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY is required');

const admin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const publicClient = () => createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const db = new Client({ connectionString: process.env.DATABASE_URL });
const runId = crypto.randomUUID();
const captureId = crypto.randomUUID();
const accounts = [];
const photoIds = [];
const storagePaths = [];
const jpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==',
  'base64'
);

async function createAccount(role) {
  const account = {
    role,
    email: `clearaf-photo-${runId}-${role.toLowerCase()}@example.invalid`,
    password: crypto.randomBytes(30).toString('base64url')
  };
  const { data, error } = await admin.auth.admin.createUser({
    email: account.email,
    password: account.password,
    email_confirm: true,
    user_metadata: { name: `Synthetic Photo ${role}` }
  });
  if (error) throw error;
  account.id = data.user.id;
  accounts.push(account);
  return account;
}

async function signIn(account) {
  const { data, error } = await publicClient().auth.signInWithPassword({
    email: account.email,
    password: account.password
  });
  if (error) throw error;
  account.token = data.session.access_token;
}

async function call(route, account, method = 'GET', body) {
  const response = await fetch(apiBase + route, {
    method,
    headers: {
      ...(account ? { Authorization: `Bearer ${account.token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return response;
}

async function json(response, expectedStatus) {
  assert.equal(response.status, expectedStatus, `API returned HTTP ${response.status}, expected ${expectedStatus}`);
  return response.json();
}

async function enrollPatients(patientAccounts) {
  const enrollment = await json(await call('/enrollment', patientAccounts[0]), 200);
  await enrollFixture(db, patientAccounts.map(account => account.id), {
    rulesVersion: enrollment.rulesVersion,
    documentVersion: enrollment.consent.version,
    documentSha256: enrollment.consent.sha256
  });
}

async function uploadSigned(intent) {
  assert.equal(new URL(intent.signedUrl).hostname, new URL(supabaseUrl).hostname, 'Signed upload escaped local Supabase');
  storagePaths.push(intent.storagePath);
  const response = await fetch(intent.signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'false' },
    body: jpeg
  });
  assert.equal(response.status, 200, `Signed upload returned HTTP ${response.status}`);
}

async function cleanup() {
  const cleanupErrors = [];
  if (storagePaths.length) {
    const { error } = await admin.storage.from('patient-photos').remove([...new Set(storagePaths)]);
    if (error) cleanupErrors.push(error);
  }

  if (photoIds.length) {
    try {
      await db.query(
        'delete from public.skin_photos where id=any($1::uuid[]) and "userId"=any($2::uuid[])',
        [[...new Set(photoIds)], accounts.map(account => account.id)]
      );
    } catch (error) { cleanupErrors.push(error); }
  }

  const patients = accounts.filter(account => account.role.startsWith('patient'));
  const clinicians = accounts.filter(account => account.role.startsWith('clinician'));
  if (patients.length && clinicians.length) {
    try {
      await db.query(
        'update public.user_profiles set "dermatologistId"=null where id=any($1::uuid[]) and "dermatologistId"=any($2::uuid[])',
        [patients.map(account => account.id), clinicians.map(account => account.id)]
      );
    } catch (error) { cleanupErrors.push(error); }
  }
  if (clinicians.length) {
    try {
      await db.query('delete from public.dermatologists where id=any($1::uuid[])', [clinicians.map(account => account.id)]);
    } catch (error) { cleanupErrors.push(error); }
  }

  // Enrollment records reference user_profiles with ON DELETE RESTRICT, and deleting the
  // auth user cascades into user_profiles; clear them first or the cascade fails.
  if (accounts.length) {
    try {
      await unenrollFixture(db, accounts.map(account => account.id));
    } catch (error) { cleanupErrors.push(error); }
  }

  for (const account of accounts) {
    try {
      const found = await admin.auth.admin.getUserById(account.id);
      if (found.error || found.data.user.email !== account.email) {
        throw new Error('Fixture identity mismatch; cleanup stopped for one account');
      }
      const removed = await admin.auth.admin.deleteUser(account.id);
      if (removed.error) throw removed.error;
    } catch (error) { cleanupErrors.push(error); }
  }

  if (accounts.length) {
    try {
      await db.query('delete from public.user_profiles where id=any($1::uuid[])', [accounts.map(account => account.id)]);
    } catch (error) { cleanupErrors.push(error); }
  }
  if (cleanupErrors.length) throw cleanupErrors[0];
}

async function run() {
  await db.connect();
  let runError;
  try {
    const patientA = await createAccount('patientA');
    const patientB = await createAccount('patientB');
    const assignedClinician = await createAccount('clinicianAssigned');
    const wrongClinician = await createAccount('clinicianWrong');
    for (const account of accounts) {
      if (account.role.startsWith('clinician')) {
        await db.query(
          'insert into public.dermatologists (id,name,email,password,"createdAt","updatedAt") values ($1,$2,$3,$4,now(),now())',
          [account.id, 'Synthetic Photo Clinician', account.email, 'UNUSED_SUPABASE_AUTH']
        );
      }
    }
    await db.query(
      'update public.user_profiles set "dermatologistId"=$2 where id=$1',
      [patientA.id, assignedClinician.id]
    );
    for (const account of accounts) await signIn(account);
    await enrollPatients([patientA, patientB]);

    const firstIntent = await json(
      await call(`/photos/captures/${captureId}/upload-url`, patientA, 'POST', {}),
      200
    );
    const repeatedIntent = await json(
      await call(`/photos/captures/${captureId}/upload-url`, patientA, 'POST', {}),
      200
    );
    const expectedPatientAId = uuidv5(captureId, patientA.id);
    const expectedPatientAPath = `${patientA.id}/${expectedPatientAId}.jpg`;
    assert.equal(firstIntent.storagePath, expectedPatientAPath);
    assert.equal(repeatedIntent.storagePath, expectedPatientAPath);
    await uploadSigned(firstIntent);
    console.log('PASS deterministic repeated intent and actual no-overwrite signed JPEG upload');

    const uploadedIntent = await json(
      await call(`/photos/captures/${captureId}/upload-url`, patientA, 'POST', {}),
      200
    );
    assert.deepEqual(uploadedIntent, { storagePath: firstIntent.storagePath, uploaded: true });
    console.log('PASS existing object resumes at completion without overwrite');

    const originalCaptureDate = '2026-04-05T06:07:08.000Z';
    const firstCompletion = await json(
      await call(`/photos/captures/${captureId}/complete`, patientA, 'POST', {
        captureDate: originalCaptureDate,
        notes: 'Synthetic photo capture live check'
      }),
      201
    );
    photoIds.push(firstCompletion.photo.id);
    assert.equal(firstCompletion.photo.id, expectedPatientAId);
    const retryCompletion = await json(
      await call(`/photos/captures/${captureId}/complete`, patientA, 'POST', {
        captureDate: '2026-05-06T07:08:09.000Z',
        notes: 'Must not replace original metadata'
      }),
      200
    );
    assert.equal(retryCompletion.photo.id, firstCompletion.photo.id);
    assert.equal(retryCompletion.photo.captureDate, originalCaptureDate);
    assert.equal(retryCompletion.photo.notes, 'Synthetic photo capture live check');
    assert.equal(retryCompletion.photo.skinScore, 0);
    const rows = await db.query(
      'select id,to_char("captureDate", \'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"\') as capture_date,notes,"skinScore" from public.skin_photos where id=$1 and "userId"=$2',
      [firstCompletion.photo.id, patientA.id]
    );
    assert.equal(rows.rowCount, 1);
    assert.equal(rows.rows[0].capture_date, originalCaptureDate);
    assert.equal(rows.rows[0].skinScore, 0);
    const score = await db.query(
      'select "currentSkinScore","streakCount" from public.user_profiles where id=$1',
      [patientA.id]
    );
    assert.deepEqual(score.rows[0], { currentSkinScore: 0, streakCount: 0 });
    console.log('PASS lost-response retry preserves one row, original time/notes, zero score and streak');

    const recoveredIntent = await json(
      await call(`/photos/captures/${captureId}/upload-url`, patientA, 'POST', {}),
      200
    );
    assert.equal(recoveredIntent.photo.id, firstCompletion.photo.id);
    assert.equal(recoveredIntent.signedUrl, undefined);
    console.log('PASS completed intent returns the accepted photo');

    const otherOwnerIntent = await json(
      await call(`/photos/captures/${captureId}/upload-url`, patientB, 'POST', {}),
      200
    );
    const expectedPatientBId = uuidv5(captureId, patientB.id);
    assert.equal(otherOwnerIntent.storagePath, `${patientB.id}/${expectedPatientBId}.jpg`);
    assert.notEqual(otherOwnerIntent.storagePath, expectedPatientAPath);
    console.log('PASS capture identity remains isolated between owners');

    const ownerPhoto = await json(await call(`/photos/${firstCompletion.photo.id}`, patientA), 200);
    assert.equal(ownerPhoto.photo.id, firstCompletion.photo.id);
    const assigned = await json(await call(`/photos/patient/${patientA.id}`, assignedClinician), 200);
    assert(assigned.data.some(photo => photo.id === firstCompletion.photo.id));
    assert.equal((await call(`/photos/patient/${patientA.id}`, wrongClinician)).status, 404);
    assert.equal((await call(`/photos/${firstCompletion.photo.id}`, patientB)).status, 404);
    console.log('PASS owner and assigned clinician access; other owner and wrong clinician denied');
  } catch (error) {
    runError = error;
  }

  try {
    await cleanup();
    console.log('PASS removed exactly this run\'s synthetic rows, accounts and object paths');
  } catch (cleanupError) {
    if (!runError) runError = cleanupError;
    else console.error('Cleanup also failed:', cleanupError.code || cleanupError.message);
  }
  if (runError) throw runError;
}

run()
  .catch(error => {
    console.error('Photo capture live check failed:', error.message || error.code);
    process.exitCode = 1;
  })
  .finally(() => db.end());
