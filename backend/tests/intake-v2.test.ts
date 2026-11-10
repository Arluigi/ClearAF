import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateIntakeV2,normalizeIntakeV2,completeIntakeV2,intakeV2Summary} from '../src/services/intakeV2';
const base:any={W1:true,A1:'1990-01-01',A2:'yes',A3:'acne',A4:['none'],A5:'neither',A6:'never',A7:true,B1:'male',B7:'over_5_years',B8:['cheeks'],B9:['red_bumps'],B10:'burns_then_tans',B11:'somewhat',B12:['none'],C1:[{treatmentId:'never'}],C2:['none'],C3:'either',C4:'yes',C5:['none'],D1:['none'],D2_none:true,D3:['none'],D4:['none'],E1:['pimples'],E2:['stop_breakouts'],E4:'a_little',F2:true,planId:'care',H1:true,H2:true,H3:true,H4:true,H5:true,H6:true};
const evaluate=(a:any)=>evaluateIntakeV2(a,'2026-11-09');
test('v2 validates full male path, conditional fields and repeat completeness',()=>{
 assert.deepEqual(evaluate(base).missingRequired,[]);assert.equal(completeIntakeV2(base,'2026-11-09').W1,true);
 const female={...base,B1:'female',B2:'yes',B3:'no',B5:'yes',B6:['none']};assert.ok(evaluate(female).missingRequired.includes('B4'));
 assert.ok(evaluate({...base,C1:[{treatmentId:'hydroquinone'}]}).missingRequired.includes('C1.hydroquinone.duration'));
 assert.ok(evaluate({...base,D3:['tetracyclines']}).missingRequired.includes('D3b'));
 assert.ok(evaluate({...base,H6:false}).missingRequired.includes('H6'));
 assert.throws(()=>normalizeIntakeV2({...base,D3:['none','tetracyclines']}));
});
test('v2 exits are evaluated from partial records before payment',()=>{
 for(const [a,page] of [[{A1:'2015-01-01'},'C'],[{A2:'no'},'D'],[{A3:'something_else'},'E'],[{A4:['fever']},'A'],[{A4:['swelling','fever']},'B']] as any[])assert.equal(evaluate(a).exitPage,page);
 assert.equal(evaluate({...base,A6:'now',A6choice:'stop'}).exitPage,'isotretinoin_stop');
 assert.equal(evaluate({...base,A6:'now',A6choice:'finish'}).hold,true);
});
test('v2 matrix applies pregnancy, allergy, condition and repeat exclusions without G6PD gate',()=>{
 const pregnant=evaluate({...base,A5:'pregnant',B1:'female'});for(const d of ['tretinoin','tazarotene','hydroquinone','doxycycline','spironolactone'])assert.ok(pregnant.excluded.some(x=>x.drug===d));assert.deepEqual(pregnant.eligibleDrugs.sort(),['azelaic_acid','benzoyl_peroxide','clindamycin'].sort());
 const allergic=evaluate({...base,D3:['sulfa_dapsone'],D3b:['breathing'],D4:['g6pd','anemia_blood']});assert.ok(allergic.excluded.some(x=>x.drug==='dapsone'));assert.ok(allergic.flags.some(x=>x.includes('Severe reaction')));
 const g6pd=evaluate({...base,D4:['g6pd','anemia_blood']});assert.ok(g6pd.eligibleDrugs.includes('dapsone'));assert.ok(!g6pd.flags.some(x=>/G6PD|anemia/i.test(x)));
 const renal=evaluate({...base,D4:['kidney','raised_brain_pressure']});assert.ok(renal.excluded.some(x=>x.drug==='spironolactone'));assert.ok(renal.excluded.some(x=>x.drug==='doxycycline'));
 const hq=evaluate({...base,C1:[{treatmentId:'hydroquinone',duration:'over_6_months',helped:'no',status:'stopped',stopReason:'side_effects',darkened:'yes'}]});assert.ok(hq.excluded.some(x=>x.drug==='hydroquinone'));
});
test('v2 summary preserves patient voice, actionable safety, repeat history and conditional photos',()=>{
 const a={...base,B8:['chest','back'],C6:'Their own words',E5:'Long closing narrative '.repeat(300),D1:['minerals_antacids'],D4:['ibd']};
 assert.deepEqual(evaluate(a).requiredPhotoSlots,['front','left','right','chest','back']);const summary=intakeV2Summary(a,evaluate(a));assert.equal(summary.patientVoice.anythingElse,a.E5);assert.equal(summary.patientVoice.inTheirWords,a.C6);assert.ok(evaluate(a).cautions.some(x=>x.drug==='doxycycline'&&x.reason.includes('activity')));
});
test('v2 edits discard hidden repeat children and remove stale cost/ochronosis dispositions',()=>{const a=normalizeIntakeV2({...base,C1:[{treatmentId:'retinoid',duration:'3_to_6_months',helped:'somewhat',status:'using',stopReason:'cost',darkened:'yes'}]});assert.equal(a.C1[0].stopReason,undefined);assert.equal(a.C1[0].darkened,undefined);assert.ok(!evaluate(a).flags.some(x=>x.startsWith('Cost-related')));assert.deepEqual(normalizeIntakeV2({...base,C1:[{treatmentId:'never',duration:'over_6_months',status:'stopped',stopReason:'cost',darkened:'yes'}]}).C1,[{treatmentId:'never'}])});
test('sulfites preserve allergy/reaction flag without inventing formulation exclusions absent from source matrix',()=>{const e=evaluate({...base,D3:['sulfites'],D3b:['rash_hives']});assert.equal(e.excluded.filter(x=>x.questionIds.includes('D3')).length,0);assert.ok(e.flags.some(x=>/sulfites.*ingredient|ingredient.*sulfites/i.test(x)))});
