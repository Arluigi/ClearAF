// Operator-only hosted bootstrap. No dotenv loading or provider errors in logs.
const fs = require('node:fs');
const path = require('node:path');
const {z} = require('zod');
const {validateLaunchContent, publishLaunchContent} = require('./import-launch-content.cjs');
const {validateSettings, publishSettings} = require('./set-launch-settings.cjs');
const {parseWaitlist, importWaitlist} = require('./import-waitlist.cjs');
class BootstrapError extends Error {
  constructor(code) { super('Hosted bootstrap failed'); this.code = code; }
}
function guard(condition, code) { if (!condition) throw new BootstrapError(code); }
function url(value) {
  try { return new URL(value); } catch { throw new BootstrapError('INVALID_TARGET'); }
}
const uuid = z.string().uuid();
const versionLabel = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/);
const priceId = z.string().regex(/^price_[A-Za-z0-9_]+$/);
const optionsByCommand = {
  content: [], clinician: ['email', 'redirect'],
  settings: ['care-price', 'all-in-price', 'care-cents', 'all-in-cents', 'clinician-id', 'content-version'],
  waitlist: [], status: [],
};
function parseArgs(argv) {
  const [command, ...rest] = argv;
  guard(Object.hasOwn(optionsByCommand, command), 'INVALID_ARGUMENTS');
  const options = {command, apply: false}, seen = new Set();
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith('--')) {
      guard(command === 'waitlist' && !options.csv, 'INVALID_ARGUMENTS');
      options.csv = arg; continue;
    }
    const flag = arg.slice(2);
    guard(!seen.has(flag), 'INVALID_ARGUMENTS'); seen.add(flag);
    if (flag === 'apply') {
      guard(command !== 'status', 'INVALID_ARGUMENTS'); options.apply = true; continue;
    }
    guard(flag === 'project-ref' || optionsByCommand[command].includes(flag), 'INVALID_ARGUMENTS');
    const value = rest[++i];
    guard(typeof value === 'string' && value.length > 0 && !value.startsWith('--'), 'INVALID_ARGUMENTS');
    options[flag] = value;
  }
  guard(Boolean(options['project-ref']), 'INVALID_ARGUMENTS');
  for (const flag of optionsByCommand[command]) guard(Boolean(options[flag]), 'INVALID_ARGUMENTS');
  if (command === 'waitlist') guard(Boolean(options.csv), 'INVALID_ARGUMENTS');
  if (command === 'clinician') {
    options.email = parseWaitlist('email\n' + JSON.stringify(options.email))[0];
    const redirect = url(options.redirect);
    guard(redirect.protocol === 'https:' && !redirect.username && !redirect.password &&
      redirect.pathname === '/reset-password' && !redirect.search && !redirect.hash &&
      !isLocal(redirect.hostname), 'INVALID_REDIRECT');
  }
  if (command === 'settings') {
    guard(options['care-cents'] === '3900' && options['all-in-cents'] === '8900', 'INVALID_ARGUMENTS');
    options.settings = {
      careAmountCents: 3900, allInAmountCents: 8900,
      carePriceId: priceId.parse(options['care-price']), allInPriceId: priceId.parse(options['all-in-price']),
      clinicianId: uuid.parse(options['clinician-id']), contentVersion: versionLabel.parse(options['content-version']),
    };
  }
  return options;
}
function isLocal(host) {
  return host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
    /^(127\.|0\.|\[|::)/.test(host);
}
function validateEnvironment(env, projectRef, command) {
  guard(typeof projectRef === 'string' && /^[a-z]{20}$/.test(projectRef), 'INVALID_PROJECT_REF');
  for (const key of ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    guard(typeof env[key] === 'string' && env[key].trim().length > 0, 'MISSING_ENVIRONMENT');
  }
  if (command === 'settings' || env.STRIPE_SECRET_KEY !== undefined) {
    guard(typeof env.STRIPE_SECRET_KEY === 'string' && env.STRIPE_SECRET_KEY.startsWith('sk_test_'), 'TEST_STRIPE_KEY_REQUIRED');
  }
  const auth = url(env.SUPABASE_URL), database = url(env.DATABASE_URL);
  guard(!isLocal(auth.hostname) && !isLocal(database.hostname), 'LOCAL_TARGET_REFUSED');
  guard(auth.protocol === 'https:' && auth.hostname === projectRef + '.supabase.co' &&
    !auth.port && !auth.username && !auth.password && auth.pathname === '/' && !auth.search && !auth.hash,
    'PROJECT_MISMATCH');
  let user;
  try { user = decodeURIComponent(database.username); } catch { throw new BootstrapError('INVALID_TARGET'); }
  guard(['postgres:', 'postgresql:'].includes(database.protocol) && user === 'postgres.' + projectRef,
    'PROJECT_MISMATCH');
  // Session locks cannot use transaction pooling; only Supabase direct/session pooler hosts are accepted.
  guard(database.hostname === 'db.' + projectRef + '.supabase.co' ||
    /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(database.hostname), 'INVALID_DATABASE_HOST');
  guard(!database.port || database.port === '5432', 'SESSION_CONNECTION_REQUIRED');
  guard(database.pathname === '/postgres' && Boolean(database.password) && !database.hash, 'INVALID_TARGET');
  for (const [key, value] of database.searchParams) {
    guard(key === 'sslmode' && ['require', 'verify-ca', 'verify-full'].includes(value), 'INVALID_DATABASE_OPTIONS');
  }
  return {database, user, supabaseUrl: auth.origin, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    stripeKey: env.STRIPE_SECRET_KEY};
}
function pgOptions(target, ca) {
  // connectionString could let pg-connection-string replace explicit TLS options from URL parameters.
  guard(Boolean(ca), 'MISSING_CA');
  return {
    host: target.database.hostname, port: 5432, database: 'postgres', user: target.user,
    password: decodeURIComponent(target.database.password),
    ssl: {ca, rejectUnauthorized: true}, connectionTimeoutMillis: 10000, statement_timeout: 15000,
  };
}
function assertOperatorPath(file) {
  guard(!String(file).split(/[\\/]/).some(part =>
    part.startsWith('.env') && part !== '.env.example' || part === 'Local.generated.xcconfig'), 'SOURCE_REFUSED');
}
function readOperatorFile(file) {
  assertOperatorPath(file);
  const resolved = fs.realpathSync(file);
  assertOperatorPath(resolved);
  const stat = fs.statSync(resolved);
  guard(stat.isFile() && stat.size <= 10 * 1024 * 1024, 'SOURCE_REFUSED');
  return fs.readFileSync(resolved, 'utf8');
}
async function safeAdminFetch(input, init, fetcher = fetch) {
  // auth-js logs thrown fetch errors internally. Never give it a raw transport/provider failure.
  try {
    const response = await fetcher(input, {...init, signal: AbortSignal.timeout(10000), redirect: 'error'});
    if (response.ok) return response;
  } catch { /* Convert even thrown transport errors to a fixed, parseable Auth response. */ }
  return new Response('{"msg":"Hosted bootstrap request failed"}', {
    status: 503, headers: {'Content-Type': 'application/json'},
  });
}
const defaultDependencies = {
  readFile: readOperatorFile,
  createDb: options => new (require('pg').Client)(options),
  createAdmin: (authUrl, key) => require('@supabase/supabase-js').createClient(authUrl, key, {
    auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
    global: {fetch: safeAdminFetch},
  }),
  retrievePrice: async (id, key) => {
    const response = await fetch('https://api.stripe.com/v1/prices/' + encodeURIComponent(id), {
      headers: {Authorization: 'Bearer ' + key}, signal: AbortSignal.timeout(10000), redirect: 'error',
    });
    guard(response.ok, 'STRIPE_PRICE_UNAVAILABLE'); return response.json();
  },
  log: value => console.log(value), error: value => console.error(value),
};
async function clinicians(db) {
  return (await db.query('SELECT id,email FROM public.dermatologists ORDER BY id LIMIT 2')).rows;
}
async function ensureClinician(db, admin, options) {
  const {email, redirect, apply} = options;
  if (apply) await db.query('SELECT pg_advisory_lock(142020, 1)');
  try {
    const existing = await clinicians(db);
    guard(existing.length <= 1 && (!existing.length || existing[0].email.toLowerCase() === email), 'CLINICIAN_CONFLICT');
    const users = (await db.query('SELECT id,email FROM auth.users WHERE lower(email)=$1 LIMIT 2', [email])).rows;
    guard(users.length <= 1 && (!existing.length || users.length === 1 && existing[0].id === users[0].id && existing[0].email === users[0].email), 'CLINICIAN_CONFLICT');
    guard((await db.query('SELECT version FROM public.launch_settings WHERE active')).rows.length === 1, 'MISSING_SETTINGS');
    let user = users[0], invited = 0;
    if (!apply) return {applied: 0, invited: 0, wouldInvite: user ? 0 : 1,
      wouldEnsureClinicians: 1, wouldEnsureProfiles: 1, ...(user ? {clinicianId: uuid.parse(user.id)} : {})};
    // Commit allowlisting before the Admin request so Auth's signup trigger can see it.
    await importWaitlist(db, 'email\n' + JSON.stringify(email), {apply: true});
    if (!user) {
      const result = await admin.auth.admin.inviteUserByEmail(email, {redirectTo: redirect, data: {name: 'Launch Clinician'}});
      guard(!result.error && result.data?.user, 'INVITATION_FAILED'); user = result.data.user; invited = 1;
    }
    const clinicianId = uuid.parse(user.id);
    guard(typeof user.email === 'string' && user.email.toLowerCase() === email, 'CLINICIAN_CONFLICT');
    await db.query('BEGIN');
    try {
      // Same shape as photo-capture-live.cjs; Auth owns credentials and the profile trigger.
      await db.query('INSERT INTO public.dermatologists (id,name,email,password,"createdAt","updatedAt") VALUES ($1,$2,$3,$4,now(),now()) ON CONFLICT (id) DO NOTHING',
        [clinicianId, 'Launch Clinician', user.email, 'UNUSED_SUPABASE_AUTH']);
      await db.query('INSERT INTO public.user_profiles (id,name,"createdAt","updatedAt") VALUES ($1,$2,now(),now()) ON CONFLICT (id) DO NOTHING',
        [clinicianId, 'Launch Clinician']);
      await db.query('COMMIT');
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    return {applied: 1, invited, clinicianId, clinicians: 1, profiles: 1};
  } finally { if (apply) await db.query('SELECT pg_advisory_unlock(142020, 1)'); }
}
async function status(db) {
  const active = (await db.query('SELECT version,"contentVersion","carePriceId","allInPriceId" FROM public.launch_settings WHERE active')).rows[0];
  const clinicianCount = (await db.query('SELECT count(*) AS count FROM public.dermatologists')).rows[0].count;
  const allowlist = (await db.query('SELECT count(*) AS count FROM public.launch_allowlist')).rows[0].count;
  const migrations = (await db.query('SELECT count(*) AS count FROM supabase_migrations.schema_migrations')).rows[0].count;
  return {activeContentVersion: active ? versionLabel.parse(active.contentVersion) : null,
    activeSettingsVersion: active ? z.number().int().positive().parse(active.version) : null,
    carePriceId: active?.carePriceId == null ? null : priceId.parse(active.carePriceId),
    allInPriceId: active?.allInPriceId == null ? null : priceId.parse(active.allInPriceId),
    clinicianCount: Number(clinicianCount), allowlistCount: Number(allowlist), migrationCount: Number(migrations)};
}
async function executeCommand(db, deps, options, target) {
  if (options.command === 'status') return await status(db);
  if (options.command === 'clinician') return await ensureClinician(db,
    options.apply ? deps.createAdmin(target.supabaseUrl, target.serviceRoleKey) : null, options);
  if (options.command === 'waitlist') return await importWaitlist(db, deps.readFile(options.csv), {apply: options.apply});
  if (options.command === 'content') {
    const rows = await clinicians(db); guard(rows.length === 1, 'SINGLE_CLINICIAN_REQUIRED');
    const source = JSON.parse(deps.readFile(path.join(__dirname, '../src/content/catalogs/1.0-pending-review.json')));
    const publication = validateLaunchContent({...source, clinicianId: rows[0].id}, deps.validators);
    if (!options.apply) return {applied: 0, wouldPublish: 1, clinicianId: rows[0].id,
      documents: publication.content.consents.length, templates: publication.templates.length};
    return await publishLaunchContent(db, publication);
  }
  const settings = await validateSettings(options.settings, id => deps.retrievePrice(id, target.stripeKey),
    async id => { const rows = await clinicians(db); return rows.length === 1 && rows[0].id === id; });
  if (!options.apply) return {published: 0, wouldPublish: 1};
  return await publishSettings(db, settings);
}
async function runHosted(argv, env, injected = {}) {
  const options = parseArgs(argv), target = validateEnvironment(env, options['project-ref'], options.command);
  const deps = {...defaultDependencies, ...injected};
  const db = deps.createDb(pgOptions(target, deps.readFile(path.join(__dirname, '../certs/supabase-prod-ca-2021.crt'))));
  // pg emits socket/idle failures outside query promises. Keep no raw error object or diagnostics.
  let connectionFailed = false;
  db.on?.('error', () => { connectionFailed = true; });
  try {
    await db.connect();
    guard(!connectionFailed, 'DATABASE_CONNECTION_FAILED');
    const result = await executeCommand(db, deps, options, target);
    guard(!connectionFailed, 'DATABASE_CONNECTION_FAILED');
    return result;
  } finally { await db.end(); }
}
async function main(argv, env, injected = {}) {
  const deps = {...defaultDependencies, ...injected};
  try { deps.log(JSON.stringify(await runHosted(argv, env, deps))); return 0; }
  catch (error) {
    // Arbitrary provider messages, stack traces and codes can contain credentials or addresses.
    deps.error('Hosted bootstrap failed (' + (error instanceof BootstrapError ? error.code : 'OPERATION_FAILED') + ')'); return 1;
  }
}
if (require.main === module) main(process.argv.slice(2), process.env).then(code => { process.exitCode = code; });
module.exports = {parseArgs, validateEnvironment, pgOptions, readOperatorFile, safeAdminFetch, ensureClinician, runHosted, main};
