import {MedicalDraftSchema,MedicalHistorySchema,MedicalDraft,MedicalHistory} from '../contracts/unzitLaunch';
import {enrollmentError} from './enrollment';
export function normalizeMedicalDraft(input:unknown):MedicalDraft{
 const a=MedicalDraftSchema.parse(input);
 if(a.M1==='male'){a.M2=null;a.M3=null;a.M4=null}
 else if(a.M2!==undefined&&!['yes','not_sure'].includes(a.M2)){a.M3=null;a.M4=null}
 if(a.M1!==undefined&&!['female','intersex'].includes(a.M1))a.M8=null;
 return a as MedicalDraft;
}
export function completeMedicalHistory(input:unknown):MedicalHistory{
 const a=MedicalHistorySchema.parse(normalizeMedicalDraft(input));
 const invalid=()=>{throw enrollmentError(409,'INCOMPLETE_CASE')};
 if(a.M1!=='male'&&a.M2===null)invalid();
 if(a.M1!=='male'&&['yes','not_sure'].includes(a.M2)&&(a.M3===null||a.M4===null))invalid();
 if(['female','intersex'].includes(a.M1)&&a.M8===null)invalid();
 if(a.M9.none?a.M9.signs.length>0:a.M9.signs.length===0)invalid();
 if(a.M11.none?a.M11.treatments.length>0:a.M11.treatments.length===0)invalid();
 for(const field of [a.M14])if(field.none?!!field.details?.trim():!field.details?.trim())invalid();
 if(!a.M15.picks.includes('none')&&!a.M15.reaction?.trim())invalid();
 if(a.M15.picks.includes('none')&&a.M15.reaction?.trim())invalid();
 if(a.M4?.method==='other'&&!a.M4.details?.trim())invalid();
 return a as MedicalHistory;
}
export function launchFlags(a:MedicalDraft){const flags:string[]=[];
 if(a.M2==='yes'||a.M2==='not_sure'||a.M3==='yes'||a.M3==='not_sure')flags.push('pregnancy_safe_review');
 if(a.M9&&!a.M9.none&&a.M9.signs.length)flags.push('hormonal_review');
 return flags;
}
