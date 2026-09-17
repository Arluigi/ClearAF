import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Module from 'node:module';
import { randomUUID } from 'node:crypto';
const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222', C='33333333-3333-4333-8333-333333333333', D='44444444-4444-4444-8444-444444444444';
process.env.SUPABASE_URL='https://routine-test.supabase.co';process.env.SUPABASE_ANON_KEY='synthetic';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic';
process.env.ENROLLMENT_ENFORCEMENT='off'; // The gate itself is covered by enrollment-gate.test.ts.
let templates:any[]=[],forms:any[]=[],responses:any[]=[],revisions:any[]=[],completions:any[]=[],legacyWrites=0,assigned=C,queue=Promise.resolve(),afterLock:(()=>void)|undefined;
const isRange=(v:any)=>typeof v==='object'&&v!==null&&!(v instanceof Date)&&Object.keys(v).length>0&&Object.keys(v).every(k=>['gt','gte','lt','lte'].includes(k));
const inRange=(value:any,cond:any)=>Object.entries(cond).every(([op,bound]:any)=>op==='gt'?value>bound:op==='gte'?value>=bound:op==='lt'?value<bound:value<=bound);
const matches=(r:any,w:any):boolean=>Object.entries(w||{}).every(([k,v]:any)=>isRange(v)?inRange(r[k],v):typeof v==='object'&&v!==null?matches(r,v):r[k]===v);
function model(rows:()=>any[]){return {
 findUnique:async({where}:any)=>rows().find(r=>matches(r,where))??null,
 findFirst:async(args:any)=>(await model(rows).findMany(args))[0]??null,
 findMany:async({where,orderBy,skip=0,take,include}:any={})=>{let found=rows().filter(r=>matches(r,where));for(const order of [...(Array.isArray(orderBy)?orderBy:orderBy?[orderBy]:[])].reverse()){const [key,dir]=Object.entries(order)[0];found.sort((a,b)=>(a[key]<b[key]?-1:a[key]>b[key]?1:0)*(dir==='desc'?-1:1))}return found.slice(skip,take===undefined?undefined:skip+take).map(r=>include?.form?{...r,form:forms.find(v=>v.id===r.formId)}:include?.routine?{...r,routine:revisions.find(v=>v.id===r.revisionId)}:r)},
 count:async({where}:any)=>rows().filter(r=>matches(r,where)).length,
 create:async({data,include}:any)=>{if(rows().some(r=>r.id===data.id||(data.revisionId&&r.userId===data.userId&&r.revisionId===data.revisionId&&r.localDate===data.localDate)))throw Object.assign(new Error('unique'),{code:'P2002'});const row={...data,...(data.formId||data.revisionId?{receivedAt:new Date()}:{createdAt:new Date(),updatedAt:new Date()})};rows().push(row);return include?.form?{...row,form:forms.find(v=>v.id===row.formId)}:row}
}}
const legacy={create:async()=>{legacyWrites++;return{}},update:async()=>{legacyWrites++;return{}},delete:async()=>{legacyWrites++;return{}},updateMany:async()=>{legacyWrites++;return{}},findMany:async()=>[],findUnique:async()=>null};
const db:any={careTemplateRevision:model(()=>templates),careFormRevision:model(()=>forms),careFormResponse:model(()=>responses),careRoutineRevision:model(()=>revisions),careRoutineCompletion:model(()=>completions),routine:legacy,routineStep:legacy,user:{findUnique:async({where}:any)=>where.id===A?{id:A,dermatologistId:assigned}:where.id===B?{id:B,dermatologistId:D}:null},$queryRaw:async()=>{afterLock?.();afterLock=undefined;return[{id:A}]},$transaction:async(fn:any)=>{const prior=queue;let release!:()=>void;queue=new Promise<void>(r=>release=r);await prior;try{return await fn(db)}finally{release()}}};
const originalLoad=(Module as any)._load;(Module as any)._load=function(name:string,...args:any[]){if(name==='@prisma/client')return{PrismaClient:class{constructor(){return db}}};return originalLoad.call(this,name,...args)};
const app=express();app.use(express.json());app.use((req:any,res,next)=>{const id=req.header('x-identity');if(!id)return res.sendStatus(401);req.user={id,userType:[C,D].includes(id)?'dermatologist':'patient',email:'synthetic@test.invalid'};next()});app.use('/routines',require('../src/routes/care-support').default);app.use(require('../src/middleware/errorHandler').errorHandler);(Module as any)._load=originalLoad;
let server:any,base:string;
before(async()=>{server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}/routines`});after(()=>new Promise<void>(r=>server.close(r)));beforeEach(()=>{templates=[];forms=[];responses=[];revisions=[];completions=[];legacyWrites=0;assigned=C;afterLock=undefined});
async function call(path:string,identity=A,method='GET',body?:any){const response=await fetch(base+path,{method,headers:{'x-identity':identity,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return{status:response.status,body:await response.json().catch(()=>({})) as any}}
const definition=(expectedRevisionId:string|null=null)=>({expectedRevisionId,name:'Original synthetic routine',isActive:true,steps:[{title:'Synthetic step',instructions:'Synthetic instructions'}]});
const edit=(id=randomUUID(),body=definition(),identity=C,patient=A,slot='morning')=>call(`/patients/${patient}/${slot}/revisions/${id}`,identity,'PUT',body);
const event=(revisionId:string)=>({revisionId,completedAt:'2026-01-01T06:30:00.000Z',localDate:'2026-01-01',timeZone:'Asia/Kolkata'});
const complete=(body:any,id=randomUUID(),identity=A)=>call(`/completions/${id}`,identity,'PUT',body);
const question={id:randomUUID(),prompt:'Neutral prompt',type:'choice',required:true,options:[{id:randomUUID(),label:'First'},{id:randomUUID(),label:'Second'}]};
const formBody=(expectedRevisionId:string|null=null)=>({expectedRevisionId,title:'Neutral form',isActive:true,questions:[question]});
const saveForm=(id=randomUUID(),body:any=formBody(),identity=C)=>call(`/patients/${A}/forms/${id}`,identity,'PUT',body);
test('template revisions immutable owned optimistic and retryable',async()=>{const t=randomUUID(),r=randomUUID(),path=`/templates/${t}/revisions/${r}`;const first=await call(path,C,'PUT',definition());assert.equal(first.status,201);assert.equal(first.body.template.id,t);assert.equal(first.body.template.revisionId,r);assert.equal((await call(path,C,'PUT',definition())).status,200);assert.equal((await call(path,C,'PUT',{...definition(),name:'Different'})).status,409);assert.equal((await call(`/templates/${t}/revisions/${randomUUID()}`,C,'PUT',definition())).status,409);assert.equal((await call(`/templates/${t}/revisions/${randomUUID()}`,D,'PUT',definition(r))).status,404);assert.equal((await call(path,A,'PUT',definition())).status,403);const next=await call(`/templates/${t}/revisions/${randomUUID()}`,C,'PUT',definition(r));assert.equal(next.status,201);assert.equal((await call(path,C,'PUT',definition())).status,200);assert.equal(templates.length,2)});
test('form assignment checked under lock before retries',async()=>{assert.equal((await saveForm(randomUUID(),formBody(),D)).status,404);afterLock=()=>{assigned=D};assert.equal((await saveForm()).status,404);assigned=C;const id=randomUUID();assert.equal((await saveForm(id)).status,201);assert.equal((await saveForm(id)).status,200);assert.equal((await saveForm()).status,409);assert.equal((await saveForm(id,{...formBody(),title:'Changed'})).status,409);assigned=D;assert.equal((await saveForm(id)).status,404)});
test('concurrent form edits retain one expected revision winner',async()=>{assert.deepEqual((await Promise.all([saveForm(),saveForm()])).map(r=>r.status).sort(),[201,409]);assert.equal(forms.length,1)});
test('answers reference original form and enforce identity required choice and owner',async()=>{const f=await saveForm();assert.equal(f.status,201);const formId=f.body.form.id,id=randomUUID(),body={formId,submittedAt:'2026-01-01T00:00:00Z',answers:[{questionId:question.id,optionId:question.options[0].id}]};assert.equal((await call(`/responses/${id}`,A,'PUT',body)).status,201);const inactive=await saveForm(randomUUID(),{...formBody(formId),isActive:false,questions:[]});assert.equal(inactive.status,201);assert.equal((await call(`/responses/${randomUUID()}`,A,'PUT',{...body,formId:inactive.body.form.id})).status,400);assert.equal((await call(`/responses/${id}`,A,'PUT',body)).status,200);assert.equal((await call(`/responses/${randomUUID()}`,A,'PUT',body)).status,201);assert.equal((await call(`/responses/${id}`,A,'PUT',{...body,answers:[{questionId:question.id,optionId:question.options[1].id}]})).status,409);assert.equal((await call(`/responses/${randomUUID()}`,B,'PUT',body)).status,404);for(const answers of [[],[body.answers[0],body.answers[0]],[{questionId:question.id,text:'wrong'}],[{questionId:question.id,optionId:randomUUID()}],[{questionId:randomUUID(),text:'unknown'}]])assert.equal((await call(`/responses/${randomUUID()}`,A,'PUT',{...body,answers})).status,400);const list=await call(`/patients/${A}/responses`,C);assert.equal(list.body.data[0].form.title,'Neutral form');assert.equal(list.body.pagination.total,2);assert.equal((await call(`/patients/${A}/responses`,D)).status,404)});
test('month date pagination are strictly validated before database reads',async()=>{for(const month of ['2026-13','2026-00','26-01','2026-1'])assert.equal((await call('/calendar?month='+month)).status,400);for(const query of ['localDate=2026-02-30','localDate=2026-01-01&limit=51','localDate=2026-01-01&page=0'])assert.equal((await call('/calendar/events?'+query)).status,400);assert.equal((await call(`/patients/${A}/calendar?month=2026-01`,D)).status,404)});
test('response ID owned by another patient concealed with caller-owned form',async()=>{const first=await saveForm();assert.equal(first.status,201);const other=await call(`/patients/${B}/forms/${randomUUID()}`,D,'PUT',formBody());assert.equal(other.status,201);const id=randomUUID(),body={formId:first.body.form.id,submittedAt:'2026-01-01T00:00:00Z',answers:[{questionId:question.id,optionId:question.options[0].id}]};assert.equal((await call(`/responses/${id}`,A,'PUT',body)).status,201);assert.equal((await call(`/responses/${id}`,B,'PUT',{...body,formId:other.body.form.id})).status,404);assert.equal(responses.length,1)});
test('same response attempt races yield one immutable record',async()=>{const first=await saveForm();assert.equal(first.status,201);const id=randomUUID(),body={formId:first.body.form.id,submittedAt:'2026-01-01T00:00:00Z',answers:[{questionId:question.id,optionId:question.options[0].id}]};assert.deepEqual((await Promise.all([call(`/responses/${id}`,A,'PUT',body),call(`/responses/${id}`,A,'PUT',body)])).map(r=>r.status).sort(),[200,201]);assert.equal(responses.length,1)});
test('form reads expose latest inactive state and patient cannot access clinician endpoints',async()=>{const first=await saveForm();assert.equal(first.status,201);const next=await saveForm(randomUUID(),{...formBody(first.body.form.id),isActive:false,questions:[]});assert.equal(next.status,201);assert.equal((await call('/form')).body.form.id,next.body.form.id);assert.equal((await call('/form')).body.form.isActive,false);assert.equal((await call(`/patients/${A}/form`,A)).status,403);assert.equal((await call('/templates',A)).status,403)});
test('day detail returns exact flat completion and immutable routine snapshot',async()=>{const r={id:randomUUID(),userId:A,version:1,name:'Original name',timeOfDay:'morning'};revisions.push(r);completions.push({id:randomUUID(),userId:A,revisionId:r.id,localDate:'2026-01-01',receivedAt:new Date(),completedAt:new Date('2026-01-01T00:00:00Z'),timeZone:'UTC'});const result=await call('/calendar/events?localDate=2026-01-01');assert.equal(result.status,200);assert.equal(result.body.data[0].routine.name,'Original name');assert.equal(result.body.data[0].revisionId,r.id);assert.equal(result.body.data[0].completion,undefined);assert.deepEqual(result.body.pagination,{page:1,limit:20,total:1,totalPages:1})});
function seedTimeline(){
 const at=(iso:string)=>new Date(iso);
 const m1={id:randomUUID(),userId:A,timeOfDay:'morning',version:1,createdBy:C,createdAt:at('2026-08-20T09:00:00Z'),name:'Synthetic morning',isActive:true,steps:[]};
 const m2={...m1,id:randomUUID(),version:2,createdAt:at('2026-09-05T09:00:00Z')};
 const e1={...m1,id:randomUUID(),timeOfDay:'evening',createdAt:at('2026-09-20T09:00:00Z')};
 const other={...m1,id:randomUUID(),userId:B,createdBy:D,createdAt:at('2026-09-06T09:00:00Z')};
 revisions.push(m1,m2,e1,other);
 const done=(revisionId:string,localDate:string,userId=A)=>completions.push({id:randomUUID(),userId,revisionId,localDate,completedAt:at(`${localDate}T07:00:00Z`),timeZone:'UTC',receivedAt:new Date()});
 done(m1.id,'2026-09-01');done(m1.id,'2026-09-02');done(m1.id,'2026-09-03');done(m2.id,'2026-09-05');done(m2.id,'2026-09-15');done(m2.id,'2026-09-16');done(other.id,'2026-09-04',B);
 const form={id:randomUUID(),userId:A,version:1,createdBy:C,createdAt:at('2026-08-01T00:00:00Z'),title:'Neutral form',isActive:true,questions:[question]};
 forms.push(form);
 const reply=(submittedAt:string,userId=A)=>responses.push({id:randomUUID(),userId,formId:form.id,submittedAt:at(submittedAt),receivedAt:at(submittedAt),answers:[{questionId:question.id,optionId:question.options[1].id}]});
 reply('2026-09-01T12:00:00Z');reply('2026-09-14T12:00:00Z');reply('2026-09-10T12:00:00Z');reply('2026-09-16T12:00:00Z');reply('2026-09-12T12:00:00Z',B);
 return {m1,m2,other};
}
test('timeline returns only the patient\'s own versions, recorded days and check-ins between two instants',async()=>{
 const {m1,m2,other}=seedTimeline();
 const r=await call('/timeline?from=2026-09-02T07:04:00.000Z&to=2026-09-15T07:12:00.000Z&timeZone=UTC');
 assert.equal(r.status,200);
 assert.deepEqual([r.body.fromDate,r.body.toDate,r.body.days],['2026-09-02','2026-09-15',14]);
 assert.deepEqual(r.body.routinesAtFrom.map((x:any)=>x.id),[m1.id]);
 assert.deepEqual(r.body.routinesAtTo.map((x:any)=>x.id),[m2.id]);
 assert.deepEqual(r.body.revisions.map((x:any)=>x.id),[m2.id]);
 assert.deepEqual(r.body.completions,{morning:4,evening:0});
 assert.deepEqual(r.body.responses.map((x:any)=>x.submittedAt),['2026-09-10T12:00:00.000Z','2026-09-14T12:00:00.000Z']);
 assert.equal(r.body.responses[0].form.title,'Neutral form');
 assert.equal(r.body.responsesTotal,2);
 const shifted=await call('/timeline?from=2026-09-02T20:00:00.000Z&to=2026-09-15T20:00:00.000Z&timeZone=Asia/Kolkata');
 assert.deepEqual([shifted.body.fromDate,shifted.body.toDate,shifted.body.days],['2026-09-03','2026-09-16',14]);
 assert.deepEqual(shifted.body.completions,{morning:4,evening:0});
 const b=await call('/timeline?from=2026-09-02T07:04:00.000Z&to=2026-09-15T07:12:00.000Z&timeZone=UTC',B);
 assert.deepEqual(b.body.revisions.map((x:any)=>x.id),[other.id]);
 assert.deepEqual(b.body.completions,{morning:1,evening:0});
 assert.equal(b.body.responsesTotal,1);
});
test('timeline rejects clinicians and invalid queries before reading records',async()=>{
 seedTimeline();
 const q='from=2026-09-02T07:04:00.000Z&to=2026-09-15T07:12:00.000Z&timeZone=UTC';
 assert.equal((await call('/timeline?'+q,C)).status,403);
 assert.equal((await call(`/patients/${A}/timeline?`+q,C)).status,404,'no clinician twin');
 for(const query of ['',q.replace('timeZone=UTC','timeZone=%2B05:30'),q+'&page=2','from=2026-09-15T07:12:00.000Z&to=2026-09-02T07:04:00.000Z&timeZone=UTC','from=2020-01-01T00:00:00.000Z&to=2026-09-15T07:12:00.000Z&timeZone=UTC'])
  assert.equal((await call('/timeline?'+query)).status,400,query);
});
