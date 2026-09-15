import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluate,ageOn,rulesFromEnv,RULES_VERSION,US_STATES} from '../src/services/enrollmentRules';
import {currentConsent,consentHash} from '../src/content/consent';
const rules=rulesFromEnv({LICENSED_STATES:'IL,NY',MINIMUM_PATIENT_AGE:'18'});
const base={stateCode:'IL',dateOfBirth:'2000-06-15',pregnancyStatus:'none' as const};
test('eligible adult in a licensed state with no pregnancy exclusion',()=>{
 assert.deepEqual(evaluate(base,rules,'2026-09-15'),{eligible:true,reasons:[],flags:[]});
});
test('state outside the list and outside the US are not eligible',()=>{
 assert.deepEqual(evaluate({...base,stateCode:'TX'},rules,'2026-09-15').reasons,['state']);
 assert.deepEqual(evaluate({...base,stateCode:'NON_US'},rules,'2026-09-15').reasons,['state']);
});
test('age boundary is the birthday itself',()=>{
 assert.equal(evaluate({...base,dateOfBirth:'2008-09-15'},rules,'2026-09-15').eligible,true);
 assert.deepEqual(evaluate({...base,dateOfBirth:'2008-09-16'},rules,'2026-09-15').reasons,['age']);
 assert.equal(ageOn('2008-02-29','2026-02-28'),17);
 assert.equal(ageOn('2008-02-29','2026-03-01'),18);
});
test('pregnancy and breastfeeding exclude; trying to conceive is flagged',()=>{
 assert.deepEqual(evaluate({...base,pregnancyStatus:'pregnant'},rules,'2026-09-15').reasons,['pregnancy']);
 assert.deepEqual(evaluate({...base,pregnancyStatus:'breastfeeding'},rules,'2026-09-15').reasons,['breastfeeding']);
 assert.deepEqual(evaluate({...base,pregnancyStatus:'trying_to_conceive'},rules,'2026-09-15'),{eligible:true,reasons:[],flags:['trying_to_conceive']});
});
test('multiple reasons are all reported in a stable order',()=>{
 assert.deepEqual(evaluate({stateCode:'NON_US',dateOfBirth:'2015-01-01',pregnancyStatus:'pregnant'},rules,'2026-09-15').reasons,['state','age','pregnancy']);
});
test('configuration parsing is strict with documented defaults',()=>{
 assert.deepEqual([...rulesFromEnv({}).licensedStates].sort(),['CA','FL','IL','NY','TX']);
 assert.equal(rulesFromEnv({}).minimumAge,18);
 assert.deepEqual([...rulesFromEnv({LICENSED_STATES:' il , ny '}).licensedStates],['IL','NY']);
 for(const env of [{LICENSED_STATES:'IL,XX'},{LICENSED_STATES:'NON_US'},{MINIMUM_PATIENT_AGE:'17.5'},{MINIMUM_PATIENT_AGE:'-1'}])assert.throws(()=>rulesFromEnv(env));
 assert.equal(US_STATES.length,51);assert.match(RULES_VERSION,/^\d{4}-\d{2}-\d{2}\.\d+$/);
});
test('consent is a hashed DRAFT version 1',()=>{
 const doc=currentConsent();
 assert.equal(doc.version,1);assert.match(doc.title,/DRAFT/);assert.match(doc.body,/911/);
 assert.equal(doc.sha256,consentHash(doc));assert.match(doc.sha256,/^[a-f0-9]{64}$/);
 assert.notEqual(consentHash({...doc,body:doc.body+' '}),doc.sha256);
});
