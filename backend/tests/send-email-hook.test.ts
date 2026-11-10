import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import express from 'express';
import { createServer } from 'node:http';
import { buildAuthEmails, createSendEmailHook } from '../src/routes/send-email-hook';

const key = Buffer.from('synthetic-hook-key-for-tests-only!').toString('base64');
const env = {
  SEND_EMAIL_HOOK_SECRET: `v1,whsec_${key}`, PAUBOX_API_KEY: 'synthetic-api-key',
  PAUBOX_API_USERNAME: 'synthetic-account', PAUBOX_FROM: 'UNZIT <hello@example.invalid>',
  SUPABASE_URL: 'https://auth.example.invalid',
};
const payload = (action = 'signup') => ({
  user: { email: 'current@example.invalid', new_email: 'new@example.invalid' },
  email_data: { email_action_type: action, token_hash: 'new-or-primary-hash', token: '123456',
    site_url: 'https://app.example.invalid', redirect_to: 'unzit://auth/callback?a=1&b=2' },
});
function headers(body: string, offset = 0) {
  const timestamp = String(Math.floor(Date.now() / 1000) + offset);
  const signature = createHmac('sha256', Buffer.from(key, 'base64'))
    .update(`test-id.${timestamp}.`).update(body).digest('base64');
  return { 'content-type': 'application/json', 'webhook-id': 'test-id',
    'webhook-timestamp': timestamp, 'webhook-signature': `v1,${signature}` };
}
async function withHook(run: (url: string) => Promise<void>, transport: typeof fetch = async () => new Response('{}'), config = env) {
  const app = express();
  app.use('/api/auth-hooks/send-email', createSendEmailHook({ env: config, fetch: transport }));
  app.use(express.json());
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  try { await run(`http://127.0.0.1:${address.port}/api/auth-hooks/send-email`); }
  finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

test('valid raw signature sends expected Paubox envelope without patient authentication', async () => {
  const body = JSON.stringify(payload(), null, 2);
  let calls = 0;
  await withHook(async url => {
    const res = await fetch(url, { method: 'POST', headers: headers(body), body });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {});
    assert.equal(calls, 1);
  }, async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.paubox.com/v1/email/messages');
    assert.equal((init!.headers as Record<string,string>).Authorization, `Bearer ${env.PAUBOX_API_KEY}`);
    assert.equal(init!.redirect, 'error');
    assert.ok(init!.signal);
    const { data: { message } } = JSON.parse(init!.body as string);
    assert.deepEqual(message.recipients, ['current@example.invalid']);
    assert.equal(message.headers.from, env.PAUBOX_FROM);
    assert.match(message.content['text/plain'], /UNZIT/);
    assert.doesNotMatch(message.content['text/html'], /<img|tracking|user_metadata/i);
    return new Response('{}');
  });
});
for (const scenario of ['missing', 'invalid', 'expired', 'future', 'changed-body', 'malformed-timestamp']) {
  test(`${scenario} signature is rejected with 401 before sending`, async () => {
    const body = JSON.stringify(payload());
    let calls = 0;
    await withHook(async url => {
      const h = headers(body, scenario === 'expired' ? -301 : scenario === 'future' ? 301 : 0);
      if (scenario === 'missing') delete h['webhook-signature'];
      if (scenario === 'invalid') h['webhook-signature'] = 'v1,bad';
      if (scenario === 'malformed-timestamp') h['webhook-timestamp'] += 'junk';
      const res = await fetch(url, { method: 'POST', headers: h, body: body + (scenario === 'changed-body' ? ' ' : '') });
      assert.equal(res.status, 401);
      assert.deepEqual(await res.json(), { error: { http_code: 401, message: 'Invalid hook signature' } });
      assert.equal(calls, 0);
    }, async () => { calls++; return new Response('{}'); });
  });
}
test('accepts any matching v1 signature in rotation header', async () => {
  const body = JSON.stringify(payload());
  await withHook(async url => {
    const h = headers(body); h['webhook-signature'] = `v2,unknown v1,invalid ${h['webhook-signature']}`;
    assert.equal((await fetch(url, { method: 'POST', headers: h, body })).status, 200);
  });
});
for (const action of ['signup', 'recovery', 'magiclink', 'invite', 'email_change']) {
  test(`${action} creates the Supabase GET verify link with encoded redirect and hash`, () => {
    const [email] = buildAuthEmails(payload(action), env.SUPABASE_URL);
    const link = new URL(email.link!);
    assert.equal(link.origin, env.SUPABASE_URL);
    assert.equal(link.pathname, '/auth/v1/verify');
    assert.equal(link.searchParams.get('token'), 'new-or-primary-hash');
    assert.equal(link.searchParams.get('type'), action);
    assert.equal(link.searchParams.get('redirect_to'), payload().email_data.redirect_to);
    assert.equal(email.to, action === 'email_change' ? 'new@example.invalid' : 'current@example.invalid');
  });
}
test('empty redirect falls back to site_url', () => {
  const p = payload(); p.email_data.redirect_to = '';
  const [email] = buildAuthEmails(p, env.SUPABASE_URL);
  assert.equal(new URL(email.link!).searchParams.get('redirect_to'), p.email_data.site_url);
});
test('secure email change sends separate messages with reversed Supabase hash mapping', () => {
  const p = payload('email_change');
  Object.assign(p.email_data, { token_hash_new: 'current-hash', token_new: '654321' });
  const emails = buildAuthEmails(p, env.SUPABASE_URL);
  assert.equal(emails.length, 2);
  assert.equal(emails[0].to, 'current@example.invalid');
  assert.equal(new URL(emails[0].link!).searchParams.get('token'), 'current-hash');
  assert.equal(emails[1].to, 'new@example.invalid');
  assert.equal(new URL(emails[1].link!).searchParams.get('token'), 'new-or-primary-hash');
});
test('reauthentication uses the nonce code, never an unsupported verify link', () => {
  const p = payload('reauthentication'); p.email_data.token_hash = '';
  const [email] = buildAuthEmails(p, env.SUPABASE_URL);
  assert.equal(email.link, undefined);
  assert.match(email.text, /123456/);
  assert.match(email.html, /123456/);
  assert.doesNotMatch(email.text, /\/verify/);
});
for (const failure of ['http', 'network', 'timeout']) {
  test(`Paubox ${failure} failure has safe Supabase error shape and no sensitive logs`, async () => {
    const body = JSON.stringify(payload());
    const logs: unknown[] = [];
    const originals = [console.log, console.warn, console.error, console.info];
    for (const method of ['log', 'warn', 'error', 'info'] as const) console[method] = (...args) => { logs.push(args); };
    try {
      await withHook(async url => {
        const res = await fetch(url, { method: 'POST', headers: headers(body), body });
        assert.equal(res.status, 502);
        assert.deepEqual(await res.json(), { error: { http_code: 502, message: 'Unable to send authentication email' } });
        assert.equal(JSON.stringify(logs), '[]');
      }, async (_url, init) => {
        if (failure === 'http') return new Response('private upstream body', { status: 403 });
        if (failure === 'network') throw new Error(body + env.PAUBOX_API_KEY);
        return new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('private timeout details')), { once: true }));
      });
    } finally {
      [console.log, console.warn, console.error, console.info] = originals;
    }
  });
}
test('malformed signed payload is sanitized and never sent', async () => {
  for (const body of ['{broken', JSON.stringify(payload('unsupported')), JSON.stringify({ user: {} })]) {
    await withHook(async url => {
      const res = await fetch(url, { method: 'POST', headers: headers(body), body });
      assert.equal(res.status, 400);
      assert.deepEqual(await res.json(), { error: { http_code: 400, message: 'Invalid email hook payload' } });
    }, async () => { assert.fail('must not send invalid payload'); });
  }
});

