import {prisma} from '../config/database';
import {enrollmentError} from './enrollment';
import {CatalogSchema} from '../contracts/unzitLaunch';
export async function activeLaunchSettings(db:any=prisma){const row=await db.launchSettings.findFirst({where:{active:true}});if(!row)throw enrollmentError(503,'BILLING_UNAVAILABLE');return row}
export function assertSettingsVersion(settings:{version:number},selected:number){if(settings.version!==selected)throw enrollmentError(409,'SETTINGS_CHANGED')}
export async function launchCatalog(db:any=prisma){
 const s=await activeLaunchSettings(db), content=s.content as any;
 // Incomplete/unpublished content fails closed; no fallback to legacy consent.
 const parsed=CatalogSchema.safeParse({contractVersion:1,settingsVersion:s.version,plans:[{id:'care',name:'Care',amountCents:s.careAmountCents,currency:'usd',interval:'month',includesPartnerRx:false,cadence:{weeklyWeeks:0,then:'monthly'}},{id:'all_in',name:'All-In',amountCents:s.allInAmountCents,currency:'usd',interval:'month',includesPartnerRx:true,cadence:{weeklyWeeks:s.weeklyWeeks,then:'monthly'}}],consents:content?.consents,reviewCopy:'Review within 1 to 2 business days.',questionnaireVersion:s.contentVersion,eligibilityQuestions:content?.eligibilityQuestions,medicalQuestions:content?.medicalQuestions});
 if(!parsed.success)throw enrollmentError(503,'BILLING_UNAVAILABLE');
 return parsed.data;
}
