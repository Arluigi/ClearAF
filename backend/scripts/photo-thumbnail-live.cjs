// Exercises private thumbnails against loopback-only API, Auth, DB and Storage.
// Every fixture has a unique run identity and cleanup targets only recorded IDs/paths.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const sharp = require('sharp');

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
  'PHOTO_THUMBNAIL_API_URL',
  process.env.PHOTO_THUMBNAIL_API_URL || 'http://127.0.0.1:3001/api',
  ['http:']
);
assert(['/api', '/api/'].includes(apiUrl.pathname), 'PHOTO_THUMBNAIL_API_URL path must be /api');
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
const accounts = [];
const photoIds = [];
const storagePaths = [];
async function createAccount(role) {
  const account = {
    role,
    email: `clearaf-thumbnail-${runId}-${role.toLowerCase()}@example.invalid`,
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
  try {
    const owner = await createAccount('patientOwner');
    const foreign = await createAccount('patientForeign');
    const clinician = await createAccount('clinicianAssigned');
    const outsider = await createAccount('clinicianForeign');
    for (const account of [clinician, outsider]) {
      await db.query('insert into public.dermatologists (id,name,email,password,"createdAt","updatedAt") values ($1,$2,$3,$4,now(),now())',
        [account.id, 'Synthetic Thumbnail Clinician', account.email, 'UNUSED_SUPABASE_AUTH']);
    }
    await db.query('update public.user_profiles set "dermatologistId"=$2 where id=$1', [owner.id, clinician.id]);
    for (const account of accounts) await signIn(account);
    const id = crypto.randomUUID(), objectPath = `${owner.id}/${id}.jpg`;
    photoIds.push(id); storagePaths.push(objectPath);
    const original = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#739586' } })
      .withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const uploaded = await admin.storage.from('patient-photos').upload(objectPath, original, { contentType: 'image/jpeg', upsert: false });
    assert.ifError(uploaded.error);
    await db.query('insert into public.skin_photos (id,"userId","photoUrl",notes,"createdAt","updatedAt") values ($1,$2,$3,$4,now(),now())',
      [id, owner.id, objectPath, 'Synthetic thumbnail authorization proof']);
    const summaries = await json(await call(`/photos/patient/${owner.id}?view=summary`, clinician), 200);
    assert.equal(summaries.data.length, 1); assert.equal('photoUrl' in summaries.data[0], false);
    console.log('PASS live summary returns metadata without original URL');
    let expected;
    for (const account of [owner, clinician]) {
      const response = await call(`/photos/${id}/thumbnail`, account);
      assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.match(response.headers.get('content-type'), /^image\/jpeg/);
      const bytes = Buffer.from(await response.arrayBuffer());
      const info = await sharp(bytes).metadata();
      assert.ok(info.width <= 400 && info.height <= 400); assert.equal(info.format, 'jpeg'); assert.equal(info.exif, undefined);
      if (expected) assert.deepEqual(bytes, expected); else expected = bytes;
      console.log(`PASS live ${account.role} thumbnail ${info.width}x${info.height} JPEG ${bytes.length} bytes, EXIF absent, private no-store`);
    }
    for (const endpoint of ['thumbnail', 'original']) {
      for (const account of [undefined, foreign, outsider]) {
        assert.equal((await call(`/photos/${id}/${endpoint}`, account)).status, account ? 404 : 401);
      }
    }
    const detail = await json(await call(`/photos/${id}/original`, clinician), 200);
    assert.equal(new URL(detail.photoUrl).origin, new URL(supabaseUrl).origin);
    const originalResponse = await fetch(detail.photoUrl);
    assert.equal(originalResponse.status, 200); assert.deepEqual(Buffer.from(await originalResponse.arrayBuffer()), original);
    console.log('PASS live original authorized on demand; foreign patient/clinician and anonymous denied for both endpoints');
    await db.query('update public.user_profiles set "dermatologistId"=$2 where id=$1', [owner.id, outsider.id]);
    for (const endpoint of ['thumbnail', 'original']) {
      assert.equal((await call(`/photos/${id}/${endpoint}`, clinician)).status, 404);
      assert.equal((await call(`/photos/${id}/${endpoint}`, outsider)).status, 200);
    }
    console.log('PASS live warm thumbnail and original deny former clinician and allow newly assigned clinician');
    await db.query('update public.skin_photos set "photoUrl"=$2 where id=$1 and "userId"=$3', [id, `${foreign.id}/foreign.jpg`, owner.id]);
    for (const endpoint of ['thumbnail', 'original']) assert.equal((await call(`/photos/${id}/${endpoint}`, owner)).status, 422);
    console.log('PASS live warm cache cannot bypass foreign stored-path rejection');
  } finally {
    try {
      await cleanup();
      const rows = await db.query('select id from public.skin_photos where id=any($1::uuid[])', [photoIds]);
      assert.equal(rows.rowCount, 0);
      for (const objectPath of storagePaths) {
        const result = await admin.storage.from('patient-photos').info(objectPath);
        assert.ok(result.error);
      }
      console.log('PASS exact fixture cleanup: photo rows, objects, accounts and clinician records removed');
    } finally { await db.end(); }
  }
}
run().catch(error => { console.error(`FAIL thumbnail live check (${error.code || error.name || 'error'})`); process.exitCode = 1; });
