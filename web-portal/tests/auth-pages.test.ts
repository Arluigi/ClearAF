import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AuthShell from '../src/components/layout/AuthShell';
import { read } from './letterpress-rules';

test('auth shell: wordmark placeholder, serif title, ink quote panel and the real session behaviour in mono', () => {
  const html = renderToStaticMarkup(h(AuthShell, { eyebrow: 'Clinician portal', title: 'Sign in' }, h('p', null, 'Form')));
  assert.match(html, /data-placeholder="wordmark"/);
  assert.match(html, /<h1 class="[^"]*editorial-title[^"]*">Sign in<\/h1>/);
  assert.match(html, /class="meta-mono">Signed-in sessions stay in this browser until you sign out or the session is revoked</);
  assert.match(html, /class="[^"]*bg-ink[^"]*text-canvas/);
  assert.doesNotMatch(html, /HIPAA|30 min|idle/i);
});

test('sign in, register and password pages share the split shell; sign in has one 44px filled action and no card or glyph', () => {
  const login = read('src/app/login/page.tsx');
  assert.match(login, /<AuthShell eyebrow="Clinician portal" title="Sign in">/);
  assert.match(login, /<Button type="submit" size="lg" className="w-full"/);
  assert.match(login, /'Signing in…' : 'Sign in'/);
  assert.match(login, /<Label htmlFor="email">Work email<\/Label>/);
  assert.match(login, /a password of at least 6 characters to continue\./);
  assert.doesNotMatch(login, /Card|Stethoscope|Sign In|Welcome back|Alert/);
  for (const page of ['register', 'forgot-password', 'reset-password']) assert.match(read(`src/app/${page}/page.tsx`), /<AuthShell /, page);
});

test('account is a read-only profile; practice, notifications, session timeout and audit export are not shown', () => {
  const account = read('src/app/account/page.tsx');
  for (const label of ['Display name', 'Work email', 'Change password', 'Sign out']) assert.ok(account.includes(label), label);
  assert.doesNotMatch(account, /practice|notification|session timeout|audit|save profile|<Card/i);
  // No duplicated "Signed in as <email>" eyebrow above the title; Work email already appears in the profile rows.
  assert.doesNotMatch(account, /Signed in as/);
  assert.match(account, /Change password sends a reset email/);
});

test('care status and decisions are said in words: no warning glyphs or destructive badges', () => {
  for (const file of ['src/components/patients/CareStatusCard.tsx', 'src/components/patients/CareDecisionDialog.tsx']) {
    assert.doesNotMatch(read(file), /AlertTriangle|'destructive'|attention-/, file);
  }
  assert.match(read('src/components/patients/CareStatusCard.tsx'), /stamp\(decision\.createdAt\)/);
});
