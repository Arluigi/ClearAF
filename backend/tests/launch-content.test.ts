import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as contract from '../src/contracts/unzitLaunch';
import {validateLaunchDocuments} from '../src/content/launchConsents';
import {validateLaunchIntakeCatalog} from '../src/content/launchIntake';
import {validateLaunchCheckInContent,launchQuestionIds,launchOptionId} from '../src/content/launchCheckIn';
import {revisionInput} from '../src/services/routineCare';
const {validateLaunchContent,publishLaunchContent}=require('../scripts/import-launch-content.cjs');
const validators={contract,validateLaunchDocuments,validateLaunchIntakeCatalog,validateLaunchCheckInContent,revisionInput};
const clinicianId='00000000-0000-4000-8000-000000000001';
function enumValues(schema:any):{values:string[];multi:boolean}|null{const d=schema._def;if(d.schema)return enumValues(d.schema);if(d.innerType)return enumValues(d.innerType);if(d.typeName==='ZodEnum')return {values:d.values,multi:false};if(d.typeName==='ZodArray'){const e=enumValues(d.type);return e&&{...e,multi:true}}return null}
function question(id:string,field:any){const choices=enumValues(field);return {id,prompt:'DRAFT Synthetic '+id,kind:id==='M22'?'attestation':choices?choices.multi?'multi_choice':'choice':'text',required:!['M20','M21'].includes(id),options:(choices?.values??[]).map(id=>({id,label:'DRAFT Synthetic '+id})),fields:[],showWhen:[]}}
function source(){const groups:any={tolerability:['good','some_irritation','not_tolerating'],sideEffects:['none','some'],pregnancyStatus:['pregnant','breastfeeding','trying','not_sure','neither','not_applicable'],newMedicines:['none','some'],physicallyInNC:['yes','no']};return {status:'draft',versionLabel:'0.9-draft',approvalReference:null,clinicianId,consents:structuredClone(contract.fixtures['GET /catalog'].response.consents).map((d:any)=>({...d,body:'DRAFT Synthetic '+d.key,sha256:createHash('sha256').update('DRAFT Synthetic '+d.key).digest('hex')})),eligibilityQuestions:Object.entries(contract.EligibilitySchema.shape).map(([id,s])=>question(id,s)),medicalQuestions:Object.entries(contract.MedicalHistorySchema.shape).map(([id,s])=>question(id,s)),checkInForm:{versionLabel:'0.9-draft',title:'DRAFT Synthetic follow-up',questions:Object.entries(launchQuestionIds).map(([key,id])=>({id,prompt:'DRAFT Synthetic '+key,type:key.endsWith('Details')?'text':'choice',required:!key.endsWith('Details'),options:(groups[key]??[]).map((value:string)=>({id:launchOptionId(key,value),label:'DRAFT Synthetic '+value}))}))},templates:Array.from({length:6},(_,i)=>({key:'synthetic_'+i,name:'Synthetic template '+i,steps:[{title:'Synthetic step',instructions:'DRAFT synthetic fixture only'}]}))}}
test('operator source validation keeps four hashes, fixed question identities, seven topics and six inactive DRAFT templates',()=>{const value=validateLaunchContent(source(),validators);assert.equal(value.content.consents.length,4);assert.equal(value.content.medicalQuestions.length,23);assert.equal(value.content.checkInForm.questions.length,7);assert.equal(value.templates.length,6);assert(value.templates.every((t:any)=>t.isActive===false&&t.name.startsWith('DRAFT: ')))});
test('malformed, forged, rekeyed and unsigned publications fail before any database write',()=>{for(const mutate of [(s:any)=>s.consents[0].sha256='0'.repeat(64),(s:any)=>s.consents[0].acceptedAt='2026-11-09T00:00:00Z',(s:any)=>s.medicalQuestions.pop(),(s:any)=>s.medicalQuestions[0].options[0].id='invalid',(s:any)=>s.templates[0].isActive=true,(s:any)=>s.amountCents=1,(s:any)=>{s.status='approved';s.versionLabel='1.0'}]){const s=source();mutate(s);assert.throws(()=>validateLaunchContent(s,validators))}});
function database(history:any[]=[]){const queries:any[]=[];const db={query:async(sql:string,args?:any[])=>{queries.push({sql,args});if(sql.includes('FROM public.dermatologists'))return {rows:[{id:clinicianId}],rowCount:1};if(sql.includes('FROM public.launch_settings')&&sql.includes('ORDER BY'))return {rows:history};if(sql.includes('where active'))return {rows:[{id:clinicianId,version:1,careAmountCents:3900,allInAmountCents:8900,carePriceId:null,allInPriceId:null,contentVersion:'0.9-draft',content:{}}]};if(sql.includes('max(version)'))return {rows:[{version:history.length+1}]};if(sql.includes('FROM public.care_template_revisions'))return {rows:[]};return {rows:[],rowCount:1}}};return {db,queries}}
test('publication atomically preserves billing snapshots and seeds six clinician-owned DRAFT revisions',async()=>{const {db,queries}=database();const result=await publishLaunchContent(db,validateLaunchContent(source(),validators));assert.equal(result.templates,6);assert.equal(result.published,1);assert.equal(queries.at(-1).sql,'COMMIT');const insert=queries.find(x=>x.sql.startsWith('INSERT INTO public.launch_settings'));assert.ok(insert);assert.equal(insert.args[1],3900);assert.equal(insert.args[2],8900)});
test('document key/version text is immutable across publications',async()=>{const s=source(),old=structuredClone(s.consents);old[0].body='DRAFT different original text';old[0].sha256=createHash('sha256').update(old[0].body).digest('hex');const {db,queries}=database([{content:{consents:old}}]);await assert.rejects(publishLaunchContent(db,validateLaunchContent(s,validators)),/version/);assert.equal(queries.at(-1).sql,'ROLLBACK');assert.equal(queries.some(x=>x.sql.startsWith('INSERT INTO')),false)});
test('identical publication replay preserves later clinician edits without new versions',async()=>{const value=validateLaunchContent(source(),validators),{db,queries}=database([{content:{consents:value.content.consents}}]);const query=db.query;db.query=async(sql:string,args?:any[])=>sql.includes('where active')?{rows:[{clinicianId,version:9,content:value.content}]}:query(sql,args);assert.deepEqual(await publishLaunchContent(db,value),{published:0,templates:0,version:9});assert.equal(queries.some(x=>x.sql.startsWith('INSERT INTO')),false)});
test('a newly numbered document can publish changed text while old versions remain immutable',async()=>{const input=source(),previous=structuredClone(input.consents);input.consents[0].version=2;input.consents[0].body='DRAFT Synthetic replacement version';input.consents[0].sha256=createHash('sha256').update(input.consents[0].body).digest('hex');const {db}=database([{content:{consents:previous}}]);assert.equal((await publishLaunchContent(db,validateLaunchContent(input,validators))).published,1)});
test('template write failure rolls the settings pointer and all revisions back together',async()=>{const {db,queries}=database(),query=db.query;db.query=async(sql:string,args?:any[])=>{if(sql.startsWith('INSERT INTO public.care_template_revisions'))throw Error('Synthetic write failure');return query(sql,args)};await assert.rejects(publishLaunchContent(db,validateLaunchContent(source(),validators)));assert.equal(queries.at(-1).sql,'ROLLBACK');assert.equal(queries.some(x=>x.sql==='COMMIT'),false)});
test('replacement pending-review publication stays draft with new immutable document versions',()=>{
 const input=source();input.versionLabel='1.0-pending-review';
 for(const doc of input.consents){doc.version=2;doc.versionLabel=input.versionLabel;}
 input.checkInForm.versionLabel=input.versionLabel;
 const value=validateLaunchContent(input,validators);
 assert.equal(value.content.publication.status,'draft');assert.equal(value.versionLabel,'1.0-pending-review');assert(value.templates.every((t:any)=>t.isActive===false));
 for(const mutate of [(s:any)=>s.consents[0].versionLabel='1.0',(s:any)=>s.checkInForm.versionLabel='1.0',(s:any)=>{s.status='approved';s.approvalReference='synthetic-approval';}]){const bad=structuredClone(input);mutate(bad);assert.throws(()=>validateLaunchContent(bad,validators));}
});

