import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Module from 'node:module';
import {fixtures,contracts} from '../src/contracts/unzitLaunch';
const patient='11111111-1111-4111-8111-111111111111',clinician='22222222-2222-4222-8222-222222222222';
let scoreFilter:any;
const db:any={$transaction:async(fn:any)=>fn(db),eligibilityScreening:{findFirst:async()=>null},launchCase:{findMany:async()=>[{patientId:patient}]},user:{count:async()=>1,findMany:async(args:any)=>{if(args.select?.id&&Object.keys(args.select).length===1)return [{id:patient}];if(args.select?.currentSkinScore&&Object.keys(args.select).length===1){scoreFilter=args.where;return args.where.id?.notIn?.includes(patient)?[]:[{currentSkinScore:85}]}return [{id:patient,currentSkinScore:85,streakCount:12}]}},appointment:{count:async()=>0,findMany:async()=>[]},message:{count:async()=>0}};
const original=(Module as any)._load;(Module as any)._load=function(name:string,...args:any[]){if(name==='@prisma/client')return {PrismaClient:class{constructor(){return db}}};return original.call(this,name,...args)};
const app=express();app.use((req:any,_res,next)=>{req.user={id:clinician,userType:'dermatologist'};next()});app.use(require('../src/routes/dashboard').default);app.get('/legacy-enrollment',async(_req,res)=>res.json(await require('../src/services/enrollment').enrollmentStatus(patient)));(Module as any)._load=original;
let server:any,base:string;before(async()=>{server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`});after(()=>new Promise<void>(r=>server.close(r)));
test('dashboard preserves legacy numeric keys but launch patients cannot contribute mock improvement',async()=>{const response=await fetch(base+'/stats');assert.equal(response.status,200);const body:any=await response.json();assert.equal(body.avgImprovement,0);assert.deepEqual(scoreFilter.id.notIn,[patient]);assert.equal(body.recentPatients[0].currentSkinScore,0);assert.equal(body.recentPatients[0].streakCount,0)});
test('all frozen launch response envelopes validate and contain no score streak or mock improvement keys',()=>{const visit=(value:any)=>{if(!value||typeof value!=='object')return;for(const [key,child] of Object.entries(value)){assert.doesNotMatch(key,/score|streak|improvement/i);visit(child)}};for(const [name,fixture] of Object.entries(fixtures)){contracts[name].response.parse(fixture.response);visit(fixture.response)}});

test('installed clients retain the legacy enrollment envelope and consent fields',async()=>{
 const response=await fetch(base+'/legacy-enrollment');assert.equal(response.status,200);const body:any=await response.json();
 assert.deepEqual(Object.keys(body).sort(),['consent','rulesVersion','screening','status']);assert.equal(body.status,'screening_required');assert.equal(body.screening,null);
 assert.deepEqual(Object.keys(body.consent).sort(),['acceptedAt','body','sha256','title','version']);assert.equal(typeof body.consent.version,'number');assert.equal(body.consent.acceptedAt,null);
});