test('email change can add an initial email to a phone-only account', () => {
  const p = payload('email_change'); p.user.email = '';
  const [email] = buildAuthEmails(p, env.SUPABASE_URL);
  assert.equal(email.to, 'new@example.invalid');
});
test('unused new_email may be empty on other actions', () => {
  const p = payload(); p.user.new_email = '';
  assert.equal(buildAuthEmails(p, env.SUPABASE_URL)[0].to, 'current@example.invalid');
});
test('secure email change sends two private recipient envelopes within the shared deadline', async () => {
  const p = payload('email_change'); Object.assign(p.email_data, { token_hash_new: 'current-hash', token_new: '654321' });
  const body = JSON.stringify(p);
  const recipients: string[][] = [];
  await withHook(async url => {
    assert.equal((await fetch(url, { method: 'POST', headers: headers(body), body })).status, 200);
    assert.deepEqual(recipients, [['current@example.invalid'], ['new@example.invalid']]);
  }, async (_url, init) => {
    recipients.push(JSON.parse(init!.body as string).data.message.recipients);
    return new Response('{}');
  });
});
test('raw parser failures are contained with safe error JSON', async () => {
  const body = 'x'.repeat(129 * 1024);
  await withHook(async url => {
    const res = await fetch(url, { method: 'POST', headers: headers(body), body });
    assert.equal(res.status, 413);
    assert.deepEqual(await res.json(), { error: { http_code: 413, message: 'Invalid email hook payload' } });
  }, async () => { assert.fail('oversized body must not send'); });
});
