import {z} from 'zod';
import fragment from '../content/intakeV2Questions.json';
export const INTAKE_V2='2.0-pending-review';
export const isIntakeV2=(version:unknown)=>version===INTAKE_V2||version==='2.1-pending-review';
export const intakeV2Catalog=fragment;
const questions=[...fragment.eligibilityQuestions,...fragment.medicalQuestions];
export type IntakeV2Answers=Record<string,any>;
const text=z.string().max(20000), choice=(values:string[])=>z.enum(values as [string,...string[]]);
const shape:Record<string,z.ZodTypeAny>={planId:z.enum(['care','all_in']).optional()};
for(const q of questions){let s:z.ZodTypeAny;
 if(q.id==='C1'){s=z.array(z.object({treatmentId:choice(q.options.map(o=>o.id)),duration:choice(['under_month','1_to_3_months','3_to_6_months','over_6_months']).optional(),helped:choice(['a_lot','somewhat','no']).optional(),status:choice(['using','stopped']).optional(),stopReason:choice(['side_effects','not_work','cost','doctor','other']).optional(),details:text.optional(),darkened:choice(['yes','no']).optional()}).strict()).min(1).max(12).refine(a=>new Set(a.map(t=>t.treatmentId)).size===a.length).refine(a=>!a.some(t=>t.treatmentId==='never')||a.length===1)}
 else if(q.id==='A1')s=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(+new Date(v))&&new Date(v).toISOString().slice(0,10)===v);
 else if(q.kind==='attestation')s=z.boolean();
 else if(q.kind==='choice')s=choice(q.options.map(o=>o.id));
 else if(q.kind==='multi_choice')s=z.array(choice(q.options.map(o=>o.id))).min(1).max(q.id==='E1'?3:q.options.length).refine(a=>new Set(a).size===a.length).refine(a=>!a.includes('none')||a.length===1);
 else s=text;
 shape[q.id]=s.optional();
}
export const IntakeV2DraftSchema=z.object(shape).strict();
export function visibleIntakeV2Question(q:any,a:IntakeV2Answers){return q.showWhen.every((c:any)=>{const v=a[c.questionId];if(v===undefined)return false;const hit=(Array.isArray(v)?v:[v]).some(x=>c.values.includes(String(x)));return c.operator==='in'?hit:!hit})}
export function normalizeIntakeV2(input:unknown):IntakeV2Answers{
 const a=IntakeV2DraftSchema.parse(input);
 // Hidden answers cannot create stale pregnancy/allergy dispositions after a patient edits an earlier answer.
 for(let pass=0;pass<3;pass++)for(const q of questions)if(!visibleIntakeV2Question(q,a))delete a[q.id];
 if(a.B1==='male'||['pregnant','breastfeeding'].includes(a.A5)){for(const key of ['B2','B3','B4','B4b','B4_other','B5','B6','B6_details'])delete a[key]}
 if(a.C1)a.C1=a.C1.map((t:any)=>{if(t.treatmentId==='never')return {treatmentId:'never'};if(t.status!=='stopped')delete t.stopReason;if(t.treatmentId!=='hydroquinone')delete t.darkened;return t});
 if(a.D2_none===true&&a.D2?.trim())throw new z.ZodError([{code:'custom',path:['D2'],message:'Medicine list cannot also be None'}]);
 return a;
}
export type ScreeningFinding={drug:string;reason:string;questionIds:string[]};
export type IntakeV2Evaluation={missingRequired:string[];exitPage:string|null;hold:boolean;requiredPhotoSlots:string[];flags:string[];excluded:ScreeningFinding[];cautions:ScreeningFinding[];eligibleDrugs:string[];routes:string[]};
export function evaluateIntakeV2(input:unknown,today=new Date().toISOString().slice(0,10)):IntakeV2Evaluation{
 const a=normalizeIntakeV2(input),missingRequired:string[]=[],flags:string[]=[],excluded:ScreeningFinding[]=[],cautions:ScreeningFinding[]=[],routes:string[]=[];
 const has=(key:string,id:string)=>Array.isArray(a[key])&&a[key].includes(id);
 const flag=(message:string,ids:string[])=>flags.push(`${message} (${ids.join(', ')})`);
 const exclude=(drug:string,reason:string,...questionIds:string[])=>excluded.push({drug,reason,questionIds});
 const caution=(drug:string,reason:string,...questionIds:string[])=>{cautions.push({drug,reason,questionIds});flag(reason,questionIds)};
 for(const q of questions){if(!q.required||!visibleIntakeV2Question(q,a))continue;const v=a[q.id];if(v===undefined||v===false||typeof v==='string'&&!v.trim()||Array.isArray(v)&&!v.length)missingRequired.push(q.id)}
 if(!a.planId)missingRequired.push('planId');
 if(!a.D2_none&&!a.D2?.trim()&&!missingRequired.includes('D2'))missingRequired.push('D2');
 if(a.D2_none)missingRequired.splice(missingRequired.indexOf('D2'),missingRequired.includes('D2')?1:0);
 for(const t of a.C1??[]){if(t.treatmentId==='never')continue;for(const k of ['duration','helped','status',...(t.status==='stopped'?['stopReason']:[]),...(t.treatmentId==='hydroquinone'?['darkened']:[])])if(!t[k])missingRequired.push(`C1.${t.treatmentId}.${k}`)}
 let exitPage:string|null=null;
 if(a.A1){const born=new Date(a.A1),now=new Date(today),age=now.getUTCFullYear()-born.getUTCFullYear()-(today.slice(5)<a.A1.slice(5)?1:0);if(age<18||a.A1>today)exitPage='C'}
 if(a.A2==='no')exitPage='D';if(a.A3==='something_else')exitPage='E';
 if(['fever','joint_pain','sores','sudden_worsening'].some(x=>has('A4',x))){exitPage='A';flag('Same-day review: severe acne red-flag cluster',['A4'])}
 if(['swelling','painful_blistering_peeling'].some(x=>has('A4',x)))exitPage='B';
 if(a.A6==='now'&&a.A6choice==='stop')exitPage='isotretinoin_stop';
 const hold=a.A6==='now'&&a.A6choice==='finish';if(hold)flag('HOLD: currently on isotretinoin; personal decision required before any plan or prescription',['A6','A6choice']);
 if(a.A3==='dark_marks')flag('Marks-only presentation: confirm marks are acne-related before plan',['A3']);
 if(a.A6b==='under_3_months')flag('Recent isotretinoin course: review relapse expectations and doxycycline timing',['A6b']);
 const pregnancy=['pregnant','breastfeeding'].includes(a.A5)||['yes','not_sure'].includes(a.B3)||a.B2==='not_sure';
 if(pregnancy){routes.push('pregnancy_safe');flag(a.B3==='yes'||a.B3==='not_sure'?'Pregnancy planned or possible within 6 months':'Pregnancy-safe pathway',['A5','B2','B3']);for(const d of ['tretinoin','tazarotene','hydroquinone','doxycycline','spironolactone','dapsone'])exclude(d,'Pregnancy-safe pathway',...(['pregnant','breastfeeding'].includes(a.A5)?['A5']:['B2','B3']))}
 if(a.B1==='male')exclude('spironolactone','Spironolactone not offered: male patient','B1');
 if(a.B4==='drospirenone'||/\b(yaz|yasmin|nikki|loryna|slynd|drospirenone|ocella|syeda|zARAH|gianvi|vestura)\b/i.test(a.B4b??''))caution('spironolactone','Drospirenone contraceptive: potassium caution with spironolactone','B4','B4b');
 if(a.B2==='yes'&&a.B4==='none'){caution('tazarotene','Tazarotene: contraception counseling required before prescribing','B2','B4');flag('Could become pregnant, no contraception: retinoid and spironolactone decisions need documented counseling',['B2','B4'])}
 if(a.B5==='yes')flag('Premenstrual flare pattern'+(has('B8','jaw_chin')?'; jaw/chin distribution reinforces hormonal pattern':''),['B5','B8']);
 if((a.B6??[]).filter((x:string)=>x!=='none').length>=2||has('B6','pcos'))flag('Possible hyperandrogenism: consider recommending in-person hormone evaluation in plan message',['B6']);
 if(has('B9','deep_painful_lumps')&&has('B9','scars'))flag('Severe morphology: if photos confirm, consider in-person isotretinoin evaluation',['B9']);
 if(['very','eczema_rosacea'].includes(a.B11))for(const d of ['tretinoin','tazarotene','azelaic_acid','benzoyl_peroxide'])caution(d,'Sensitive skin: lowest strength, alternate nights; consider azelaic acid first','B11');
 if(has('B12','adapalene')||has('B12','retinol'))flag('OTC retinoid in use: instruct patient to stop when prescription retinoid starts',['B12']);
 if(has('B12','prescription_cream'))flag('Other prescription cream: assess duplicate therapy — '+(a.B12_prescription??''),['B12']);
 for(const t of a.C1??[]){if(t.treatmentId==='hydroquinone'){if(t.darkened==='yes'){exclude('hydroquinone','Possible prior ochronosis','C1');flag('Possible prior ochronosis: hydroquinone excluded',['C1'])}if(t.duration==='over_6_months')flag('Long prior hydroquinone exposure: review cumulative use before reissue',['C1'])}if(t.stopReason==='cost')flag('Cost-related prior stop: name monthly plan cost plainly in plan',['C1'])}
 if(['sometimes','no'].includes(a.C4))caution('hydroquinone','Confirm daily sunscreen before hydroquinone issues','C4');
 if((a.C5??[]).some((x:string)=>x!=='none'))flag('Recent facial procedure: consider delaying retinoid start and note in plan',['C5']);
 for(const id of ['ace_arb','water_pills','potassium','trimethoprim'])if(has('D1',id))caution('spironolactone','Potassium or blood pressure interaction: spironolactone caution — '+id,'D1');
 for(const id of ['lithium','digoxin'])if(has('D1',id))caution('spironolactone','Spironolactone interaction: clinician review — '+id,'D1');
 if(has('D1','trimethoprim'))caution('dapsone','Trimethoprim raises dapsone levels: clinician review','D1');
 if(has('D1','minerals_antacids'))caution('doxycycline','Separate antacids and minerals by 2 to 3 hours; full glass of water with breakfast, upright at least 30 minutes','D1');
 for(const id of ['warfarin','seizure_medicine'])if(has('D1',id))caution('doxycycline','Doxycycline interaction: clinician review — '+id,'D1');
 const severe=(a.D3b??[]).some((x:string)=>['swelling','breathing','blistering_peeling'].includes(x));
 const allergyDrugs:Record<string,string[]>={tetracyclines:['doxycycline'],sulfa_dapsone:['dapsone'],clindamycin:['clindamycin'],benzoyl_peroxide:['benzoyl_peroxide'],retinoids:['tretinoin','tazarotene']};
 if(has('D3','sulfites'))flag('Sulfites allergy: clinician ingredient/product review required; no drug class mapping supplied',['D3','D3b','D3c']);
 for(const allergy of a.D3??[])if(allergy!=='none'){const reason=`${severe?'Severe reaction history':'Intolerance-type reaction: clinician may judge'}: ${allergy}; ${(a.D3b??[]).join(', ')}${a.D3c?'; '+a.D3c:''}`;flag(reason,['D3','D3b','D3c']);for(const d of allergyDrugs[allergy]??[])exclude(d,reason,'D3','D3b')}
 for(const id of ['kidney','high_potassium','adrenal'])if(has('D4',id))exclude('spironolactone',id,'D4');
 if(has('D4','raised_brain_pressure'))exclude('doxycycline','Raised intracranial pressure','D4');
 if(has('D4','swallowing_esophagus')){exclude('doxycycline','Esophagus problems: excluded by default; documented clinician override required','D4');flag('Esophagus problems: doxycycline default exclusion; clinician may override with documented judgment',['D4'])}
 if(has('D4','ibd')){caution('doxycycline','IBD activity and prior C. difficile determination REQUIRED in messaging before doxycycline: active or prior C. difficile excludes, inactive caution','D4');caution('clindamycin','IBD history: clinician review','D4')}
 if(has('D4','liver'))caution('doxycycline','Liver disease: clinician review','D4');
 if(has('D4','lupus_sun_sensitivity'))for(const d of ['tretinoin','tazarotene','doxycycline'])caution(d,'Sun sensitivity: counseling required','D4');
 if(has('D4','fainting_low_bp'))caution('spironolactone','Fainting or low blood pressure: consider 25 mg starting dose','D4');
 if(has('D4','breast_cancer'))caution('spironolactone','Breast cancer history: clinician judgment','D4');
 if(has('D4','heart'))caution('spironolactone','Heart disease or irregular heartbeat: clinician review','D4');
 if(['quite_a_bit','a_lot'].includes(a.E4))flag('High life impact: acknowledge in plan message',['E4']);
 if(a.planId==='care'&&!a.G1?.trim())flag('Pharmacy not yet provided',['G1']);
 if(a.planId==='all_in'&&a.G2!=='yes'&&!missingRequired.includes('G2'))missingRequired.push('G2');
 const drugs=['tretinoin','azelaic_acid','doxycycline','spironolactone','clindamycin','benzoyl_peroxide','dapsone','tazarotene','hydroquinone'];
 return {missingRequired:[...new Set(missingRequired)],exitPage,hold,requiredPhotoSlots:['front','left','right',...(has('B8','chest')?['chest']:[]),...(has('B8','back')?['back']:[])],flags:[...new Set(flags)],excluded,cautions,eligibleDrugs:drugs.filter(d=>!excluded.some(x=>x.drug===d)),routes};
}
export function completeIntakeV2(input:unknown,today?:string){const a=normalizeIntakeV2(input),e=evaluateIntakeV2(a,today);if(e.missingRequired.length||e.exitPage)throw Object.assign(new Error('INCOMPLETE_CASE'),{statusCode:409,code:'INCOMPLETE_CASE'});return a}
export function intakeV2Summary(a:IntakeV2Answers,e=evaluateIntakeV2(a)){
 const label=(id:string,v:any):any=>Array.isArray(v)?v.map(x=>label(id,x)):questions.find(q=>q.id===id)?.options.find(o=>o.id===v)?.label??v;
 const lines=(ids:string[])=>Object.fromEntries(ids.filter(id=>a[id]!==undefined).map(id=>[id,label(id,a[id])]));
 return {flags:e.flags,excluded:e.excluded,cautions:e.cautions,eligibleDrugs:e.eligibleDrugs,routes:e.routes,acnePicture:lines(['B7','B8','B9','B10','B11','B5','B6','B6_details','B12','B12_details','B12_prescription']),history:a.C1??[],medicines:{interactions:label('D1',(a.D1??[]).filter((v:string)=>v!=='none')),completeList:a.D2??null,allergies:label('D3',(a.D3??[]).filter((v:string)=>v!=='none')),reactions:label('D3b',a.D3b??[]),reactionDetails:a.D3c??null,conditions:label('D4',(a.D4??[]).filter((v:string)=>v!=='none'))},patientVoice:{concerns:label('E1',a.E1??[]),concernsOther:a.E1_other??null,goals:label('E2',a.E2??[]),goalsOther:a.E2_other??null,date:a.E3??null,timelineNote:a.E3?'Acne treatment timelines run 8 to 12 weeks':null,lifeImpact:label('E4',a.E4??null),fears:label('C2',a.C2??[]),fearsOther:a.C2_other??null,preference:label('C3',a.C3??null),inTheirWords:a.C6??null,anythingElse:a.E5??null},photoSlots:e.requiredPhotoSlots,logistics:{planId:a.planId??null,pharmacy:a.G1??null,shippingConfirmed:a.G2==='yes'},hydroquinoneCourseClock:'Starts at first issue; 12 weeks maximum continuous use, then stop and reassess; maintenance with azelaic acid',standingRules:['Clindamycin always with benzoyl peroxide','One retinoid at a time','Any side effect: stop medication and message UNZIT; do not restart until Dr . Om replies'],allInProducts:{tretinoin:['cream 0.025%','cream 0.05%','cream 0.1%'],clindamycin:['gel 1%','lotion 1%'],benzoyl_peroxide:['gel 2.5%','gel 5%','gel 10%','cleanser 5%','cleanser 10%'],azelaic_acid:['gel 15%'],doxycycline:['50 mg','100 mg'],spironolactone:['25 mg','50 mg','100 mg'],hydroquinone:['4%'],dapsone:['gel 5%'],tazarotene:['cream 0.1%']},careOnlyNote:'Other strengths and formulations: Care plan only, patient’s own pharmacy. Tretinoin gel 0.05% is Care-preferred.'};
}
export const validIntakeV2Answers:IntakeV2Answers={W1:true,A1:'1990-01-01',A2:'yes',A3:'acne',A4:['none'],A5:'neither',A6:'never',A7:true,B1:'male',B7:'over_5_years',B8:['cheeks'],B9:['red_bumps'],B10:'burns_then_tans',B11:'somewhat',B12:['none'],C1:[{treatmentId:'never'}],C2:['none'],C3:'either',C4:'yes',C5:['none'],D1:['none'],D2_none:true,D3:['none'],D4:['none'],E1:['pimples'],E2:['stop_breakouts'],E4:'a_little',F2:true,planId:'care',H1:true,H2:true,H3:true,H4:true,H5:true,H6:true};

