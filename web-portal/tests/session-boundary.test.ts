import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SessionBoundary, recoveryCallback } from '../src/lib/session-boundary';
test('identity switches invalidate old work, including A to B to A', () => {
  const gate = new SessionBoundary(); gate.accept('A'); const generation = gate.snapshot();
  gate.accept('A'); gate.assert(generation);
  gate.accept('B'); assert.throws(() => gate.assert(generation), /changed/);
  gate.accept('A'); assert.throws(() => gate.assert(generation), /changed/);
});
test('logout invalidates late responses', async () => {
  const gate = new SessionBoundary(); gate.accept('A'); const generation = gate.snapshot();
  const pending = Promise.resolve().then(() => gate.assert(generation)); gate.accept(null);
  await assert.rejects(pending, /changed/);
});
test('recovery requires explicit valid callback, never just an existing session', () => {
  assert.equal(recoveryCallback('https://portal.test/reset-password').kind, 'invalid');
  assert.equal(recoveryCallback('https://portal.test/reset-password?error=access_denied&error_code=otp_expired').kind, 'invalid');
  assert.equal(recoveryCallback('https://portal.test/reset-password?code=abc').kind, 'code');
  assert.equal(recoveryCallback('https://portal.test/reset-password#type=recovery&access_token=a&refresh_token=b').kind, 'invalid');
  assert.equal(recoveryCallback('https://portal.test/reset-password#type=signup&access_token=a&refresh_token=b').kind, 'invalid');
});
