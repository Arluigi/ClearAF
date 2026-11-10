import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isIntakeV2} from '../src/services/intakeV2';
import {CatalogSchema} from '../src/contracts/unzitLaunch';
import {launchCatalog} from '../src/services/launchSettings';
import * as contract from '../src/contracts/unzitLaunch';
import {validateLaunchDocuments} from '../src/content/launchConsents';
import {validateLaunchIntakeCatalog,validateIntakeV2Catalog} from '../src/content/launchIntake';
import {validateLaunchCheckInContent} from '../src/content/launchCheckIn';
import {revisionInput} from '../src/services/routineCare';
import {createHash} from 'node:crypto';
const {validateLaunchContent,assertDocumentHistory}=require('../scripts/import-launch-content.cjs');
const old=require('../src/content/catalogs/2.1-pending-review.json');
const next=()=>JSON.parse(readFileSync(new URL('../src/content/catalogs/2.2-pending-review.json',import.meta.url),'utf8'));
test('clinician wording is new v2 publication preserving legal bodies and historical guidance',()=>{
 const value=next();
 assert.equal(value.versionLabel,'2.2-pending-review');assert.equal(isIntakeV2(value.versionLabel),true);
 assert.equal(createHash('sha256').update(readFileSync(new URL('../src/content/catalogs/2.1-pending-review.json',import.meta.url))).digest('hex'),'1a237376ade5a485e54ec549936be51ebd1229d5f3a03d82f3115a3c1466240e');
 const published=validateLaunchContent({...value,clinicianId:'00000000-0000-4000-8000-000000000001'},{contract,validateLaunchDocuments,validateLaunchIntakeCatalog,validateIntakeV2Catalog,validateLaunchCheckInContent,revisionInput});
 assert.doesNotThrow(()=>assertDocumentHistory([{content:{consents:old.consents}}],published.content.consents));
 assert.deepEqual(value.consents.map((d:any)=>[d.body,d.sha256]),old.consents.map((d:any)=>[d.body,d.sha256]));
 assert.ok(value.consents.every((d:any)=>d.version===5&&d.versionLabel===value.versionLabel));
 const {consents,...patientCopy}=value;assert.equal(JSON.stringify(patientCopy).includes('Dr. Om'),false);
 assert.deepEqual(value.photoGuidance.slots,old.photoGuidance.slots);
 for(const key of ['fullNameLabel','dateOfBirthLabel','birthConfirmation','idTitle','selfieTitle','idInstructions','selfieInstructions','idPreviewLabel','selfiePreviewLabel'])assert.equal(value.identityGuidance.copy[key],old.identityGuidance.copy[key]);
 for(const key of ['setReviewHint','reviewAdvice','zoomLabel'])assert.equal(value.photoGuidance.copy[key],old.photoGuidance.copy[key]);
});
test('clinician reviewed capture wording is exact',()=>{
 const {identityGuidance:i,photoGuidance:p}=next();
 assert.equal(i.copy.ncWarning,'UNZIT can only treat you while you are physically in North Carolina. If you are somewhere else right now, please get care where you are.');
 assert.equal(i.copy.completionHint,'To continue, add a clear photo of your ID and a selfie, confirm your date of birth and confirm you’re in North Carolina. UNZIT is for adults 18 and older.');
 assert.equal(i.copy.prepareFailure,'We couldn’t upload this photo. Retake it in good light and make sure the text and your face are sharp.');
 assert.equal(p.copy.completionHint,'Add all required photos to continue. Photos aren’t sent to your doctor until you tap Share.');
 assert.equal(p.copy.afterSave,'This photo is saved privately and will be sent to your doctor when you share your photo set.');
 assert.equal(p.copy.discardMessage,'Discard this photo? It hasn’t been sent to your doctor.');
 assert.equal(p.copy.prepareFailure,'We couldn’t upload this photo. Retake it in good light, and use a separate photo for each angle.');
 for(const copy of [i.copy,p.copy]){assert.equal(copy.safetyTitle,'Having a problem?');assert.equal(copy.safetyMessage,'If this is an emergency, call 911. For a reaction to a UNZIT medicine, stop it and message your doctor in the app.');}
 assert.ok(i.prompt.includes('Your doctor checks your identity before any treatment.'));
 assert.ok(p.instructions[0].startsWith('Photos are how your doctor examines your skin.'));
 assert.ok(p.instructions[0].includes('Your doctor may ask for new photos'));
});
test('2.2 projection requires capture copy',async()=>{
 const value=next(),s={version:11,contentVersion:value.versionLabel,content:value,careAmountCents:3900,allInAmountCents:8900,weeklyWeeks:12};
 const projected=await launchCatalog({launchSettings:{findFirst:async()=>s}},value.versionLabel);
 assert.equal(projected.questionnaireVersion,value.versionLabel);assert.deepEqual(projected.identityGuidance,value.identityGuidance);
 assert.equal(CatalogSchema.safeParse({...projected,identityGuidance:undefined}).success,false);
});

test('2.2 enrollment metadata names six complete medical topics and excludes capture/logistics from them',()=>{
 const c=JSON.parse(readFileSync(new URL('../src/content/catalogs/2.2-pending-review.json',import.meta.url),'utf8'));
 assert.equal(c.enrollmentFlow.expectation,'About 15 minutes. You’ll need your ID and good lighting.');
 const topics=c.enrollmentFlow.medicalSections;assert.equal(topics.length,6);const ids=topics.flatMap((s:any)=>s.questionIds);assert.equal(new Set(ids).size,ids.length);assert.ok(ids.includes('W1'));assert.ok(ids.includes('A4'));assert.ok(ids.includes('H6'));assert.equal(ids.includes('F2'),false);assert.equal(ids.includes('G1'),false);assert.deepEqual(c.enrollmentFlow.quickEligibilityQuestions.map((q:any)=>q.id),['E1','E2','E3','E4']);
});