export const ScreeningDecisionsSchema=z.object({ibd:z.object({activity:z.enum(['active','inactive']),priorCDifficile:z.boolean(),decisionNote:z.string().trim().min(1).max(2000)}).strict().optional(),marksAcneRelated:z.boolean().optional(),dailySunscreenConfirmed:z.boolean().optional(),doxycyclineEsophagusOverrideNote:z.string().trim().min(1).max(2000).optional()}).strict();
export function intakeV2Projection(input:unknown,eligibility:any={},today?:string){
 const answers=normalizeIntakeV2(input),evaluation=evaluateIntakeV2(answers,today),decisions=eligibility.screeningDecisions??null;
 if(eligibility.holdDecision){evaluation.hold=false;evaluation.flags=evaluation.flags.filter(f=>!f.startsWith('HOLD:'))}
 if(answers.D4?.includes('ibd')&&decisions?.ibd){const d=decisions.ibd;evaluation.cautions=evaluation.cautions.filter(f=>!(f.drug==='doxycycline'&&f.reason.startsWith('IBD activity')));if(d.activity==='active'||d.priorCDifficile){evaluation.excluded.push({drug:'doxycycline',reason:d.priorCDifficile?'Prior C. difficile infection':'Active inflammatory bowel disease',questionIds:['D4']});evaluation.eligibleDrugs=evaluation.eligibleDrugs.filter(d=>d!=='doxycycline')}else evaluation.cautions.push({drug:'doxycycline',reason:'Inactive IBD, no prior C. difficile confirmed by clinician: caution',questionIds:['D4']})}
 if(decisions?.doxycyclineEsophagusOverrideNote){evaluation.excluded=evaluation.excluded.filter(f=>!(f.drug==='doxycycline'&&f.reason.startsWith('Esophagus problems')));if(!evaluation.excluded.some(f=>f.drug==='doxycycline')&&!evaluation.eligibleDrugs.includes('doxycycline'))evaluation.eligibleDrugs.push('doxycycline')}
 const summary={...intakeV2Summary(answers,evaluation),screeningDecisions:decisions};return {answers,evaluation,summary,holdDecision:eligibility.holdDecision??null,screeningDecisions:decisions};
}
export function assertIntakeV2Prescription(input:unknown,eligibility:any,drug:string,strength:string,planId:string){
 const projection=intakeV2Projection(input,eligibility),a=projection.answers,d=drug.toLowerCase().replace(/[ -]+/g,'_');
 const known=['tretinoin','azelaic_acid','doxycycline','spironolactone','clindamycin','benzoyl_peroxide','dapsone','tazarotene','hydroquinone'].find(x=>d.includes(x));
 const fail=()=>{throw Object.assign(new Error('LAUNCH_STEP_REQUIRED'),{statusCode:403,code:'LAUNCH_STEP_REQUIRED'})};
 if(!known||projection.evaluation.hold||projection.evaluation.excluded.some(e=>e.drug===known))fail();
 if(known==='doxycycline'&&a.D4?.includes('ibd')&&(!eligibility?.screeningDecisions?.ibd||eligibility.screeningDecisions.ibd.activity!=='inactive'||eligibility.screeningDecisions.ibd.priorCDifficile))fail();
 if(known==='hydroquinone'&&a.C4!=='yes'&&!eligibility?.screeningDecisions?.dailySunscreenConfirmed)fail();
 if(planId==='all_in'){
  // Compare the actual product's strength/form to the published Vida set, never accepting a numeric near-match.
  const value=(drug+' '+strength).toLowerCase();
  const percent=(n:string)=>new RegExp('(?:^|[^\\d.])'+n.replace('.','\\.')+'\\s*%').test(value);
  const mg=(n:string)=>new RegExp('(?:^|[^\\d])'+n+'\\s*mg(?:[^\\w]|$)').test(value);
  const allowed=known==='tretinoin'?/cream/.test(value)&&['0.025','0.05','0.1'].some(percent):known==='azelaic_acid'?/gel/.test(value)&&percent('15'):known==='doxycycline'?['50','100'].some(mg):known==='spironolactone'?['25','50','100'].some(mg):known==='hydroquinone'?percent('4'):known==='clindamycin'?/gel|lotion/.test(value)&&percent('1'):known==='dapsone'?/gel/.test(value)&&percent('5'):known==='tazarotene'?/cream/.test(value)&&percent('0.1'):known==='benzoyl_peroxide'?(/gel/.test(value)&&['2.5','5','10'].some(percent)||/cleanser/.test(value)&&['5','10'].some(percent)):false;
  if(!allowed)fail();
 }
}
