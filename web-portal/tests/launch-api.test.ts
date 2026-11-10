import test from 'node:test';
import assert from 'node:assert/strict';
import './env';
import { apiService, authStorage, supabase } from '../src/lib/api';
import { createLaunchAPI } from '../src/lib/launch';
test('amended launch paths, paging and revision body without idempotency headers', async () => {
  const calls: {path:string;options?:RequestInit}[]=[];
  const api=createLaunchAPI(async <T>(path:string,options?:RequestInit)=>{calls.push({path,options});return {data:[],pagination:{page:2,limit:20,total:0,totalPages:0}} as T;});
  await api.catalog(); await api.chart('patient/a',2); await api.queue('check_in',2);await api.images('p','i');
  await api.review('p','review-id',{targetType:'case',targetId:'c',expectedRevision:4,outcome:'needs_changes',patientMessage:'Please retake.'});await api.billing();
  assert.deepEqual(calls.map(x=>x.path),['/catalog','/patients/patient%2Fa/chart?page=2&limit=20','/review-queue?page=2&limit=20&kind=check_in','/patients/p/identity/i/images','/patients/p/reviews/review-id','/billing']);
  assert.equal(calls[4].options?.method,'PUT');assert.equal(JSON.parse(String(calls[4].options?.body)).expectedRevision,4);assert.equal(calls[4].options?.headers,undefined);
});
test('launch transport retains bearer, privacy, error codes and account cancellation', async () => {
  await new Promise<void>(resolve=>setImmediate(resolve));
  const old=supabase.auth.getSession, oldFetch=globalThis.fetch;
  const session={access_token:'synthetic-token',user:{id:'clinician-a'}};
  authStorage.beginLogin(); apiService.acceptSession(session);
  supabase.auth.getSession=async()=>({data:{session},error:null}) as Awaited<ReturnType<typeof old>>;
  let pending: (()=>void)|undefined;
  globalThis.fetch=async (_url,options)=>{assert.equal(new URL(String(_url)).pathname,'/api/launch/patients/p/chart');assert.equal(options?.cache,'no-store');assert.equal(options?.referrerPolicy,'no-referrer');assert.equal((options?.headers as Record<string,string>).Authorization,'Bearer synthetic-token');return new Response(JSON.stringify({error:'Assigned clinician required',code:'INSUFFICIENT_PERMISSIONS'}),{status:403});};
  try {
    const api=apiService.scoped().launch();await assert.rejects(api.chart('p'),{status:403,code:'INSUFFICIENT_PERMISSIONS'});
    globalThis.fetch=async()=>{await new Promise<void>(resolve=>{pending=resolve;});return new Response('{}');};
    const request=api.chart('p');await new Promise<void>(resolve=>setImmediate(resolve));apiService.acceptSession({access_token:'other',user:{id:'clinician-b'}});pending!();await assert.rejects(request);assert.throws(()=>api.chart('p'));
  } finally {supabase.auth.getSession=old;globalThis.fetch=oldFetch;}
});
test('v2 catalog opt-in and structured personal screening decisions stay additive',async()=>{
 const calls:{path:string;options?:RequestInit}[]=[];
 const api=createLaunchAPI(async <T>(path:string,options?:RequestInit)=>{calls.push({path,options});return {} as T;});
 await api.catalog('2.0-pending-review');
 await api.catalog('1.0-pending-review');
 await api.review('patient','review',{targetType:'case',targetId:'case',expectedRevision:4,outcome:'approve',patientMessage:null,clearHold:{decisionNote:'Personal review after messaging'},screeningDecisions:{ibd:{activity:'inactive',priorCDifficile:false,decisionNote:'Confirmed with patient'},marksAcneRelated:true,dailySunscreenConfirmed:true}});
 assert.deepEqual(calls[0].options?.headers,{'X-UNZIT-Questionnaire':'2.0-pending-review'});
 assert.equal(calls[1].options,undefined);
 const body=JSON.parse(String(calls[2].options?.body));
 assert.equal(body.clearHold.decisionNote,'Personal review after messaging');
 assert.equal(body.screeningDecisions.ibd.priorCDifficile,false);
 assert.equal(body.screeningDecisions.marksAcneRelated,true);
});
test('catalog preserves both supported v2 publication headers and legacy calls stay unversioned',async()=>{
 const calls:{path:string;options?:RequestInit}[]=[];
 const api=createLaunchAPI(async <T>(path:string,options?:RequestInit)=>{calls.push({path,options});return {} as T;});
 for(const version of ['2.0-pending-review','2.1-pending-review',undefined,'1.0-pending-review','2.2-pending-review'])await api.catalog(version);
 assert.deepEqual(calls.map(call=>call.path),Array(5).fill('/catalog'));
 assert.deepEqual(calls[0].options?.headers,{'X-UNZIT-Questionnaire':'2.0-pending-review'});
 assert.deepEqual(calls[1].options?.headers,{'X-UNZIT-Questionnaire':'2.1-pending-review'});
 for(const call of calls.slice(2,4))assert.equal(call.options,undefined);
 assert.deepEqual(calls[4].options?.headers,{'X-UNZIT-Questionnaire':'2.2-pending-review'});
});
