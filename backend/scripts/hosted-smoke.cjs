// Operator-only hosted smoke. Never load dotenv, log provider errors, or persist credentials.
const crypto = require('node:crypto');
const path = require('node:path');
const bootstrap = require('./hosted-bootstrap.cjs');
const {importWaitlist} = require('./import-waitlist.cjs');
const PROJECT_REF = 'lhaqeeitxiynzcpqbwpb';
const API_URL = 'https://unzit-api-593272381529.us-east1.run.app/api';
const VERSION = '2.2-pending-review';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
class SmokeError extends Error {
  constructor(code, status) { super(code); this.code = code; if (status) this.status = status; }
}
const check = (condition, code) => { if (!condition) throw new SmokeError(code); };
function parseArgs(argv) {
  check(argv.length === 2 && argv[0] === '--project-ref' && argv[1] === PROJECT_REF, 'INVALID_ARGUMENTS');
  return {projectRef: argv[1]};
}
function validateEnvironment(env, ref) {
  check(ref === PROJECT_REF, 'PROJECT_MISMATCH');
  for (const key of ['DATABASE_URL','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY','STRIPE_SECRET_KEY']) {
    check(typeof env[key] === 'string' && env[key].trim().length > 0, 'MISSING_ENVIRONMENT');
  }
  check(!env.HOSTED_API_URL || env.HOSTED_API_URL === API_URL, 'API_TARGET_REFUSED');
  check(env.NODE_TLS_REJECT_UNAUTHORIZED !== '0', 'TLS_REQUIRED');
  // Reuse the bootstrap's exact host/user, session-pooler and TLS-option validation.
  try { return {...bootstrap.validateEnvironment(env, ref, 'settings'), anonKey: env.SUPABASE_ANON_KEY}; }
  catch { throw new SmokeError('ENVIRONMENT_REFUSED'); }
}
const pgOptions = bootstrap.pgOptions;
const ident = value => { check(typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(value), 'SCHEMA_REFUSED'); return '"' + value + '"'; };
const qualified = table => 'public.' + ident(table);
function syntheticIdentity(state) {
  check(/^unzit-smoke-[0-9]{13,30}@example\.invalid$/.test(state.email), 'IDENTITY_REFUSED');
  if (state.patientId) check(UUID.test(state.patientId), 'IDENTITY_REFUSED');
}
// These nullable back-pointers make cycles; all other FK edges remain in child-first ordering.
function backPointer(fk) {
  return fk.child === 'launch_cases' && ['identityId','intakeId','photoSetId'].includes(fk.childColumns[0]) ||
    fk.child === 'launch_check_ins' && ['photoSetId','responseId'].includes(fk.childColumns[0]);
}
function cleanupPlan(columns, foreignKeys) {
  const byTable = new Map();
  for (const {table, column} of columns) {
    ident(table); ident(column);
    if (!byTable.has(table)) byTable.set(table, []);
    byTable.get(table).push(column);
  }
  for (const fk of foreignKeys) {
    ident(fk.child); ident(fk.parent);
    check(fk.childColumns.length > 0 && fk.childColumns.length === fk.parentColumns.length, 'SCHEMA_REFUSED');
    fk.childColumns.forEach(ident); fk.parentColumns.forEach(ident);
  }
  const selectors = new Map();
  for (const [table, names] of byTable) {
    const owned = names.filter(c => c === 'patientId' || c === 'userId' || table === 'user_profiles' && c === 'id' || table === 'messages' && ['senderId','recipientId'].includes(c));
    if (owned.length) selectors.set(table, alias => '(' + owned.map(c => alias + '.' + ident(c) + '::text=$1').join(' OR ') + ')');
  }
  // Descend only from owned parents. Never walk up to clinicians or shared settings.
  let changed = true;
  while (changed) {
    changed = false;
    for (const fk of foreignKeys) {
      if (!selectors.has(fk.parent) || selectors.has(fk.child) || backPointer(fk)) continue;
      check(byTable.has(fk.child), 'SCHEMA_REFUSED');
      check(!['dermatologists','launch_settings','launch_allowlist','care_template_revisions'].includes(fk.child),'SHARED_CHILD_REFUSED');
      selectors.set(fk.child, (alias,depth=0) => {
        const parentAlias='parent_'+depth;
        const join=fk.childColumns.map((c,i)=>alias+'.'+ident(c)+'='+parentAlias+'.'+ident(fk.parentColumns[i])).join(' AND ');
        return 'EXISTS (SELECT 1 FROM '+qualified(fk.parent)+' '+parentAlias+' WHERE '+join+' AND '+selectors.get(fk.parent)(parentAlias,depth+1)+')';
      });
      changed = true;
    }
  }
  const ordered = [], visiting = new Set(), visited = new Set();
  function visit(table) {
    if (visited.has(table)) return;
    check(!visiting.has(table), 'CLEANUP_DEPENDENCY_CYCLE'); visiting.add(table);
    for (const fk of foreignKeys) if (fk.parent === table && fk.child !== table && selectors.has(fk.child) && !backPointer(fk)) visit(fk.child);
    visiting.delete(table); visited.add(table); ordered.push({table, predicate: selectors.get(table)('t')});
  }
  for (const table of selectors.keys()) if (table !== 'user_profiles') visit(table);
  if (selectors.has('user_profiles')) visit('user_profiles');
  ordered.foreignKeys = foreignKeys;
  return ordered;
}
async function schema(db) {
  const columns = (await db.query(`SELECT c.relname AS "table",a.attname AS "column"
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped`)).rows;
  const foreignKeys = (await db.query(`SELECT child.relname AS child,parent.relname AS parent,
    ARRAY(SELECT a.attname::text FROM unnest(k.conkey) WITH ORDINALITY x(num,ord) JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=x.num ORDER BY x.ord) AS "childColumns",
    ARRAY(SELECT a.attname::text FROM unnest(k.confkey) WITH ORDINALITY x(num,ord) JOIN pg_attribute a ON a.attrelid=k.confrelid AND a.attnum=x.num ORDER BY x.ord) AS "parentColumns"
    FROM pg_constraint k JOIN pg_class child ON child.oid=k.conrelid JOIN pg_class parent ON parent.oid=k.confrelid
    JOIN pg_namespace cn ON cn.oid=child.relnamespace JOIN pg_namespace pn ON pn.oid=parent.relnamespace
    WHERE k.contype='f' AND cn.nspname='public' AND pn.nspname='public'`)).rows;
  return {columns, foreignKeys};
}
async function cleanupStorage(storage, patientId) {
  check(UUID.test(patientId), 'IDENTITY_REFUSED');
  const paths = [];
  async function walk(prefix, depth = 0) {
    check(depth < 16 && (prefix === patientId || prefix.startsWith(patientId + '/')), 'STORAGE_SCOPE_REFUSED');
    for (let offset = 0; ; offset += 100) {
      const result = await storage.list(prefix, {limit: 100, offset, sortBy: {column:'name',order:'asc'}});
      check(!result.error && Array.isArray(result.data), 'STORAGE_LIST_FAILED');
      for (const object of result.data) {
        check(typeof object.name === 'string' && object.name.length && !/[\\/]/.test(object.name) && !['.','..'].includes(object.name), 'STORAGE_SCOPE_REFUSED');
        const key = prefix + '/' + object.name;
        if (object.id == null) await walk(key, depth + 1); else paths.push(key);
      }
      if (result.data.length < 100) break;
      check(offset < 100000, 'STORAGE_LIMIT');
    }
  }
  await walk(patientId);
  for (let i = 0; i < paths.length; i += 100) {
    const result = await storage.remove(paths.slice(i,i+100)); check(!result.error, 'STORAGE_REMOVE_FAILED');
  }
  // A second listing proves completion; storage operations may report success without counts.
  const verify = await storage.list(patientId, {limit:100,offset:0});
  check(!verify.error && Array.isArray(verify.data), 'STORAGE_LIST_FAILED');
  check(verify.data.length === 0, 'STORAGE_CLEANUP_INCOMPLETE');
  return paths.length;
}
const objectId = value => typeof value === 'string' ? value : value?.id ?? null;
const testObject = value => { check(value?.livemode === false, 'STRIPE_LIVE_OBJECT_REFUSED'); return value; };
function ownedSession(session, state) {
  testObject(session);
  check(session.id === state.sessionId && session.mode === 'subscription' && session.client_reference_id === state.membershipId && session.metadata?.membershipId === state.membershipId, 'STRIPE_OWNERSHIP_REFUSED');
  return session;
}
function ownedSubscription(subscription, state, customer) {
  testObject(subscription);
  check(subscription.id === state.subscriptionId && subscription.metadata?.membershipId === state.membershipId && objectId(subscription.customer) === customer, 'STRIPE_OWNERSHIP_REFUSED');
  return subscription;
}
async function payCheckout(stripe, state) {
  const session = ownedSession(await stripe.checkout.sessions.retrieve(state.sessionId), state);
  state.customerId = objectId(session.customer); state.subscriptionId = objectId(session.subscription);
  // Checkout creates subscription/invoice on completion, not session creation. Never fabricate either.
  if (!state.subscriptionId) return false;
  const subscription = ownedSubscription(await stripe.subscriptions.retrieve(state.subscriptionId), state, state.customerId);
  state.invoiceId = objectId(subscription.latest_invoice);
  if (!state.invoiceId) return false;
  const invoice = testObject(await stripe.invoices.retrieve(state.invoiceId));
  check(invoice.id === state.invoiceId && objectId(invoice.customer) === state.customerId && objectId(invoice.parent?.subscription_details?.subscription ?? invoice.subscription) === state.subscriptionId, 'STRIPE_OWNERSHIP_REFUSED');
  if (invoice.status === 'paid') return true;
  if (invoice.status !== 'open') return false;
  const paid = testObject(await stripe.invoices.pay(state.invoiceId, {payment_method:'pm_card_visa'}, {idempotencyKey:'unzit-smoke-pay-' + state.invoiceId}));
  check(paid.status === 'paid', 'PAYMENT_FAILED'); return true;
}
async function cleanupStripe(stripe, state, counts) {
  syntheticIdentity(state);
  if (!state.sessionId) { check(!state.customerId && !state.subscriptionId, 'STRIPE_OWNERSHIP_REFUSED'); return; }
  const session = ownedSession(await stripe.checkout.sessions.retrieve(state.sessionId), state);
  const customer = objectId(session.customer), subscriptionId = objectId(session.subscription);
  check(!state.customerId || state.customerId === customer, 'STRIPE_OWNERSHIP_REFUSED');
  check(!state.subscriptionId || state.subscriptionId === subscriptionId, 'STRIPE_OWNERSHIP_REFUSED');
  state.customerId = customer; state.subscriptionId = subscriptionId;
  if (session.status === 'open') {
    const result = testObject(await stripe.checkout.sessions.expire(session.id));
    check(result.status === 'expired', 'STRIPE_EXPIRE_FAILED'); counts.sessionsExpired = (counts.sessionsExpired ?? 0) + 1;
  }
  if (subscriptionId) {
    const subscription = ownedSubscription(await stripe.subscriptions.retrieve(subscriptionId), state, customer);
    state.invoiceId = objectId(subscription.latest_invoice) ?? state.invoiceId;
    if (subscription.status !== 'canceled') {
      const result = testObject(await stripe.subscriptions.cancel(subscriptionId));
      check(result.status === 'canceled', 'STRIPE_CANCEL_FAILED'); counts.subscriptionsCanceled = (counts.subscriptionsCanceled ?? 0) + 1;
    }
  }
  if (customer) {
    const existing = await stripe.customers.retrieve(customer);
    if (!existing.deleted) {
      testObject(existing); check(existing.id === customer, 'STRIPE_OWNERSHIP_REFUSED');
      check((await stripe.customers.del(customer)).deleted === true, 'STRIPE_CUSTOMER_DELETE_FAILED');
      counts.customersRemoved = (counts.customersRemoved ?? 0) + 1;
    }
  }
}
function patientApi(token, fetcher = fetch) {
  return async (route, {method = 'GET', body, expected = [200,201], anonymous = false, discard = false} = {}) => {
    check(typeof route === 'string' && route.startsWith('/') && !route.startsWith('//') && !/[?#\\]/.test(route), 'API_TARGET_REFUSED');
    const url = new URL(API_URL + route); check(url.origin === new URL(API_URL).origin && url.pathname.startsWith('/api/'), 'API_TARGET_REFUSED');
    const multipart = body instanceof FormData;
    let response;
    try {
      response = await fetcher(url.toString(), {method, headers:{'X-UNZIT-Questionnaire':VERSION,...(!anonymous?{Authorization:'Bearer ' + token}:{}),...(body&&!multipart?{'Content-Type':'application/json'}:{})}, body:body?(multipart?body:JSON.stringify(body)):undefined, redirect:'error', signal:AbortSignal.timeout(20000)});
    } catch { throw new SmokeError('API_TRANSPORT_FAILED'); }
    if (!expected.includes(response.status)) { await response.body?.cancel(); throw new SmokeError('API_REQUEST_FAILED',response.status); }
    if (discard) { await response.body?.cancel(); return {status:response.status}; }
    try { return await response.json(); } catch { throw new SmokeError('API_RESPONSE_FAILED'); }
  };
}
function syntheticAnswers() {
  return {W1:true,A1:'1990-01-01',A2:'yes',A3:'acne',A4:['none'],A5:'neither',A6:'never',A7:true,B1:'male',B7:'over_5_years',B8:['cheeks'],B9:['red_bumps'],B10:'burns_then_tans',B11:'somewhat',B12:['none'],C1:[{treatmentId:'never'}],C2:['none'],C3:'either',C4:'yes',C5:['none'],D1:['none'],D2_none:true,D3:['none'],D4:['none'],E1:['pimples'],E2:['stop_breakouts'],E4:'a_little',F2:true,planId:'care',H1:true,H2:true,H3:true,H4:true,H5:true,H6:true};
}
async function syntheticImages() {
  const sharp = require('sharp');
  // A flat colour rectangle, no face, text, identity document or identifying metadata.
  const png = await sharp({create:{width:640,height:480,channels:3,background:{r:170,g:190,b:210}}}).png().toBuffer();
  return {png, jpeg:await sharp(png).jpeg({quality:85}).toBuffer()};
}
const multipart = (fields, files = {}) => {
  const form = new FormData();
  for (const [key,value] of Object.entries(fields)) form.append(key,String(value));
  for (const [key,value] of Object.entries(files)) form.append(key,new Blob([value],{type:'image/jpeg'}), 'synthetic.jpg');
  return form;
};
async function baseline(db) {
  const row = (await db.query(`SELECT (SELECT count(*)::int FROM public.dermatologists) AS "clinicianCount",(SELECT count(*)::int FROM public.launch_allowlist) AS "allowlistCount"`)).rows[0];
  return {clinicianCount:row.clinicianCount,allowlistCount:row.allowlistCount};
}
async function assertIdentity(db, state) {
  syntheticIdentity(state);
  const rows = (await db.query(`SELECT id FROM auth.users WHERE lower(email)=$1 AND raw_user_meta_data->>'hosted_smoke'=$2`,[state.email,state.runId])).rows;
  check(rows.length <= 1 && (!state.patientId || rows.length === 1 && rows[0].id === state.patientId), 'IDENTITY_REFUSED');
  if (rows.length) state.patientId = rows[0].id;
}
async function preflightCleanup(db, plan) {
  const always = (await db.query(`SELECT count(*)::int AS count FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND t.tgenabled='A'`,[plan.map(p=>p.table)])).rows[0];
  check(always.count === 0, 'ALWAYS_TRIGGER_REFUSED');
  await db.query('BEGIN');
  try { await db.query("SET LOCAL session_replication_role = 'replica'"); }
  finally { await db.query('ROLLBACK'); }
}
async function cleanupRows(db, state, plan, counts) {
  await db.query('BEGIN');
  try {
    // Immutable-snapshot DELETE guards are bypassed only in this connection/transaction.
    // No ALTER, global trigger toggle, CASCADE, broad synthetic prefix or shared-row deletion.
    await db.query("SET LOCAL session_replication_role = 'replica'");
    // Materialize exact selectors before deleting parents used by indirect child predicates.
    await db.query('SELECT id FROM public.user_profiles WHERE id=$1 FOR UPDATE',[state.patientId]);
    await db.query('CREATE TEMP TABLE smoke_cleanup_rows (table_name text NOT NULL, row_oid oid NOT NULL, row_tid tid NOT NULL) ON COMMIT DROP');
    for (const {table,predicate} of plan) await db.query('INSERT INTO smoke_cleanup_rows SELECT $2,t.tableoid,t.ctid FROM ' + qualified(table) + ' t WHERE ' + predicate+' FOR UPDATE',[state.patientId,table]);
    for (const fk of plan.foreignKeys ?? []) {
      if (!plan.some(p=>p.table===fk.parent)) continue;
      const join=fk.childColumns.map((c,i)=>'c.'+ident(c)+'=p.'+ident(fk.parentColumns[i])).join(' AND ');
      const row=(await db.query('SELECT count(*)::int AS count FROM '+qualified(fk.child)+' c JOIN '+qualified(fk.parent)+' p ON '+join+
        ' JOIN smoke_cleanup_rows sp ON sp.table_name=$1 AND sp.row_oid=p.tableoid AND sp.row_tid=p.ctid WHERE NOT EXISTS (SELECT 1 FROM smoke_cleanup_rows sc WHERE sc.table_name=$2 AND sc.row_oid=c.tableoid AND sc.row_tid=c.ctid)',[fk.parent,fk.child])).rows[0];
      check(row.count===0,'CROSS_PATIENT_REFERENCE_REFUSED');
    }
    let removed = 0;
    for (const {table} of plan) {
      const result = await db.query('DELETE FROM ' + qualified(table) + ' t USING smoke_cleanup_rows s WHERE s.table_name=$1 AND t.tableoid=s.row_oid AND t.ctid=s.row_tid',[table]);
      removed += result.rowCount;
    }
    for (const {table,predicate} of plan) {
      const row = (await db.query('SELECT count(*)::int AS count FROM ' + qualified(table) + ' t WHERE ' + predicate,[state.patientId])).rows[0];
      check(row.count === 0,'PUBLIC_CLEANUP_INCOMPLETE');
    }
    await db.query('COMMIT'); counts.rowsRemoved = (counts.rowsRemoved ?? 0) + removed;
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}
async function cleanup({db,admin,stripe,state,plan,sleep = async()=>{}}, counts) {
  syntheticIdentity(state);
  check(state.identityReserved === true, 'IDENTITY_REFUSED');
  await assertIdentity(db,state); // Recovers a successful Admin create after a lost response.
  const failures = [];
  const attempt = async fn => { try { await fn(); } catch { failures.push(1); } };
  // Recover provider IDs from only this patient's membership after interrupted checkout.
  let providerIdsRecovered = !state.patientId;
  if (state.patientId) await attempt(async()=>{
    const rows = (await db.query('SELECT id,"checkoutSessionId","stripeCustomerId","stripeSubscriptionId" FROM public.care_memberships WHERE "patientId"=$1',[state.patientId])).rows;
    check(rows.length <= 1,'IDENTITY_REFUSED');
    if (rows.length) {
      check(!state.membershipId || state.membershipId === rows[0].id,'STRIPE_OWNERSHIP_REFUSED');
      state.membershipId = rows[0].id; state.sessionId ||= rows[0].checkoutSessionId;
      state.customerId ||= rows[0].stripeCustomerId; state.subscriptionId ||= rows[0].stripeSubscriptionId;
    }
    providerIdsRecovered = true;
  });
  let providersClean = false;
  if (providerIdsRecovered) await attempt(async()=>{ await cleanupStripe(stripe,state,counts); providersClean = true; });
  if (state.patientId) {
    await attempt(async()=>{ counts.objectsRemoved = await cleanupStorage(admin.storage.from('patient-photos'),state.patientId); });
    // Retain membership correlation if provider cleanup failed; remaining independent phases still run.
    if (providersClean) {
      if (state.subscriptionId) await sleep(5000);
      await attempt(async()=>{
        await assertIdentity(db,state);
        await cleanupRows(db,state,plan,counts);
        const ids = [state.sessionId,state.subscriptionId,state.invoiceId,state.customerId].filter(Boolean);
        if (ids.length) {
          const result = await db.query('DELETE FROM public.stripe_events WHERE "objectId"=ANY($1::text[])',[ids]);
          counts.rowsRemoved = (counts.rowsRemoved ?? 0) + result.rowCount;
        }
        const result = await admin.auth.admin.deleteUser(state.patientId);
        check(!result.error,'AUTH_DELETE_FAILED'); counts.authUsersRemoved = 1;
        const remaining = (await db.query('SELECT count(*)::int AS count FROM auth.users WHERE id=$1',[state.patientId])).rows[0];
        check(remaining.count === 0,'AUTH_CLEANUP_INCOMPLETE');
      });
    }
  }
  await attempt(async()=>{
    if (!state.allowlistBatch) state.allowlistBatch=(await db.query('SELECT "importBatch" FROM public.launch_allowlist WHERE email=$1',[state.email])).rows[0]?.importBatch;
    const result = await db.query('DELETE FROM public.launch_allowlist WHERE email=$1 AND "importBatch"=$2',[state.email,state.allowlistBatch]);
    counts.allowlistRemoved = result.rowCount;
    check((await db.query('SELECT count(*)::int AS count FROM public.launch_allowlist WHERE email=$1',[state.email])).rows[0].count === 0,'ALLOWLIST_CLEANUP_INCOMPLETE');
  });
  counts.failures = failures.length;
  check(!failures.length,'CLEANUP_FAILED');
}
async function journey({db,admin,client,stripe,fetcher,sleep,images}, state, steps) {
  async function step(name, action) {
    steps[name] = 'fail'; const result = await action(); steps[name] = 'pass'; return result;
  }
  await step('allowlist',async()=>{
    await importWaitlist(db,'email\n'+state.email,{apply:true});
    state.allowlistBatch = (await db.query('SELECT "importBatch" FROM public.launch_allowlist WHERE email=$1',[state.email])).rows[0].importBatch;
  });
  let password = crypto.randomBytes(18).toString('base64url'); // Exactly 24 chars, memory only.
  let token;
  await step('auth',async()=>{
    const created = await admin.auth.admin.createUser({email:state.email,password,email_confirm:true,user_metadata:{name:'Synthetic Smoke Patient',hosted_smoke:state.runId}});
    check(!created.error && created.data?.user?.email === state.email && UUID.test(created.data.user.id),'AUTH_CREATE_FAILED');
    state.patientId = created.data.user.id;
    const signed = await client.auth.signInWithPassword({email:state.email,password}); password = undefined;
    check(!signed.error && signed.data?.session?.user?.id === state.patientId && signed.data.session.access_token,'AUTH_SIGNIN_FAILED');
    token = signed.data.session.access_token;
  });
  const api = patientApi(token,fetcher);
  // Exercise independent denial checks even when payment later stops the journey.
  await step('anonymous_denial',()=>api('/launch/enrollment',{anonymous:true,expected:[401],discard:true}));
  // A fresh nonexistent ID exercises the same forbidden patient-read path without selecting real data.
  await step('other_patient_denial',()=>api('/users/'+crypto.randomUUID(),{expected:[403,404],discard:true}));
  const catalog = await api('/launch/catalog');
  check(catalog.questionnaireVersion === VERSION,'QUESTIONNAIRE_MISMATCH');
  let enrollment = await api('/launch/enrollment');
  check(UUID.test(enrollment.case?.id),'API_RESPONSE_FAILED');
  const route = '/launch/enrollment/' + enrollment.case.id;
  await step('eligibility',async()=>{
    enrollment = await api(route+'/eligibility',{method:'PUT',body:{expectedRevision:enrollment.case.revision,answers:{E1:'acne',E2:'no',E3:'neither',E4:'no'}}});
    check(enrollment.case.eligibility?.eligible && enrollment.case.status === 'consents','ELIGIBILITY_FAILED');
  });
  await step('consents',async()=>{
    const docs = enrollment.consents;
    check(docs?.length === 4 && new Set(docs.map(d=>d.key)).size === 4,'CONSENTS_FAILED');
    const acceptances = docs.map(({key,version,sha256,body})=>{
      check(crypto.createHash('sha256').update(body).digest('hex') === sha256,'CONSENT_HASH_MISMATCH'); return {key,version,sha256};
    });
    enrollment = await api(route+'/consents',{method:'PUT',body:{expectedRevision:enrollment.case.revision,acceptances}});
    check(enrollment.case.status === 'payment' && enrollment.consents.every(d=>d.acceptedAt),'CONSENTS_FAILED');
  });
  await step('checkout',async()=>{
    const body = {caseId:enrollment.case.id,planId:'care',settingsVersion:catalog.settingsVersion};
    // Same client operation can safely recover an interrupted provider create (backend idempotency).
    let billing;
    try { billing = await api('/launch/billing/checkout',{method:'POST',body}); }
    catch (error) {
      if (!(error instanceof SmokeError) || !(error.code === 'API_TRANSPORT_FAILED' || error.status >= 500)) throw error;
      billing = await api('/launch/billing/checkout',{method:'POST',body});
    }
    check(UUID.test(billing.membership?.id) && billing.membership.planId === 'care' && billing.action?.url,'CHECKOUT_FAILED');
    state.membershipId = billing.membership.id;
    const row = (await db.query('SELECT "checkoutSessionId" FROM public.care_memberships WHERE id=$1 AND "patientId"=$2',[state.membershipId,state.patientId])).rows[0];
    check(row?.checkoutSessionId?.startsWith('cs_test_'),'CHECKOUT_FAILED'); state.sessionId = row.checkoutSessionId;
  });
  steps.paid = 'fail';
  if (!await payCheckout(stripe,state)) { steps.paid = 'blocked_headless_checkout'; return; }
  for (let i=0; i<30; i++) {
    const billing = await api('/launch/billing');
    if (['paid_pending_review','active'].includes(billing.membership?.status) && new Date(billing.membership.paidThrough) > new Date()) { steps.paid = 'pass'; break; }
    await sleep(2000);
  }
  check(steps.paid === 'pass','PAID_WEBHOOK_TIMEOUT');
  enrollment = await api('/launch/enrollment');
  const {jpeg} = await images();
  await step('identity_nc',async()=>{
    enrollment = await api(route+'/identity/'+crypto.randomUUID(),{method:'PUT',body:multipart({expectedRevision:enrollment.case.revision,fullName:'Synthetic Smoke Patient',dateOfBirth:'1990-01-01',physicallyInNC:true},{idPhoto:jpeg,selfie:jpeg})});
    check(enrollment.case.identity?.attestedInNC && enrollment.case.status === 'medical_history','IDENTITY_FAILED');
  });
  let answers = syntheticAnswers(); delete answers.F2;
  const medical = async()=>{ enrollment = await api(route+'/medical/'+crypto.randomUUID(),{method:'PUT',body:{expectedRevision:enrollment.case.revision,questionnaireVersion:VERSION,answers}}); };
  await step('intake',async()=>{ await medical(); check(enrollment.case.status === 'photos','INTAKE_FAILED'); });
  const setId = crypto.randomUUID();
  await step('photos',async()=>{
    const items = [];
    for (const slot of ['front','left','right']) {
      const captureId = crypto.randomUUID();
      const result = await api('/launch/photo-captures/'+captureId,{method:'POST',body:multipart({captureDate:new Date().toISOString(),targetType:'enrollment',targetId:enrollment.case.id},{photo:jpeg})});
      items.push({slot,photoId:result.capture.id,captureId});
    }
    await api('/launch/photo-sets/'+setId,{method:'PUT',body:{purpose:'enrollment',targetId:enrollment.case.id,items}});
    enrollment = await api('/launch/enrollment'); answers.F2 = true; await medical();
    check(enrollment.case.status === 'destination','PHOTOS_FAILED');
  });
  await step('pharmacy',async()=>{
    enrollment = await api(route+'/destination',{method:'PUT',body:{expectedRevision:enrollment.case.revision,destination:{planId:'care',pharmacy:{name:'Synthetic Smoke Pharmacy - Do Not Fill',addressLine1:'123 Fictional Test Lane',addressLine2:null,city:'Synthetic City',state:'NC',postalCode:'27601',phone:'202-555-0100'}}}});
    check(enrollment.case.destination?.planId === 'care','DESTINATION_FAILED');
  });
  await step('submit_queue',async()=>{
    enrollment = await api(route+'/submit',{method:'POST',body:{expectedRevision:enrollment.case.revision,photoSetId:setId}});
    check(enrollment.case.status === 'submitted','SUBMISSION_FAILED');
    // Counts/booleans only: the same assignment + submitted predicates used by launchReview.queue.
    const row = (await db.query(`SELECT count(*)::int AS count FROM public.launch_cases c
      JOIN public.user_profiles p ON p.id=c."patientId" JOIN public.dermatologists d ON d.id=p."dermatologistId"
      JOIN public.launch_settings s ON s.version=c."settingsVersion" AND s."clinicianId"=d.id
      WHERE c."patientId"=$1 AND c.id=$2 AND c.status='submitted' AND c."submittedAt" IS NOT NULL`,[state.patientId,enrollment.case.id])).rows[0];
    check(row.count === 1,'QUEUE_VERIFICATION_FAILED');
  });
}
const defaults = {
  readFile:bootstrap.readOperatorFile,
  createDb:options=>new (require('pg').Client)(options),
  createClient:(url,key)=>require('@supabase/supabase-js').createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:bootstrap.safeAdminFetch}}),
  createStripe:key=>new (require('stripe'))(key,{timeout:10000,maxNetworkRetries:1}),
  fetcher:(...args)=>fetch(...args), sleep:ms=>new Promise(resolve=>setTimeout(resolve,ms)), images:syntheticImages,
  log:value=>console.log(value),
};
async function runHosted(argv,env,injected={}) {
  const {projectRef} = parseArgs(argv), target = validateEnvironment(env,projectRef), deps = {...defaults,...injected};
  const report = {steps:Object.fromEntries(['allowlist','auth','anonymous_denial','other_patient_denial','eligibility','consents','checkout','paid','identity_nc','intake','photos','pharmacy','submit_queue'].map(s=>[s,'not_run'])),cleanup:{rowsRemoved:0,objectsRemoved:0,subscriptionsCanceled:0,customersRemoved:0,sessionsExpired:0,authUsersRemoved:0,allowlistRemoved:0,failures:0},stepsPassed:0};
  const state = {email:'unzit-smoke-'+Date.now()+crypto.randomInt(100000,999999)+'@example.invalid',runId:crypto.randomUUID()};
  const db = deps.createDb(pgOptions(target,deps.readFile(path.join(__dirname,'../certs/supabase-prod-ca-2021.crt'))));
  db.on?.('error',()=>{}); // Suppress raw idle socket diagnostics; queries fail safely.
  let connected=false,locked=false,admin,stripe,plan;
  try {
    await db.connect(); connected=true;
    // Serialize smoke operators; never hold a transaction open across network requests.
    check((await db.query('SELECT pg_try_advisory_lock(142020, 2) AS locked')).rows[0].locked,'SMOKE_ALREADY_RUNNING'); locked=true;
    report.baseline = await baseline(db); check(report.baseline.clinicianCount === 1,'SINGLE_CLINICIAN_REQUIRED');
    const metadata = await schema(db); plan = cleanupPlan(metadata.columns,metadata.foreignKeys);
    await preflightCleanup(db,plan);
    syntheticIdentity(state);
    const exists = (await db.query(`SELECT (EXISTS(SELECT 1 FROM auth.users WHERE lower(email)=$1) OR EXISTS(SELECT 1 FROM public.launch_allowlist WHERE email=$1)) AS present`,[state.email])).rows[0];
    check(!exists.present,'IDENTITY_COLLISION'); state.identityReserved=true;
    admin=deps.createClient(target.supabaseUrl,target.serviceRoleKey); stripe=deps.createStripe(target.stripeKey);
    try {
      await journey({db,admin,stripe,client:deps.createClient(target.supabaseUrl,target.anonKey),...deps},state,report.steps);
    } finally {
      try { await cleanup({db,admin,stripe,state,plan,sleep:deps.sleep},report.cleanup); }
      finally {
        report.final = await baseline(db);
        check(report.final.clinicianCount === report.baseline.clinicianCount && report.final.allowlistCount === report.baseline.allowlistCount,'BASELINE_MISMATCH');
      }
    }
  } catch (error) {
    report.failure = error instanceof SmokeError ? error.code : 'OPERATION_FAILED';
    if (error instanceof SmokeError && error.status) report.httpStatus = error.status;
  } finally {
    if (locked) { try { await db.query('SELECT pg_advisory_unlock(142020, 2)'); } catch {} }
    try { await db.end(); } catch { if (connected) report.failure ||= 'DATABASE_CLOSE_FAILED'; }
  }
  report.stepsPassed = Object.values(report.steps).filter(s=>s==='pass').length;
  return report;
}
async function main(argv,env,injected={}) {
  const deps = {...defaults,...injected};
  try {
    const report = await runHosted(argv,env,deps); deps.log(JSON.stringify(report));
    return report.failure || report.steps.paid === 'blocked_headless_checkout' ? 1 : 0;
  } catch { deps.log(JSON.stringify({failure:'PREFLIGHT_FAILED',stepsPassed:0})); return 1; }
}
if (require.main === module) main(process.argv.slice(2),process.env).then(code=>{process.exitCode=code;});
module.exports={API_URL,parseArgs,validateEnvironment,pgOptions,cleanupPlan,cleanupStorage,cleanupStripe,cleanupRows,cleanup,payCheckout,patientApi,syntheticAnswers,syntheticImages,journey,runHosted,main};
