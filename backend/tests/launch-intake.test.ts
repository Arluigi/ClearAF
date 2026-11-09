import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMedicalDraft,completeMedicalHistory,launchFlags} from '../src/services/launchEnrollmentValidation';
import {fixtures} from '../src/contracts/unzitLaunch';
const valid=fixtures['PUT /enrollment/:caseId/medical/:revisionId'].request.answers;
test('parent changes clear hidden reproductive branches on the server',()=>{
 const changed=normalizeMedicalDraft({...valid,M1:'male',M2:'yes',M3:'yes',M4:{method:'iud',details:null},M8:'yes'});
 assert.deepEqual([changed.M2,changed.M3,changed.M4,changed.M8],[null,null,null,null]);
 const no=normalizeMedicalDraft({...valid,M1:'female',M2:'no',M3:'yes',M4:{method:'iud',details:null}});assert.equal(no.M3,null);assert.equal(no.M4,null);
});
test('all source fields, active none choices, and visible branches are required',()=>{
 assert.doesNotThrow(()=>completeMedicalHistory(valid));
 for(const patch of [{M22:false},{M9:{none:false,signs:[],details:null}},{M11:{none:false,treatments:[]}},{M11:{none:true,treatments:[{name:'Synthetic',duration:'one month',helped:'no',sideEffects:'none'}]}},{M14:{none:false,details:''}},{M15:{picks:['other'],reaction:null}},{M1:'female',M2:null}])assert.throws(()=>completeMedicalHistory({...valid,...patch}));
 assert.throws(()=>completeMedicalHistory({...valid,medicationPreference:undefined}));
});
test('intake flags cue review without selecting medications',()=>{assert.deepEqual(launchFlags({...valid,M1:'female',M2:'not_sure',M3:'not_sure',M9:{none:false,signs:['new_hair_growth'],details:null}}),['pregnancy_safe_review','hormonal_review'])});
