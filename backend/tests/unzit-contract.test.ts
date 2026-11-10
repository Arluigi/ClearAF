import {test} from 'node:test';
import assert from 'node:assert/strict';
import {contracts, MembershipSchema, DestinationSchema, MedicalHistorySchema, InstantSchema, DateOnlySchema, pageSchema, PlanSchema, endpoints, fixtures} from '../src/contracts/unzitLaunch';
test('each amended endpoint has a parseable request and response fixture',()=>{
 assert.equal(endpoints.length,24);
 for(const endpoint of endpoints){assert.ok(fixtures[endpoint],endpoint);const c=contracts[endpoint];c.request.parse(fixtures[endpoint].request);c.response.parse(fixtures[endpoint].response)}
});
test('server owned fields and obsolete billing endpoints cannot be supplied',()=>{
 const checkout=contracts['POST /billing/checkout'].request;
 const valid=fixtures['POST /billing/checkout'].request;
 for(const key of ['amountCents','clinicianId','paidThrough','acceptedAt','access'])assert.equal(checkout.safeParse({...valid,[key]:42}).success,false);
 for(const path of ['/billing/cancel','/billing/switch','/billing/operations/:operationId'])assert.equal(endpoints.some(x=>x.endsWith(path)),false);
 assert.equal(MembershipSchema.safeParse({...fixtures['GET /billing'].response.membership,status:'activating'}).success,false);
});
test('dates, integer money, paging and discriminated destinations are bounded',()=>{
 for(const v of ['2026-02-30','2026-13-01','26-01-01'])assert.equal(DateOnlySchema.safeParse(v).success,false);
 assert.equal(InstantSchema.safeParse('2026-11-09').success,false);
 assert.equal(PlanSchema.safeParse({...fixtures['GET /catalog'].response.plans[0],amountCents:39.5}).success,false);
 assert.equal(DestinationSchema.safeParse({planId:'all_in',pharmacy:'vida',shippingAddress:{recipient:'Synthetic',line1:'1 Test',line2:null,city:'Raleigh',state:'IL',postalCode:'27601'}}).success,false);
 assert.equal(pageSchema(PlanSchema).safeParse({data:[],pagination:{page:0,limit:20,total:0,totalPages:0}}).success,false);
});
test('medical contract preserves explicit null branches and requires active selections',()=>{
 const valid=fixtures['PUT /enrollment/:caseId/medical/:revisionId'].request.answers;
 assert.equal(MedicalHistorySchema.safeParse(valid).success,true);
 assert.equal(MedicalHistorySchema.safeParse({...valid,M13:['none','lithium']}).success,false);
 assert.equal(MedicalHistorySchema.safeParse({...valid,M22:false}).success,false);
});
test('consent bodies preserve exact published bytes for the recorded SHA-256',async()=>{const {ConsentSchema}=await import('../src/contracts/unzitLaunch');const {createHash}=await import('node:crypto');const body='  DRAFT Synthetic original legal text.\n';const doc={...fixtures['GET /catalog'].response.consents[0],body,sha256:createHash('sha256').update(body).digest('hex')};const parsed=ConsentSchema.parse(doc);assert.equal(parsed.body,body);assert.equal(createHash('sha256').update(parsed.body).digest('hex'),parsed.sha256)});
