import express, { ErrorRequestHandler, Router } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

// Supabase's Send Email hook is authenticated by Standard Webhooks, not patient JWTs.
// Keep this router BEFORE express.json(): the signature covers the original bytes.
type HookEnv = Record<string, string | undefined>;
type Options = { env?: HookEnv; fetch?: typeof fetch };
type AuthEmail = { to: string; subject: string; text: string; html: string; link?: string };
const actions = ['signup', 'recovery', 'magiclink', 'invite', 'email_change', 'reauthentication'] as const;
const payloadSchema = z.object({
  user: z.object({ email: z.string().nullable().optional(), new_email: z.string().nullable().optional() }),
  email_data: z.object({
    email_action_type: z.enum(actions), token: z.string().optional(), token_hash: z.string().optional(),
    token_new: z.string().optional(), token_hash_new: z.string().optional(),
    site_url: z.string().min(1), redirect_to: z.string().optional(),
  }),
});
const copy: Record<typeof actions[number], [string, string]> = {
  signup: ['Confirm your email', 'Confirm your email address to continue with UNZIT.'],
  recovery: ['Reset your password', 'Use this link to reset your UNZIT password.'],
  magiclink: ['Sign in to UNZIT', 'Use this link to sign in to UNZIT.'],
  invite: ['Your UNZIT invitation', 'Accept your invitation to UNZIT.'],
  email_change: ['Confirm your email change', 'Confirm this email address for your UNZIT account.'],
  reauthentication: ['Your UNZIT verification code', 'Enter this code in UNZIT to confirm your request.'],
};
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, ch => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[ch]!));

export function buildAuthEmails(payload: unknown, supabaseUrl: string): AuthEmail[] {
  const { user, email_data: data } = payloadSchema.parse(payload);
  const [subject, instruction] = copy[data.email_action_type];
  function message(to: string, hash?: string): AuthEmail {
    z.string().email().parse(to);
    let link: string | undefined;
    let detail: string;
    if (data.email_action_type === 'reauthentication') {
      // Reauthentication uses updateUser({ password, nonce: token }); GET /verify
      // does not support this action. Never invent a link that would consume it.
      if (!data.token || !/^\d{6,10}$/.test(data.token)) throw new Error('Invalid nonce');
      detail = data.token;
    } else {
      if (!hash) throw new Error('Missing hash');
      const base = new URL(supabaseUrl);
      if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))) {
        throw new Error('Invalid Auth URL');
      }
      const verify = new URL('/auth/v1/verify', base);
      // Supabase GET /verify expects the hash in `token`, unlike POST verifyOtp.
      verify.searchParams.set('token', hash);
      verify.searchParams.set('type', data.email_action_type);
      verify.searchParams.set('redirect_to', data.redirect_to || data.site_url);
      link = verify.toString();
      detail = link;
    }
    const footer = 'If you did not request this, you can ignore this email.';
    return {
      to, subject, link,
      text: `UNZIT\n\n${instruction}\n\n${detail}\n\n${footer}`,
      html: `<!doctype html><html><body><h1>UNZIT</h1><p>${instruction}</p><p>${link
        ? `<a href="${escapeHtml(link)}">${subject}</a>` : `<strong>${escapeHtml(detail)}</strong>`}</p><p>${footer}</p></body></html>`,
    };
  }
  if (data.email_action_type === 'email_change') {
    if (!user.new_email) throw new Error('Missing new email');
    // Supabase's legacy naming is reversed: _new is the CURRENT email hash.
    const emails = data.token_hash_new ? [message(user.email, data.token_hash_new)] : [];
    emails.push(message(user.new_email, data.token_hash));
    return emails;
  }
  return [message(user.email, data.token_hash)];
}

function validSignature(body: Buffer, headers: Record<string, unknown>, secret: string | undefined): boolean {
  if (!secret || !/^v1,whsec_[A-Za-z0-9+/]+={0,2}$/.test(secret)) return false;
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const signatures = headers['webhook-signature'];
  if (typeof id !== 'string' || !id || typeof timestamp !== 'string' ||
      !/^\d+$/.test(timestamp) || typeof signatures !== 'string') return false;
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds) || Math.abs(Math.floor(Date.now() / 1000) - seconds) > 300) return false;
  const encodedKey = secret.slice('v1,whsec_'.length);
  const key = Buffer.from(encodedKey, 'base64');
  if (!key.length || key.toString('base64').replace(/=+$/, '') !== encodedKey.replace(/=+$/, '')) return false;
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.`).update(body).digest();
  return signatures.split(' ').some(signature => {
    if (!/^v1,[A-Za-z0-9+/]+={0,2}$/.test(signature)) return false;
    const candidate = Buffer.from(signature.slice(3), 'base64');
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  });
}

export function createSendEmailHook(options: Options = {}): Router {
  const router = Router();
  const env = options.env ?? process.env;
  const transport = options.fetch ?? globalThis.fetch;
  const fail = (res: express.Response, code: number, message: string) => res.status(code).json({ error: { http_code: code, message } });
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  router.post('/', express.raw({ type: '*/*', limit: '128kb', inflate: false }), async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !validSignature(req.body, req.headers, env.SEND_EMAIL_HOOK_SECRET)) {
      fail(res, 401, 'Invalid hook signature'); return;
    }
    let emails: AuthEmail[];
    try {
      emails = buildAuthEmails(JSON.parse(req.body.toString('utf8')), env.SUPABASE_URL!);
    } catch {
      fail(res, 400, 'Invalid email hook payload'); return;
    }
    if (!env.PAUBOX_API_KEY || !env.PAUBOX_FROM || /[\r\n]/.test(env.PAUBOX_FROM)) {
      fail(res, 500, 'Email provider is not configured'); return;
    }
    const controller = new AbortController();
    // One total budget, including BOTH emails on secure email change. Promise.race
    // also bounds a transport that does not honor abort. Never log upstream errors.
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('Deadline')); }, 5000);
    });
    try {
      await Promise.race([deadline, (async () => {
        await Promise.all(emails.map(async email => {
          const response = await transport('https://api.paubox.com/v1/email/messages', {
            method: 'POST', redirect: 'error', signal: controller.signal,
            headers: { Authorization: `Bearer ${env.PAUBOX_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: { message: {
              recipients: [email.to], headers: { from: env.PAUBOX_FROM, subject: email.subject },
              content: { 'text/plain': email.text, 'text/html': email.html },
            } } }),
          });
          // Do not read or log provider responses (may contain addresses/content).
          await response.body?.cancel();
          if (!response.ok) throw new Error('Provider rejected email');
        }));
      })()]);
      res.status(200).json({});
    } catch {
      fail(res, 502, 'Unable to send authentication email');
    } finally {
      clearTimeout(timer!);
      controller.abort();
    }
  });
  // Contain parser errors here: the global handler can log error/body metadata.
  router.use(((error, _req, res, _next) => {
    const code = error?.type === 'entity.too.large' ? 413 : 400;
    fail(res, code, 'Invalid email hook payload');
  }) as ErrorRequestHandler);
  return router;
}

export default createSendEmailHook();
