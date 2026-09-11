// Local-only real signup, confirmation, onboarding, restoration and recovery.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');
require('dotenv').config({ quiet: true });
const origin = process.env.SUPABASE_URL;
const api = process.env.SECURITY_API_URL;
for (const value of [origin, api, process.env.DATABASE_URL]) {
  const url = new URL(value);
  assert(['http:', 'https:', 'postgres:', 'postgresql:'].includes(url.protocol));
  assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && !url.search && !url.hash, 'Only local test environments allowed');
}
const make = () => createClient(origin, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = createClient(origin, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const db = new Client({ connectionString: process.env.DATABASE_URL });
const ids = [], mailIDs = [];
const passed = [];
const ok = name => { passed.push(name); console.log('PASS ' + name); };
async function mailLink(email, type) {
  const mailOrigin = 'http://127.0.0.1:54324';
  for (let attempt = 0; attempt < 30; attempt++) {
    const list = await (await fetch(mailOrigin + '/api/v1/messages')).json();
    for (const item of list.messages || []) {
      if (!(item.To || []).some(to => to.Address === email)) continue;
      const message = await (await fetch(mailOrigin + '/api/v1/message/' + item.ID)).json();
      const links = (message.HTML || '').match(/https?:[^"<>\s]+/g) || [];
      const link = links.map(x => x.replaceAll('&amp;', '&')).find(x => x.includes('type=' + type));
      if (link) { mailIDs.push(item.ID); assert.equal(new URL(link).origin, origin); return link; }
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw Error('Expected local test email was not captured');
}
const request = (path, token, method = 'GET', body) => fetch(api + path, {
  method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined
});
async function main() {
  await db.connect();
  try {
    const client = make();
    const email = 'clearaf-accounts-' + crypto.randomUUID() + '@example.invalid';
    const password = crypto.randomBytes(24).toString('base64url');
    const signup = await client.auth.signUp({ email, password, options: { data: { name: 'Synthetic Patient', skinType: 'Normal', userType: 'dermatologist' } } });
    assert.ifError(signup.error); ids.push(signup.data.user.id);
    assert.equal(signup.data.session, null);
    assert((await make().auth.signInWithPassword({ email, password })).error);
    ok('signup requires email confirmation and cannot sign in early');
    const confirmation = new URL(await mailLink(email, 'signup'));
    const verified = await client.auth.verifyOtp({ token_hash: confirmation.searchParams.get('token'), type: 'signup' });
    assert.ifError(verified.error);
    let token = verified.data.session.access_token;
    let profile = await request('/users/profile', token);
    assert.equal(profile.status, 200);
    let user = (await profile.json()).user;
    assert.equal(user.userType, 'patient'); assert.equal(user.onboardingCompleted, false);
    assert.equal((await request('/users/patients', token)).status, 403);
    ok('confirmation creates patient profile; clinician metadata cannot grant access');
    const invalid = await request('/users/profile', token, 'PATCH', { onboardingCompleted: true });
    assert.equal(invalid.status, 400);
    const updated = await request('/users/profile', token, 'PATCH', { name: 'Persisted Synthetic Name', skinType: 'Sensitive', onboardingCompleted: true });
    assert.equal(updated.status, 200);
    const login = await make().auth.signInWithPassword({ email, password });
    assert.ifError(login.error);
    const restored = await make().auth.setSession({ access_token: login.data.session.access_token, refresh_token: login.data.session.refresh_token });
    assert.ifError(restored.error);
    user = await (await request('/users/profile', restored.data.session.access_token)).json();
    assert.equal(user.user.name, 'Persisted Synthetic Name'); assert.equal(user.user.skinType, 'Sensitive'); assert.equal(user.user.onboardingCompleted, true);
    ok('onboarding validates required fields and survives a fresh restored session');
    assert.equal((await request('/auth/status', token)).status, 200);
    await admin.auth.admin.signOut(token, 'global');
    assert.equal((await request('/auth/status', token)).status, 401);
    assert.equal((await request('/users/profile', token)).status, 401);
    ok('revoked sessions fail both account status and profile access');
    const recovery = make();
    assert.ifError((await recovery.auth.resetPasswordForEmail(email, { redirectTo: 'http://localhost:3000/reset-password' })).error);
    const resetLink = new URL(await mailLink(email, 'recovery'));
    const invalidOTP = await make().auth.verifyOtp({ token_hash: 'invalid-synthetic-token', type: 'recovery' });
    assert(invalidOTP.error);
    const reset = await recovery.auth.verifyOtp({ token_hash: resetLink.searchParams.get('token'), type: 'recovery' });
    assert.ifError(reset.error);
    const newPassword = crypto.randomBytes(24).toString('base64url');
    assert.ifError((await recovery.auth.updateUser({ password: newPassword })).error);
    assert.ifError((await recovery.auth.signOut({ scope: 'global' })).error);
    assert((await make().auth.signInWithPassword({ email, password })).error);
    const newLogin = await make().auth.signInWithPassword({ email, password: newPassword });
    assert.ifError(newLogin.error);
    assert.equal((await request('/users/profile', newLogin.data.session.access_token)).status, 200);
    assert((await make().auth.verifyOtp({ token_hash: resetLink.searchParams.get('token'), type: 'recovery' })).error);
    ok('real recovery email resets password; old password and reused link fail');
    const deletion = await request('/users/account', newLogin.data.session.access_token, 'DELETE');
    assert.equal(deletion.status, 404);
    assert.equal((await request('/users/profile', newLogin.data.session.access_token)).status, 200);
    ok('unsupported account deletion does not remove clinical records');
  } finally {
    for (const id of ids) {
      const result = await admin.auth.admin.deleteUser(id); assert.ifError(result.error);
      await db.query('DELETE FROM public.user_profiles WHERE id=$1', [id]);
    }
    for (const id of [...new Set(mailIDs)]) await fetch('http://127.0.0.1:54324/api/v1/messages', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ IDs: [id] }) });
    await db.end();
  }
  console.log(`${passed.length} account-flow groups passed; synthetic identities cleaned up.`);
}
main().catch(error => { console.error('Account verification failed:', error.message); process.exitCode = 1; });
