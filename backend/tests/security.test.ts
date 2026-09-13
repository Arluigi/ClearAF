import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Module from 'node:module';
import { ZodError } from 'zod';

// External services are isolated; all HTTP routing, validation and authorization are real.
const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222';
const D='33333333-3333-4333-8333-333333333333', E='44444444-4444-4444-8444-444444444444';
const P='55555555-5555-4555-8555-555555555555';
process.env.SUPABASE_URL='https://security-test.supabase.co';
process.env.SUPABASE_ANON_KEY='synthetic-anon';
process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-service';
let writes:any[], signed:string[], removed:string[], failRemove=false;
let users:any[], photos:any[], appointments:any[], queries:any[], reviews:any[], cleanups:any[];
let uploadSize=68,transactionActive=false;
function matches(row:any,where:any={}):boolean {
 return Object.entries(where).every(([k,v]:any)=> {
  if(k==='OR') return v.some((w:any)=>matches(row,w));
  if(k==='AND') return v.every((w:any)=>matches(row,w));
  if(k==='patient') return matches(users.find(u=>u.id===row.patientId),v);
  if(v&&typeof v==='object') { if('in' in v)return v.in.includes(row[k]); if('gte' in v)return row[k]>=v.gte; if('contains' in v)return typeof row[k]==='string'&&row[k].toLowerCase().includes(String(v.contains).toLowerCase()); }
  return row?.[k]===v;
 });
}
const model=(rows:()=>any[])=>({
 findUnique:async({where}:any)=>rows().find(r=>matches(r,where))??null,
 findFirst:async({where}:any={})=>rows().find(r=>matches(r,where))??null,
 findMany:async(args:any={})=>{queries.push(args);let result=rows().filter(r=>matches(r,args.where));if(args.orderBy){const orders=Array.isArray(args.orderBy)?args.orderBy:[args.orderBy];result=[...result].sort((a,b)=>{for(const order of orders){const [field,direction]=Object.entries(order)[0] as [string,any];if(a[field]===b[field])continue;return (a[field]<b[field]?-1:1)*(direction==='desc'?-1:1)}return 0})}return result.slice(args.skip??0,(args.skip??0)+(args.take??result.length))},
 count:async({where}:any={})=>rows().filter(r=>matches(r,where)).length,
 create:async({data}:any)=>{writes.push(data);const row={id:P,...data};rows().push(row);return row},
 update:async({where,data}:any)=>{const r=rows().find(r=>matches(r,where));if(!r)throw Error('record missing');writes.push(data);return Object.assign(r,data)},
 delete:async({where}:any)=>{writes.push({delete:where});const index=rows().findIndex(r=>matches(r,where));return index<0?null:rows().splice(index,1)[0]},
 deleteMany:async({where}:any)=>{writes.push({delete:where});const found=rows().filter(r=>matches(r,where));for(const row of found)rows().splice(rows().indexOf(row),1);return{count:found.length}},
 updateMany:async({data}:any)=>{writes.push(data);return {count:0}},
 upsert:async({where,update,create}:any)=>{const r=rows().find(r=>matches(r,where));writes.push(r?update:create);return r?Object.assign(r,update):create}
});
const db:any={$transaction:async(fn:any)=>{transactionActive=true;try{return await fn(db)}finally{transactionActive=false}},$queryRaw:async()=>[{active:true}],user:model(()=>users),dermatologist:model(()=>[{id:D,email:'doctor@test.invalid'},{id:E,email:'dr.amitom@clearaf.com'}]),skinPhoto:model(()=>photos),photoReview:model(()=>reviews),photoCleanup:model(()=>cleanups),prescription:model(()=>[{id:P,patientId:B,dermatologistId:D}]),message:model(()=>[]),appointment:model(()=>appointments)};
const originalLoad=(Module as any)._load;
(Module as any)._load=function(name:string,...args:any[]){if(name==='@prisma/client')return {PrismaClient:class{constructor(){return db}}};return originalLoad.call(this,name,...args)};
const config=require('../src/config/supabase');
config.supabaseAdmin.auth.getUser=async()=>({data:{user:{id:A,email:'patient@test.invalid',email_confirmed_at:'2026-01-01',user_metadata:{}}},error:null});
config.supabaseAdmin.storage.from=()=>({
 createSignedUrl:async(path:string,expiry:number)=>{signed.push(path);return {data:{signedUrl:`https://security-test.supabase.co/storage/v1/object/sign/patient-photos/${path}?token=test-${expiry}`},error:null}},
 remove:async(paths:string[])=>{assert.equal(transactionActive,false,'Remote deletion must occur after transaction commit');removed.push(...paths);return {data:[],error:failRemove?{message:'synthetic storage failure'}:null}},
 createSignedUploadUrl:async(path:string)=>({data:{signedUrl:`https://security-test.supabase.co/storage/v1/object/upload/sign/patient-photos/${path}?token=synthetic`},error:null}),
 info:async()=>({data:{size:uploadSize,contentType:'image/png'},error:null}),
 upload:async(path:string)=>({data:{path},error:null})
});
const app=express();app.use(express.json());
app.use((req:any,res,next)=>{const identity=req.header('x-test-identity');if(!identity)return res.sendStatus(401);req.user={id:identity,userType:[D,E].includes(identity)?'dermatologist':'patient'};next()});
for(const route of ['users','photos','prescriptions','messages','auth-supabase','appointments','dashboard'])app.use('/'+route,require('../src/routes/'+route).default);
app.use((err:any,_req:any,res:any,_next:any)=>res.status(err instanceof ZodError?400:err.statusCode??err.status??500).json({error:err.message}));
(Module as any)._load=originalLoad;
let server:any,base:string;
before(async()=>{server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`});
after(()=>new Promise<void>(r=>server.close(r)));
beforeEach(()=>{cleanups=[];reviews=[];writes=[];signed=[];removed=[];queries=[];failRemove=false;uploadSize=68;users=[{id:A,name:'Assigned Patient',skinType:'Sensitive',dermatologistId:D,createdAt:new Date('2026-01-02'),updatedAt:new Date('2026-01-02')},{id:B,name:'Other Patient',dermatologistId:E,createdAt:new Date('2026-01-01'),updatedAt:new Date('2026-01-01')}];appointments=[{id:P,patientId:B,dermatologistId:D,status:"scheduled",scheduledDate:new Date(),relatedPhotos:[]}];photos=[{id:P,userId:A,photoUrl:`https://security-test.supabase.co/storage/v1/object/public/patient-photos/${A}/photo.jpg`,skinScore:0,captureDate:new Date()}]});
async function request(path:string,identity:string|undefined,method='GET',body?:any){return fetch(base+path,{method,headers:{...(identity?{'x-test-identity':identity}:{}),'content-type':'application/json',authorization:'Bearer e30.'+Buffer.from(JSON.stringify({session_id:A})).toString('base64url')+'.synthetic'},body:body?JSON.stringify(body):undefined})}
for(const identity of [A,D])test(`client ${identity} cannot reassign a patient`,async()=>{const r=await request('/users/assign-dermatologist',identity,'POST',{patientId:B,dermatologistId:D});assert.equal(r.status,403);assert.equal(writes.length,0)});
test('sync profile preserves existing assignment',async()=>{const r=await request('/auth-supabase/sync-profile',A,'POST',{});assert.equal(r.status,200);assert.equal(users[0].dermatologistId,D)});
test('unassigned clinician cannot prescribe',async()=>{const r=await request('/prescriptions',D,'POST',{patientId:B,medicationName:'synthetic',dosage:'synthetic',instructions:'test only'});assert.equal(r.status,404);assert.equal(writes.length,0)});
test('assigned clinician can prescribe',async()=>{const r=await request('/prescriptions',D,'POST',{patientId:A,medicationName:'synthetic',dosage:'synthetic',instructions:'test only'});assert.equal(r.status,201);assert.equal(writes.length,1)});
test('unassigned clinician cannot reply',async()=>{const r=await request('/messages/reply',D,'POST',{patientId:B,content:'synthetic'});assert.equal(r.status,404);assert.equal(writes.length,0)});
test('assigned clinician can reply',async()=>{const r=await request('/messages/reply',D,'POST',{patientId:A,content:'synthetic'});assert.equal(r.status,201)});
test('patient cannot send to unassigned clinician',async()=>{const r=await request('/messages/send',A,'POST',{recipientId:E,content:'synthetic'});assert.equal(r.status,404);assert.equal(writes.length,0)});
test('patient cannot register arbitrary photo URLs',async()=>{const r=await request('/photos',A,'POST',{photoUrl:`https://security-test.supabase.co/storage/v1/object/public/patient-photos/${B}/stolen.jpg`});assert.equal(r.status,410);assert.equal(writes.length,0)});
test('anonymous photo reads denied',async()=>assert.equal((await request('/photos',undefined)).status,401));
test('patient cannot read another patient photo',async()=>{assert.equal((await request('/photos/'+P,B)).status,404);assert.equal(signed.length,0)});
test('unassigned clinician cannot retrieve photo list',async()=>{assert.equal((await request('/photos/patient/'+A,E)).status,404);assert.equal(signed.length,0)});
test('patient gets expiring photo URL',async()=>{const r=await request('/photos/'+P,A);assert.equal(r.status,200);const body:any=await r.json();assert.match(body.photo.photoUrl,/\/object\/sign\//);assert.equal(signed[0],A+'/photo.jpg')});
test('assigned clinician gets expiring photo URL',async()=>{const r=await request('/photos/patient/'+A,D);assert.equal(r.status,200);const body:any=await r.json();assert.match(body.data[0].photoUrl,/\/object\/sign\//)});
test('foreign photo path is never signed',async()=>{photos[0].photoUrl=`https://security-test.supabase.co/storage/v1/object/public/patient-photos/${B}/other.jpg`;const r=await request('/photos/'+P,A);assert.notEqual(r.status,200);assert.equal(signed.length,0)});
test('external photo URL is never returned',async()=>{photos[0].photoUrl='https://external.invalid/image.jpg';const r=await request('/photos/'+P,A);assert.notEqual(r.status,200);assert.equal(signed.length,0)});
test('photo deletion removes owned object',async()=>{assert.equal((await request('/photos/'+P,A,'DELETE')).status,200);assert.deepEqual(removed,[A+'/photo.jpg'])});
test('reviewed photo deletion rejects before touching storage or records',async()=>{reviews=[{photoId:P,reviewerId:D}];const response=await request('/photos/'+P,A,'DELETE');assert.equal(response.status,409);assert.equal(removed.length,0);assert.equal(writes.length,0);assert.equal(photos.length,1);assert.equal(reviews.length,1)});
test('storage deletion failure retains owned cleanup intent for retry',async()=>{failRemove=true;assert.equal((await request('/photos/'+P,A,'DELETE')).status,503);assert.equal(photos.length,0);assert.equal(cleanups.length,1);assert.equal(cleanups[0].userId,A);removed=[];assert.equal((await request('/photos/'+P,B,'DELETE')).status,404);assert.equal(removed.length,0);failRemove=false;assert.equal((await request('/photos/'+P,A,'DELETE')).status,200);assert.equal(cleanups.length,0);assert.deepEqual(removed,[A+'/photo.jpg'])});
test('cross-account photo deletion does not touch storage',async()=>{assert.equal((await request('/photos/'+P,B,'DELETE')).status,404);assert.equal(removed.length,0);assert.equal(writes.length,0)});

test('former clinician cannot list historical prescriptions',async()=>{const r=await request('/prescriptions',D);assert.equal(r.status,200);const body:any=await r.json();assert.equal(body.prescriptions.length,0)});
for(const method of ['GET','PATCH','DELETE'])test(`former clinician cannot ${method} historical appointment`,async()=>{const r=await request('/appointments/'+P,D,method,method==='PATCH'?{visitNotes:'synthetic'}:undefined);assert.ok([403,404].includes(r.status),`got ${r.status}`);assert.equal(writes.length,0)});
test('former clinician appointment list is empty',async()=>{const r=await request('/appointments',D);assert.equal(r.status,200);const body:any=await r.json();assert.equal(body.appointments.length,0)});
test('patient cannot book unassigned clinician',async()=>{const r=await request('/appointments',A,'POST',{dermatologistId:E,type:'consultation',scheduledDate:'2027-01-01T12:00:00Z',concern:'synthetic testing only'});assert.equal(r.status,403);assert.equal(writes.length,0)});
test('historical appointment patient still has access',async()=>{const r=await request('/appointments/'+P,B);assert.equal(r.status,200)});
test('authorized appointment nested photos are private',async()=>{appointments[0].patientId=A;appointments[0].relatedPhotos=photos;const r=await request('/appointments/'+P,D);assert.equal(r.status,200);const body:any=await r.json();assert.match(body.appointment.relatedPhotos[0].photoUrl,/\/object\/sign\//)});
test('former clinician cannot retrieve messages or mark them read',async()=>{const r=await request('/messages?receiverId='+B,D);assert.equal(r.status,404);assert.equal(writes.length,0)});

test('direct upload intent returns only own server-generated path',async()=>{const r=await request('/photos/upload-url',A,'POST',{mimeType:'image/png'});assert.equal(r.status,200);const body:any=await r.json();assert.match(body.storagePath,new RegExp('^'+A+'/[a-f0-9-]+\\.png$'));assert.match(body.signedUrl,/\/object\/upload\/sign\//)});
test('direct upload completion creates owned photo after storage verification',async()=>{photos=[];const r=await request('/photos/complete-upload',A,'POST',{storagePath:A+'/'+P+'.png',notes:'synthetic'});assert.equal(r.status,201);const body:any=await r.json();assert.equal(body.photo.userId,A);assert.match(body.photo.photoUrl,/\/object\/sign\//);assert.equal(writes.length,1)});
test('direct upload completion refuses another account path',async()=>{const r=await request('/photos/complete-upload',B,'POST',{storagePath:A+'/'+P+'.png'});assert.equal(r.status,400);assert.equal(writes.length,0)});
test('direct upload completion rejects oversized stored file',async()=>{uploadSize=11*1024*1024;const r=await request('/photos/complete-upload',A,'POST',{storagePath:A+'/'+P+'.png'});assert.equal(r.status,400);assert.equal(writes.length,0)});
test('former clinician stats exclude historical appointments',async()=>{const r=await request('/users/stats',D);assert.equal(r.status,200);const body:any=await r.json();assert.equal(body.stats.totalAppointments,0)});
test('repeat direct completion returns the same record',async()=>{photos=[];const body={storagePath:A+'/'+P+'.png'};const first=await request('/photos/complete-upload',A,'POST',body);const second=await request('/photos/complete-upload',A,'POST',body);assert.equal(first.status,201);assert.equal(second.status,200);assert.equal(writes.length,1)});
test('name-only onboarding preserves legacy skin type for the signed-in patient', async () => {
 const r = await request('/users/profile', A, 'PATCH', { name:'  Synthetic Name  ', onboardingCompleted:true });
 assert.equal(r.status,200); assert.equal(users[0].name,'Synthetic Name'); assert.equal(users[0].onboardingCompleted,true); assert.equal(users[1].onboardingCompleted,undefined);
 assert.equal(users[0].skinType,'Sensitive'); assert.equal(writes[0].skinType,undefined);
});
test('incomplete onboarding cannot write a completion flag', async () => {
 const r = await request('/users/profile', A, 'PATCH', { onboardingCompleted:true });
 assert.notEqual(r.status,200); assert.equal(writes.length,0);
});
test('patient profile cannot accept role or assignment fields', async () => {
 const r = await request('/users/profile', A, 'PATCH', { name:'Synthetic Name', userType:'dermatologist', dermatologistId:E });
 assert.notEqual(r.status,200); assert.equal(writes.length,0);
});
test('invalid patient pagination is rejected before database access', async () => {
 const r=await request('/users?page=1x',D);assert.equal(r.status,400);assert.equal(queries.length,0);
});
test('patient search stays assigned and queries the existing name column only', async () => {
 const r=await request('/users?search=Assigned',D);assert.equal(r.status,200);const body:any=await r.json();assert.deepEqual(body.data.map((patient:any)=>patient.id),[A]);
 const query=queries.find(entry=>entry.take===10);assert.deepEqual(query.where,{dermatologistId:D,name:{contains:'Assigned',mode:'insensitive'}});
});
test('legacy patient list is bounded without deferred relation graphs', async () => {
 users.push(...Array.from({length:60},(_,index)=>({id:`synthetic-${index}`,name:`Synthetic ${index}`,dermatologistId:D,createdAt:new Date(2025,0,index+1)})));
 const r=await request('/users/patients?limit=50',D);assert.equal(r.status,200);const body:any=await r.json();assert.equal(body.patients.length,50);assert.equal(body.total,61);assert.deepEqual(body.pagination,{page:1,limit:50,total:61,totalPages:2});
 const query=queries.find(entry=>entry.take===50);assert.equal(query.select.skinPhotos,undefined);assert.equal(query.select.appointments,undefined);assert.equal(query.select.prescriptions,undefined);
});

test('summary photo view omits original URLs and never signs; legacy view is unchanged', async () => {
  const response = await request('/photos/patient/' + A + '?view=summary', D);
  assert.equal(response.status, 200);
  const body: any = await response.json();
  assert.equal('photoUrl' in body.data[0], false);
  assert.equal(body.data[0].id, P);
  assert.equal(signed.length, 0);
  for (const view of ['invalid', 'summary&view=summary']) {
    assert.equal((await request('/photos/patient/' + A + '?view=' + view, D)).status, 400);
  }
});
test('original endpoint freshly authorizes owner/assignment and validates owned paths', async () => {
  for (const identity of [A, D]) {
    const response = await request('/photos/' + P + '/original', identity);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.match((await response.json() as any).photoUrl, /\/object\/sign\//);
  }
  for (const identity of [undefined, B, E]) assert.equal((await request('/photos/' + P + '/original', identity)).status, identity ? 404 : 401);
  users[0].dermatologistId = E;
  assert.equal((await request('/photos/' + P + '/original', D)).status, 404);
  photos[0].photoUrl = B + '/foreign.jpg';
  assert.equal((await request('/photos/' + P + '/original', A)).status, 422);
  assert.equal(signed.length, 2);
  assert.equal((await request('/photos/' + P, D)).status, 403);
});
test('warm thumbnail HTTP access rechecks authorization/path and uses no-store JPEG', async () => {
  const originalFetch = globalThis.fetch;
  let downloads = 0;
  const sharp = require('sharp');
  const bytes = await sharp({ create: { width: 800, height: 600, channels: 3, background: 'red' } }).jpeg().toBuffer();
  globalThis.fetch = async (input, options) => {
    if (String(input).startsWith('https://security-test.supabase.co/')) { downloads++; return new Response(bytes); }
    return originalFetch(input, options);
  };
  try {
    for (const identity of [A, D]) {
      const response = await request('/photos/' + P + '/thumbnail', identity);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.match(response.headers.get('content-type')!, /^image\/jpeg/);
      assert.ok((await response.arrayBuffer()).byteLength > 0);
    }
    assert.equal(downloads, 1);
    for (const identity of [undefined, B, E]) assert.equal((await request('/photos/' + P + '/thumbnail', identity)).status, identity ? 404 : 401);
    users[0].dermatologistId = E;
    assert.equal((await request('/photos/' + P + '/thumbnail', D)).status, 404);
    photos[0].photoUrl = B + '/foreign.jpg';
    assert.equal((await request('/photos/' + P + '/thumbnail', A)).status, 422);
    assert.equal(downloads, 1);
  } finally { globalThis.fetch = originalFetch; }
});
