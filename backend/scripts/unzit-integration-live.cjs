// Loopback-only integration journey. No dotenv reads, hosted calls, or credential/content logs.
// Run from repo root: node backend/scripts/unzit-integration-live.cjs --catalog-version VERSION (or --synthetic-catalog for unpublished seeds)
// Immutable synthetic evidence is retained under a private .local manifest; unrelated data is untouched.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const {validateLocalTargets}=require('./lib/unzit-live-guards.cjs');
function integrationRuntime(status){
 const env={DATABASE_URL:status.DB_URL,DIRECT_URL:status.DB_URL,SUPABASE_URL:status.API_URL,SUPABASE_ANON_KEY:status.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:status.SERVICE_ROLE_KEY,SECURITY_API_URL:'http://127.0.0.1:3001/api',NODE_ENV:'development',BILLING_PROVIDER:'fake',BILLING_RETURN_ORIGIN:'http://127.0.0.1:3001'};
 validateLocalTargets(env);
 assert.equal(new URL(env.SUPABASE_URL).port,'54321');assert.equal(new URL(env.DATABASE_URL).port,'54322');
 assert(env.SUPABASE_ANON_KEY&&env.SUPABASE_SERVICE_ROLE_KEY,'Local keys required');return env;
}
function validateManifest(manifest){
 assert.match(manifest.run,/^[a-f0-9-]{36}$/);
 for(const a of manifest.accounts){assert(['doctor','patientA','patientB'].includes(a.role));assert.equal(a.email,`clearaf-integration-${manifest.run}-${a.role.toLowerCase()}@example.invalid`);}
}
async function loopbackFetch(input,options={},transport=fetch){
 const url=new URL(typeof input==='string'?input:input.url);
 assert(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)&&!url.username&&!url.password,'Loopback HTTP only');
 return transport(input,{...options,redirect:'error'});
}
function validatePortalLogin(status,html){
 assert.equal(status,200,'Local portal login unavailable');
 for(const marker of ['Clinician portal','Sign in','Work email'])assert(html.includes(marker),'Local clinician sign-in surface required');
}
function parseIntegrationArgs(args){
 if(args.length===1&&args[0]==='--synthetic-catalog')return {synthetic:true};
 assert.equal(args.length,2,'Expected --catalog-version VERSION');assert.equal(args[0],'--catalog-version');
 require('./lib/launch-catalog.cjs').catalogPath(args[1]);return {catalogVersion:args[1],synthetic:false};
}
async function run(){
 const selection=parseIntegrationArgs(process.argv.slice(2)),v2=selection.catalogVersion==='2.0-pending-review';
 const cliEnv={...process.env};const socket=path.join(require('node:os').homedir(),'.colima/clearaf/docker.sock');
 if(!cliEnv.DOCKER_HOST&&fs.existsSync(socket))cliEnv.DOCKER_HOST='unix://'+socket;
 const status=require('node:child_process').spawnSync('npx',['--yes','supabase@2.117.0','status','-o','json'],{cwd:root,env:cliEnv,encoding:'utf8'});
 assert.equal(status.status,0,'Local Supabase status failed');Object.assign(process.env,integrationRuntime(JSON.parse(status.stdout)));
 for(const [key,value]of Object.entries(process.env))assert(!key.startsWith('STRIPE_')||!value,'Stripe configuration forbidden');
 const {Client}=require('pg'),{createClient}=require('@supabase/supabase-js');
 const db=new Client({connectionString:process.env.DATABASE_URL});await db.connect();
 const options={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:loopbackFetch}},admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,options),publicClient=()=>createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,options);
 const manifest={run:crypto.randomUUID(),accounts:[],objects:[],completed:false,passed:[]};
 const folder=path.join(root,'.local/integration'),file=path.join(folder,'journey-'+manifest.run+'.json');fs.mkdirSync(folder,{recursive:true,mode:0o700});
 const save=()=>{validateManifest(manifest);fs.writeFileSync(file,JSON.stringify(manifest),{mode:0o600});fs.chmodSync(file,0o600);};save();
 const ok=name=>{manifest.passed.push(name);save();console.log('PASS '+name);};
 const tokens=new Map();let phase='preflight',previousSettings,ownedSettings,prisma;
 async function request(account,endpoint,method='GET',body,expected=200){
  const r=await loopbackFetch(process.env.SECURITY_API_URL+'/launch'+endpoint,{method,headers:{Authorization:'Bearer '+tokens.get(account.id),...(v2?{'X-UNZIT-Questionnaire':selection.catalogVersion}:{}),...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});
  if(r.status!==expected){manifest.failure={phase,status:r.status,expected};save();}
  assert.equal(r.status,expected,'Unexpected launch response in '+phase);return r.json();
 }
 async function account(role,signup){
  const a={role,email:`clearaf-integration-${manifest.run}-${role.toLowerCase()}@example.invalid`,password:crypto.randomBytes(30).toString('base64url'),allowlistId:crypto.randomUUID()};manifest.accounts.push(a);save();
  await db.query('INSERT INTO public.launch_allowlist(id,email,"importBatch",enabled) VALUES($1,$2,$3,true)',[a.allowlistId,a.email,manifest.run]);
  const created=signup?await publicClient().auth.signUp({email:a.email,password:a.password,options:{data:{name:'Synthetic Integration Patient'}}}):await admin.auth.admin.createUser({email:a.email,password:a.password,email_confirm:true,user_metadata:{name:'Synthetic Integration Clinician'}});
  assert.ifError(created.error);a.id=created.data.user.id;save();if(signup)assert.ifError((await admin.auth.admin.updateUserById(a.id,{email_confirm:true})).error);
  const login=await publicClient().auth.signInWithPassword({email:a.email,password:a.password});assert.ifError(login.error);tokens.set(a.id,login.data.session.access_token);return a;
 }
 try{
  assert.equal((await loopbackFetch('http://127.0.0.1:3001/ready')).status,200);
  const portal=await loopbackFetch('http://127.0.0.1:3000/login');validatePortalLogin(portal.status,await portal.text());ok('local API readiness and portal login');
  previousSettings=(await db.query('SELECT * FROM public.launch_settings WHERE active')).rows[0];assert(previousSettings,'Active settings required');
  // Never replace a real publication with a synthetic catalog, even temporarily.
  if(selection.synthetic)assert.equal(Object.keys(previousSettings.content).length,0,'Synthetic catalog requires an unpublished local seed');
  else assert(selection.catalogVersion,'Explicit catalog required');
  phase='clinician fixture';const doctor=await account('doctor',false);
  await db.query('INSERT INTO public.dermatologists(id,name,email,password,"createdAt","updatedAt") VALUES($1,$2,$3,$4,now(),now())',[doctor.id,'Synthetic Integration Clinician',doctor.email,'UNUSED_SUPABASE_AUTH']);
  if(selection.synthetic){
   const {draftSource}=require('./unzit-launch-live.cjs'),{validateLaunchContent,publishLaunchContent}=require('./import-launch-content.cjs');
   const publication=validateLaunchContent(draftSource(doctor.id));const published=await publishLaunchContent(db,publication);ownedSettings=published.version;manifest.syntheticCatalog=true;
  }else{
   const {validateLaunchContent,publishLaunchContent}=require('./import-launch-content.cjs');
   const source=require('./lib/launch-catalog.cjs').readCatalog(selection.catalogVersion);
   const publication=validateLaunchContent({...source,clinicianId:doctor.id});
   const published=await publishLaunchContent(db,publication);ownedSettings=published.version;
   manifest.catalogVersion=selection.catalogVersion;
  }
  manifest.settingsVersion=ownedSettings;save();
  phase='allowlisted signup';const patients=[await account('patientA',true),await account('patientB',true)];
  const fakeProbe=await request(patients[0],'/billing/fake/operations/'+crypto.randomUUID()+'/resolve','POST',{outcome:'succeed'},404);assert.equal(fakeProbe.code,'NOT_FOUND','The API must expose the development-only fake adapter before Checkout');
  ok('two exact allowlisted public signups and confirmed sessions');
  const contract=require('../dist/contracts/unzitLaunch'),jpeg=await require('sharp')({create:{width:100,height:100,channels:3,background:'#779999'}}).jpeg().toBuffer();
  async function enrollment(a){return request(a,'/enrollment');}
  async function photos(a,targetId,slots=['front','left','right']){
   const items=[];for(const slot of slots){const captureId=crypto.randomUUID(),form=new FormData();form.set('captureDate',new Date().toISOString());form.set('targetType','enrollment');form.set('targetId',targetId);form.set('notes','Synthetic integration fixture');form.set('photo',new Blob([jpeg],{type:'image/jpeg'}),'synthetic.jpg');
    const result=await request(a,'/photo-captures/'+captureId,'POST',form,201);items.push({slot,photoId:result.capture.id,captureId});}
   const setId=crypto.randomUUID();await request(a,'/photo-sets/'+setId,'PUT',{purpose:'enrollment',targetId,items},201);return setId;
  }
  async function review(a,targetType,targetId,outcome){const current=await enrollment(a);return request(doctor,`/patients/${a.id}/reviews/${crypto.randomUUID()}`,'PUT',{targetType,targetId,expectedRevision:current.case.revision,outcome,patientMessage:outcome==='reject'?'Synthetic integration rejection':outcome==='needs_changes'?'Synthetic clarification request':null},201);}
  async function pay(a,e,catalog){
   const billing=await request(a,'/billing/checkout','POST',{caseId:e.case.id,planId:a.planId??'care',settingsVersion:catalog.settingsVersion});a.membershipId=billing.membership.id;save();assert.equal(billing.membership.status,'awaiting_payment');
   const op=(await db.query('SELECT id FROM public.billing_operations WHERE "membershipId"=$1 AND kind=$2',[a.membershipId,'checkout'])).rows[0];
   await request(a,'/billing/fake/operations/'+op.id+'/resolve','POST',{outcome:'succeed'});e=await enrollment(a);assert.equal(e.membership.status,'paid_pending_review');assert.equal(e.membership.access,'enrollment');return e;
  }
  for(const a of patients){
   phase=a.role+' enrollment';a.planId=v2&&a.role==='patientB'?'all_in':'care';let e=await enrollment(a);a.caseId=e.case.id;save();const base='/enrollment/'+e.case.id;
   phase=a.role+' catalog';const catalog=await request(a,'/catalog');
   const answers=v2?structuredClone(require('../dist/services/intakeV2').validIntakeV2Answers):contract.fixtures['PUT /enrollment/:caseId/medical/:revisionId'].request.answers;
   if(v2){
    assert.equal(catalog.questionnaireVersion,selection.catalogVersion);assert(catalog.intakeV2&&catalog.photoGuidance&&catalog.identityGuidance);
    // Second patient exercises pregnancy routing and conditional chest/back photos.
    if(a.role==='patientB')Object.assign(answers,{A5:'pregnant',B1:'female',B8:['chest','back'],planId:'all_in',G2:'yes'});
    const gates=Object.fromEntries(Object.entries(answers).filter(([key])=>key==='W1'||key.startsWith('A')));
    phase=a.role+' safety gates';e=await request(a,base+'/medical/'+crypto.randomUUID(),'PUT',{expectedRevision:e.case.revision,questionnaireVersion:catalog.questionnaireVersion,answers:gates},201);
    // Payment must be refused before all required intake and photos exist.
    await request(a,'/billing/checkout','POST',{caseId:e.case.id,planId:'care',settingsVersion:catalog.settingsVersion},403);
   }
   phase=a.role+' consents';e=await request(a,base+'/consents','PUT',{expectedRevision:e.case.revision,acceptances:e.consents.map(({key,version,sha256})=>({key,version,sha256}))},201);assert(e.consents.every(d=>d.acceptedAt));
   const identityId=crypto.randomUUID(),identity=new FormData();for(const [key,value]of Object.entries({fullName:'Synthetic Integration Patient',dateOfBirth:'1990-01-01',physicallyInNC:'true',expectedRevision:String(e.case.revision)}))identity.set(key,value);
   identity.set('idPhoto',new Blob([jpeg],{type:'image/jpeg'}),'synthetic-id.jpg');identity.set('selfie',new Blob([jpeg],{type:'image/jpeg'}),'synthetic-selfie.jpg');
   phase=a.role+' identity';e=await request(a,base+'/identity/'+identityId,'PUT',identity,201);
   if(!v2){
    e=await request(a,base+'/eligibility','PUT',{expectedRevision:e.case.revision,answers:contract.fixtures['PUT /enrollment/:caseId/eligibility'].request.answers},201);assert.equal(e.case.status,'payment');
    phase=a.role+' payment';e=await pay(a,e,catalog);
   }
   phase=a.role+' medical history';e=await request(a,base+'/medical/'+crypto.randomUUID(),'PUT',{expectedRevision:e.case.revision,questionnaireVersion:catalog.questionnaireVersion,answers},201);
   const slots=v2?e.case.intakeV2.evaluation.requiredPhotoSlots:undefined;
   phase=a.role+' photos';const setId=await photos(a,e.case.id,slots);e=await enrollment(a);
   phase=a.role+' destination';e=await request(a,base+'/destination','PUT',{expectedRevision:e.case.revision,destination:a.planId==='all_in'?{planId:'all_in',pharmacy:'vida',shippingAddress:{recipient:'Synthetic Integration Patient',line1:'100 Synthetic Street',line2:null,city:'Raleigh',state:'NC',postalCode:'27601'}}:contract.fixtures['PUT /enrollment/:caseId/destination'].request.destination},201);
   if(v2){
    phase=a.role+' medical history';e=await request(a,base+'/medical/'+crypto.randomUUID(),'PUT',{expectedRevision:e.case.revision,questionnaireVersion:catalog.questionnaireVersion,answers},201);
    assert.deepEqual(e.case.intakeV2.evaluation.missingRequired,[]);
    if(a.role==='patientB')assert(e.case.intakeV2.evaluation.excluded.some(x=>x.drug==='tretinoin'));
    phase=a.role+' payment';e=await pay(a,e,catalog);
   }
   phase=a.role+' submit';e=await request(a,base+'/submit','POST',{expectedRevision:e.case.revision,photoSetId:setId});assert.equal(e.case.status,'submitted');
   if(v2&&a.role==='patientA'){
    phase='paid v2 clarification';await review(a,'case',e.case.id,'needs_changes');e=await enrollment(a);assert.equal(e.case.photoSet.status,'needs_changes');
    answers.C6='Synthetic clarified history';
    e=await request(a,base+'/medical/'+crypto.randomUUID(),'PUT',{expectedRevision:e.case.revision,questionnaireVersion:catalog.questionnaireVersion,answers},201);
    assert.equal(e.case.status,'medical_history','Covered corrections must not return to payment');
    e=await request(a,base+'/submit','POST',{expectedRevision:e.case.revision,photoSetId:setId});assert.equal(e.case.status,'submitted');
    ok('paid v2 clarification reuses immutable photos and resubmits without checkout');
   }
   await review(a,'identity',identityId,'approve');await review(a,'case',e.case.id,a.role==='patientA'?'approve':'reject');
   const chart=await request(doctor,`/patients/${a.id}/chart`);assert.equal(chart.careModel,'launch');assert.equal(chart.enrollment.case.status,a.role==='patientA'?'approved':'rejected');
   await request(patients.find(p=>p!==a),`/patients/${a.id}/chart`,'GET',undefined,403);
   ok(a.role+' consents, identity, eligibility, fake payment, intake, photos, destination, submission and manual reviews');
  }
  phase='approved care';const [approved,rejected]=patients;const checks=await request(approved,'/check-ins');assert.equal(checks.data.length,1);assert.equal(checks.data[0].kind,'monthly');
  const approvedState=await enrollment(approved);assert.equal(approvedState.membership.access,'care');assert(approvedState.membership.paidThrough);ok('approval grants server-confirmed paid care and schedules monthly check-in');
  const recordId=crypto.randomUUID(),rx={...contract.fixtures['PUT /patients/:patientId/prescriptions-sent/:recordId'].request,drug:v2?'Tretinoin cream':'Synthetic integration drug',strength:v2?'0.025%':'Synthetic strength',sig:'Synthetic integration directions',sentAt:new Date().toISOString()};
  await request(doctor,`/patients/${approved.id}/prescriptions-sent/${recordId}`,'PUT',rx,201);const history=await request(approved,'/prescriptions-sent');assert.equal(history.data.length,1);assert.equal(history.data[0].id,recordId);ok('external prescription record and patient history');
  phase='scoped refund';const {PrismaClient}=require('@prisma/client');prisma=new PrismaClient();
  const scoped={...prisma,billingOperation:{...prisma.billingOperation,count:args=>prisma.billingOperation.count({...args,where:{AND:[args.where,{patientId:rejected.id}]}}),findMany:args=>prisma.billingOperation.findMany({...args,where:{AND:[args.where,{patientId:rejected.id}]}})},$transaction:prisma.$transaction.bind(prisma)};
  const lifecycle=require('../dist/services/billingLifecycle').createBillingLifecycle({db:scoped,provider:require('../dist/services/fakeBilling').createFakeBilling()});
  assert.equal((await lifecycle.reconcile()).succeeded,1);assert.equal((await lifecycle.reconcile()).succeeded,0);
  const refund=await request(rejected,'/billing');assert.equal(refund.membership.status,'rejected');assert.equal(refund.membership.refundStatus,'issued');
  const payments=(await db.query('SELECT "amountCents","refundedCents" FROM public.billing_payments WHERE "patientId"=$1',[rejected.id])).rows;assert.equal(payments.length,1);assert.equal(payments[0].refundedCents,payments[0].amountCents);ok('second patient rejection refunds full invoice exactly once');
  phase='owned evidence';for(const a of patients){
   const rows=(await db.query('SELECT "idPhotoPath" AS path FROM public.identity_verifications WHERE "patientId"=$1 UNION ALL SELECT "selfiePath" FROM public.identity_verifications WHERE "patientId"=$1 UNION ALL SELECT "photoUrl" FROM public.skin_photos WHERE "userId"=$1',[a.id])).rows;
   for(const {path:object}of rows){assert(object.startsWith(a.id+'/'));manifest.objects.push(object);const data=await admin.storage.from('patient-photos').download(object);assert.ifError(data.error);assert.equal((await require('sharp')(Buffer.from(await data.data.arrayBuffer())).metadata()).exif,undefined);}
  }
  manifest.completed=true;ok('private synthetic image evidence without EXIF');
  console.log(JSON.stringify({passed:manifest.passed.length,failed:0,patients:2,prescriptions:1,fullRefunds:1,syntheticCatalog:!!manifest.syntheticCatalog,retained:true}));
 }catch(error){save();console.error('Integration journey failed in '+phase+'; private synthetic manifest retained.');if(manifest.failure)console.error(JSON.stringify(manifest.failure));else if(typeof error.actual==='number'&&typeof error.expected==='number')console.error(JSON.stringify({actual:error.actual,expected:error.expected}));process.exitCode=1;}
 finally{
  if(ownedSettings){await db.query('BEGIN');try{await db.query('LOCK TABLE public.launch_settings IN EXCLUSIVE MODE');const active=(await db.query('SELECT version FROM public.launch_settings WHERE active')).rows[0];assert.equal(active.version,ownedSettings,'Concurrent publication; do not change its pointer');await db.query('UPDATE public.launch_settings SET active=false WHERE version=$1',[ownedSettings]);await db.query('UPDATE public.launch_settings SET active=true WHERE version=$1',[previousSettings.version]);await db.query('COMMIT');manifest.settingsRestored=true;save();}catch(error){await db.query('ROLLBACK');console.error('Local catalog pointer restoration needs attention.');process.exitCode=1;}}
  if(prisma)await prisma.$disconnect();await require('../dist/config/database').prisma.$disconnect();await db.end();
 }
}
module.exports={parseIntegrationArgs,integrationRuntime,validateManifest,loopbackFetch,validatePortalLogin};
if(require.main===module)run().catch(()=>{console.error('Local integration preflight failed; no credentials or content logged.');process.exitCode=1;});