test('client pending-review catalog preserves identities, branching, guidance and draft revisions',()=>{
 const catalog=require('../src/content/catalogs/1.0-pending-review.json');
 const value=validateLaunchContent({...catalog,clinicianId},validators);
 assert.equal(value.versionLabel,'1.0-pending-review');
 assert.equal(value.content.publication.status,'draft');
 assert.equal(value.content.eligibilityQuestions.length,4);
 const questions=value.content.medicalQuestions;
 assert.equal(questions.length,23);
 assert.deepEqual(new Set(questions.map((q:any)=>q.id)),new Set([...Array.from({length:22},(_,i)=>'M'+(i+1)),'medicationPreference']));
 assert.equal(questions.findIndex((q:any)=>q.id==='medicationPreference'),questions.findIndex((q:any)=>q.id==='M11')+1);
 assert.deepEqual(questions.find((q:any)=>q.id==='medicationPreference').options.map((o:any)=>o.id),['topical','oral','no_preference']);
 assert.equal(questions.find((q:any)=>q.id==='M22').required,true);
 assert.equal(questions.find((q:any)=>q.id==='M20').required,false);
 assert.equal(questions.find((q:any)=>q.id==='M21').required,false);
 assert.equal(questions.find((q:any)=>q.id==='M2').showWhen[0].questionId,'M1');
 for(const id of ['M3','M4'])assert.equal(questions.find((q:any)=>q.id===id).showWhen[0].questionId,'M2');
 assert.equal(questions.find((q:any)=>q.id==='M8').showWhen[0].questionId,'M1');
 assert.deepEqual(value.content.consents.map((d:any)=>d.key),['telehealth','medication','privacy_notice','subscription_terms']);
 assert(value.content.consents.every((d:any)=>d.version===2&&d.versionLabel===value.versionLabel&&d.acceptedAt===null));
 assert.deepEqual(value.content.photoGuidance.slots.filter((s:any)=>s.required).map((s:any)=>s.id),['front','left','right']);
 for(const id of ['chest','back'])assert.deepEqual(value.content.photoGuidance.slots.find((s:any)=>s.id===id).requiredWhen,{questionId:'M6',value:id});
 assert.equal(value.content.identityGuidance.items.length,3);
 assert.deepEqual(new Set(value.content.checkInForm.questions.map((q:any)=>q.id)),new Set(Object.values(launchQuestionIds)));
 assert.equal(value.content.checkInForm.questions.filter((q:any)=>q.required).length,5);
 assert.equal(value.templates.length,6);
 assert(value.templates.every((t:any)=>!t.isActive));
 assert.equal(catalog.clinicianId,undefined);
});

test('guidance rejects missing, duplicated and incorrectly required capture identities',()=>{
 const catalog=require('../src/content/catalogs/1.0-pending-review.json');
 for(const mutate of [
  (s:any)=>s.photoGuidance.slots.pop(),
  (s:any)=>s.photoGuidance.slots[0].required=false,
  (s:any)=>s.photoGuidance.slots[3].requiredWhen.value='back',
  (s:any)=>s.photoGuidance.slots[5].id='front',
  (s:any)=>s.identityGuidance.items[0].required=false,
  (s:any)=>s.identityGuidance.items[1].id='government_id',
 ]){const input=structuredClone(catalog);mutate(input);assert.throws(()=>validateLaunchContent({...input,clinicianId},validators))}
});
