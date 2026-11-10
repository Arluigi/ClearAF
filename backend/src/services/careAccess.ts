import {enrollmentError} from './enrollment';
export type CareScope='clinical_write'|'clarification'|'history'|'account'|'recovery'|'cancellation'|'urgent'|'enrollment'|'approval'|'prescription';
// Null means a legacy account: callers preserve the existing legacy enrollment policy.
export function careAccess(caseRow:any,membership:any,now=new Date()):'care'|'enrollment'|'read_only'|null{
 if(!caseRow)return null;
 if(!membership)return 'enrollment';
 if(['rejected','ended'].includes(membership.status))return 'read_only';
 if(['paid_pending_review','active','past_due'].includes(membership.status)){if(!membership.paidThrough||new Date(membership.paidThrough)<=now)return 'read_only';return caseRow.status==='approved'&&['active','past_due'].includes(membership.status)?'care':'enrollment'}
 return 'enrollment';
}
export function assertCareAccess(caseRow:any,membership:any,scope:CareScope,now=new Date(),affirmativeNC?:boolean){
 const access=careAccess(caseRow,membership,now);if(access===null)return;
 if(['history','account','recovery','cancellation','urgent','enrollment'].includes(scope))return;
 if(scope==='clarification'&&access==='enrollment'&&['paid_pending_review','past_due'].includes(membership?.status)&&membership.paidThrough&&new Date(membership.paidThrough)>now&&['submitted','needs_changes'].includes(caseRow.status))return;
 if(scope==='approval'){
  if(!membership||!['paid_pending_review','active','past_due'].includes(membership.status)||!membership.paidThrough||new Date(membership.paidThrough)<=now)throw enrollmentError(403,'CARE_ACCESS_REQUIRED');
 }else if(access!=='care')throw enrollmentError(403,scope==='clarification'?'LAUNCH_STEP_REQUIRED':'CARE_ACCESS_REQUIRED');
 if(['approval','prescription'].includes(scope)&&affirmativeNC!==true)throw enrollmentError(403,'LAUNCH_STEP_REQUIRED');
}
export async function requirePatientCareScope(db:any,patientId:string,scope:CareScope,now=new Date(),affirmativeNC?:boolean){
 const caseRow=await db.launchCase.findUnique({where:{patientId}});
 const membership=caseRow?await db.careMembership.findUnique({where:{patientId}}):null;
 assertCareAccess(caseRow,membership,scope,now,affirmativeNC);return {caseRow,membership,access:careAccess(caseRow,membership,now)};
}
