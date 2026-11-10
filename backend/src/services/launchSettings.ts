import {prisma} from '../config/database';
import {enrollmentError} from './enrollment';
import {isIntakeV2} from './intakeV2';
import {CatalogSchema} from '../contracts/unzitLaunch';
export async function activeLaunchSettings(db:any=prisma){const row=await db.launchSettings.findFirst({where:{active:true}});if(!row)throw enrollmentError(503,'BILLING_UNAVAILABLE');return row}
export function assertSettingsVersion(settings:{version:number},selected:number){if(settings.version!==selected)throw enrollmentError(409,'SETTINGS_CHANGED')}
// Old installed clients opt into the latest v1 publication; v2 requires an explicit header.
export async function selectedLaunchSettings(db:any=prisma,questionnaireVersion?:string){
 const active=await activeLaunchSettings(db);
 if(questionnaireVersion===active.contentVersion||!isIntakeV2(active.contentVersion)&&!questionnaireVersion)return active;
 const rows=await db.launchSettings.findMany({orderBy:{version:'desc'}});
 const selected=rows.find((s:any)=>questionnaireVersion?s.contentVersion===questionnaireVersion:!isIntakeV2(s.contentVersion));
 if(!selected)throw enrollmentError(503,'BILLING_UNAVAILABLE');return selected;
}
export async function launchCatalog(db:any=prisma,questionnaireVersion?:string){
 const s=await selectedLaunchSettings(db,questionnaireVersion), content=s.content as any;
 // Incomplete/unpublished content fails closed; no fallback to legacy consent.
 const parsed=CatalogSchema.safeParse({contractVersion:1,settingsVersion:s.version,plans:[{id:'care',name:'Care',amountCents:s.careAmountCents,currency:'usd',interval:'month',includesPartnerRx:false,cadence:{weeklyWeeks:0,then:'monthly'}},{id:'all_in',name:'All-In',amountCents:s.allInAmountCents,currency:'usd',interval:'month',includesPartnerRx:true,cadence:{weeklyWeeks:s.weeklyWeeks,then:'monthly'}}],consents:content?.consents,reviewCopy:'Review within 1 to 2 business days.',questionnaireVersion:s.contentVersion,eligibilityQuestions:content?.eligibilityQuestions,medicalQuestions:content?.medicalQuestions,enrollmentFlow:content?.enrollmentFlow,photoGuidance:content?.photoGuidance,identityGuidance:content?.identityGuidance,intakeV2:content?.intakeV2});
 if(!parsed.success)throw enrollmentError(503,'BILLING_UNAVAILABLE');
 return parsed.data;
}
