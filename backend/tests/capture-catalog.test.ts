import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as contract from '../src/contracts/unzitLaunch';
import {validateLaunchDocuments} from '../src/content/launchConsents';
import {validateLaunchIntakeCatalog,validateIntakeV2Catalog} from '../src/content/launchIntake';
import {validateLaunchCheckInContent} from '../src/content/launchCheckIn';
import {revisionInput} from '../src/services/routineCare';
import {isIntakeV2} from '../src/services/intakeV2';
import {launchCatalog,selectedLaunchSettings} from '../src/services/launchSettings';
const {validateLaunchContent,assertDocumentHistory}=require('../scripts/import-launch-content.cjs');
const old=require('../src/content/catalogs/2.0-pending-review.json');
const validators={contract,validateLaunchDocuments,validateLaunchIntakeCatalog,validateIntakeV2Catalog,validateLaunchCheckInContent,revisionInput};
const clinicianId='00000000-0000-4000-8000-000000000001';
const next=()=>JSON.parse(readFileSync(new URL('../src/content/catalogs/2.1-pending-review.json',import.meta.url),'utf8'));
function settings(content:any,version:number){return {version,contentVersion:content.versionLabel,content,careAmountCents:3900,allInAmountCents:8900,weeklyWeeks:12};}
test('new capture publication validates source copy without mutating historical guidance or consent identities',()=>{
 assert.equal(createHash('sha256').update(readFileSync(new URL('../src/content/catalogs/2.0-pending-review.json',import.meta.url))).digest('hex'),'0a2492ecb515f0f7a50bd6e9b23e8b985472cf8a3cd136d5e0009e2d25be7830');
 const value=next();const result=validateLaunchContent({...value,clinicianId},validators);
 assert.equal(result.versionLabel,'2.1-pending-review');
 assert.deepEqual(value.photoGuidance.instructions,old.photoGuidance.instructions);
 assert.equal(value.identityGuidance.prompt,old.identityGuidance.prompt);
 assert.equal(value.identityGuidance.copy.birthConfirmation,'I confirm this is my date of birth.');
 assert.equal(value.photoGuidance.copy.afterSave,'Saved privately on this device, then shared with this clinical photo set. Continue only after sharing is confirmed.');
 // 2.1 corrects the NC license number (2022-00012, per Dr. Om, Nov 10 2026); otherwise bodies match 2.0.
 assert.deepEqual(value.consents.map((d:any)=>d.body),old.consents.map((d:any)=>d.body.replace(/(?<!\d)022-00012/g,'2022-00012')));
 assert.ok(value.consents.every((d:any)=>!/(?<!\d)022-00012/.test(d.body)));
 assert.deepEqual(value.consents.map((d:any)=>d.version),[4,4,4,4]);
 assert.doesNotThrow(()=>assertDocumentHistory([{content:{consents:old.consents}}],result.content.consents));
 for(const d of value.consents)assert.equal(d.sha256,createHash('sha256').update(d.body).digest('hex'));
});
test('capture publication rejects absent, unknown, empty or oversized instruction fields',()=>{
 for(const mutate of [(s:any)=>delete s.identityGuidance.copy,(s:any)=>delete s.photoGuidance.copy,(s:any)=>delete s.photoGuidance.copy.afterSave,(s:any)=>s.identityGuidance.copy.accidental='text',(s:any)=>s.photoGuidance.copy.reviewAdvice='',(s:any)=>s.identityGuidance.copy.ncWarning='x'.repeat(2001)]){
  const value=next();mutate(value);assert.throws(()=>validateLaunchContent({...value,clinicianId},validators));
 }
});
test('catalog projection delivers every capture field additively and older catalogs still validate',async()=>{
 const value=next();const publication=validateLaunchContent({...value,clinicianId},validators);
 const s=settings({...publication.content,versionLabel:value.versionLabel},12);
 const projected=await launchCatalog({launchSettings:{findFirst:async()=>s}},value.versionLabel);
 assert.deepEqual(projected.photoGuidance,publication.content.photoGuidance);
 assert.deepEqual(projected.identityGuidance,publication.content.identityGuidance);
 const prior=validateLaunchContent({...old,clinicianId},validators);
 assert.equal(prior.content.photoGuidance.copy,undefined);
 assert.equal(contract.CatalogSchema.safeParse({...projected,questionnaireVersion:'2.0-pending-review',photoGuidance:old.photoGuidance,identityGuidance:old.identityGuidance}).success,true);
 assert.equal(contract.CatalogSchema.safeParse({...projected,questionnaireVersion:'2.0-pending-review',photoGuidance:undefined,identityGuidance:undefined}).success,true);
 for(const overrides of [{photoGuidance:undefined},{identityGuidance:undefined},{photoGuidance:old.photoGuidance},{identityGuidance:old.identityGuidance}]){
  assert.equal(contract.CatalogSchema.safeParse({...projected,...overrides}).success,false);
  await assert.rejects(launchCatalog({launchSettings:{findFirst:async()=>({...s,content:{...s.content,...overrides}})}},value.versionLabel),{statusCode:503,code:'BILLING_UNAVAILABLE'});
 }
});
test('new capture version uses v2 rules while installed v2 and unversioned builds retain their publication',async()=>{
 assert.equal(isIntakeV2('2.1-pending-review'),true);assert.equal(isIntakeV2('2.0-pending-review'),true);assert.equal(isIntakeV2('2.2-pending-review'),false);
 const v1=settings(require('../src/content/catalogs/1.0-pending-review.json'),8),v2=settings(old,9),v21=settings(next(),10);
 const db={launchSettings:{findFirst:async()=>v21,findMany:async()=>[v21,v2,v1]}};
 assert.equal((await selectedLaunchSettings(db,'2.1-pending-review')).version,10);
 assert.equal((await selectedLaunchSettings(db,'2.0-pending-review')).version,9);
 assert.equal((await selectedLaunchSettings(db)).version,8);
 await assert.rejects(selectedLaunchSettings(db,'2.2-pending-review'),{statusCode:503,code:'BILLING_UNAVAILABLE'});
});
