import {test} from 'node:test';
import assert from 'node:assert/strict';
const {validateSettings}=require('../scripts/set-launch-settings.cjs');
const id='00000000-0000-4000-8000-000000000001';
const valid={careAmountCents:3900,allInAmountCents:8900,carePriceId:'price_synthetic_care',allInPriceId:'price_synthetic_all_in',clinicianId:id,contentVersion:'0.9-draft'};
const price=(amount:number)=>({livemode:false,active:true,currency:'usd',unit_amount:amount,billing_scheme:'per_unit',transform_quantity:null,custom_unit_amount:null,recurring:{interval:'month',interval_count:1,usage_type:'licensed'}});
test('settings reject mismatched price, currency, recurrence, live mode and invalid clinician',async()=>{
 for(const patch of [{unit_amount:1},{currency:'eur'},{livemode:true},{recurring:{interval:'year'}},{active:false}])await assert.rejects(validateSettings(valid,async(id:string)=>({...price(id.endsWith('care')?3900:8900),...patch}),async()=>true));
 await assert.rejects(validateSettings(valid,async()=>price(3900),async()=>false));
 await assert.rejects(validateSettings({...valid,careAmountCents:0},async()=>price(3900),async()=>true));
});
test('valid monthly test prices and existing clinician may be published',async()=>{assert.deepEqual(await validateSettings(valid,async(id:string)=>price(id.endsWith('care')?3900:8900),async()=>true),valid)});
import {evaluateLaunchEligibility} from '../src/services/enrollmentRules';
test('launch eligibility is always NC/adult and pregnancy remains a review flag',()=>{
 const yes={E1:'acne',E2:'yes',E3:'pregnant',E4:'yes'};
 assert.deepEqual(evaluateLaunchEligibility(yes as any,{dateOfBirth:'2000-01-01',attestedInNC:true},'2026-11-09'),{eligible:true,reasons:[],flags:['pregnancy_safe_review','overlapping_treatment'],rulesVersion:'0.9-draft'});
 assert.equal(evaluateLaunchEligibility(yes as any,{dateOfBirth:'2010-01-01',attestedInNC:true},'2026-11-09').eligible,false);
 assert.equal(evaluateLaunchEligibility(yes as any,{dateOfBirth:'2000-01-01',attestedInNC:false},'2026-11-09').eligible,false);
 assert.equal(evaluateLaunchEligibility({...yes,E1:'something_else'} as any,{dateOfBirth:'2000-01-01',attestedInNC:true},'2026-11-09').eligible,false);
});
import {launchCatalog} from '../src/services/launchSettings';
import {fixtures} from '../src/contracts/unzitLaunch';
test('catalog prices come from DB; unavailable content returns sanitized 503',async()=>{
 const content=fixtures['GET /catalog'].response;
 const db=(value:any)=>({launchSettings:{findFirst:async()=>value}});
 const settings={version:7,careAmountCents:4200,allInAmountCents:9200,weeklyWeeks:8,contentVersion:'0.9-draft',content};
 const catalog=await launchCatalog(db(settings));assert.equal(catalog.plans[0].amountCents,4200);assert.equal(catalog.settingsVersion,7);
 for(const s of [null,{...settings,content:{}}])await assert.rejects(launchCatalog(db(s)),{statusCode:503,code:'BILLING_UNAVAILABLE'});
});
test('metered, tiered or transformed prices cannot publish a false monthly total',async()=>{
 for(const patch of [{billing_scheme:'tiered'},{transform_quantity:{divide_by:10,round:'up'}},{custom_unit_amount:{}},{recurring:{interval:'month',interval_count:1,usage_type:'metered'}}])await assert.rejects(validateSettings(valid,async(id:string)=>({...price(id.endsWith('care')?3900:8900),...patch}),async()=>true));
});
const {publishSettings}=require('../scripts/set-launch-settings.cjs');
function publicationDB(history:any[]){
 const statements:string[]=[];
 const db={query:async(sql:string)=>{statements.push(sql);if(sql.includes('max(version)'))return {rows:[{version:2}]};if(sql.includes('where active'))return {rows:[{contentVersion:'0.9-draft',content:{}}]};if(sql.startsWith('SELECT')||sql.startsWith('select'))return {rows:history};return {rows:[],rowCount:1}}};
 return {db,statements};
}
test('publication forbids reusing any historical price for the opposite plan',async()=>{
 for(const changed of [{...valid,allInPriceId:'price_previous_care'},{...valid,carePriceId:'price_previous_all_in'}]){
  const {db,statements}=publicationDB([{carePriceId:'price_previous_care',allInPriceId:'price_previous_all_in'},{carePriceId:'price_other_care',allInPriceId:'price_other_all_in'}]);
  await assert.rejects(publishSettings(db,changed),/another plan/);
  assert.equal(statements.at(-1),'ROLLBACK');
  assert.equal(statements.some(x=>x.startsWith('update public.launch_settings')),false);
 }
});
test('publication preserves same-plan price identities across settings versions',async()=>{
 const {db,statements}=publicationDB([{carePriceId:valid.carePriceId,allInPriceId:valid.allInPriceId},{carePriceId:null,allInPriceId:null}]);
 assert.deepEqual(await publishSettings(db,valid),{published:1,version:3});
 assert.equal(statements[1],'LOCK TABLE public.launch_settings IN EXCLUSIVE MODE');assert.equal(statements.at(-1),'COMMIT');
});
