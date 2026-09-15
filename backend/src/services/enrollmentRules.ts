// Eligibility is decided only here, on the server. Defaults are placeholders pending the client's answers
// (docs/features/client-expansion.md); change a rule by adding a new RULES_VERSION.
export const RULES_VERSION='2026-09-15.1';
export const US_STATES=['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'] as const;
export const STATE_CODES=[...US_STATES,'NON_US'] as const;
export const PREGNANCY_STATUSES=['none','pregnant','trying_to_conceive','breastfeeding'] as const;
export type StateCode=typeof STATE_CODES[number];
export type PregnancyStatus=typeof PREGNANCY_STATUSES[number];
export type IneligibleReason='state'|'age'|'pregnancy'|'breastfeeding';
export type ScreeningFlag='trying_to_conceive';
export type EligibilityRules={licensedStates:ReadonlySet<string>;minimumAge:number};
export type ScreeningAnswers={stateCode:string;dateOfBirth:string;pregnancyStatus:PregnancyStatus};
export function rulesFromEnv(env:Record<string,string|undefined>=process.env):EligibilityRules{
 const states=(env.LICENSED_STATES??'CA,FL,IL,NY,TX').split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
 if(!states.length||states.some(s=>!(US_STATES as readonly string[]).includes(s)))throw new Error('LICENSED_STATES must be a comma-separated list of USPS state codes (NON_US is never allowed)');
 const minimumAge=Number(env.MINIMUM_PATIENT_AGE??'18');
 if(!Number.isInteger(minimumAge)||minimumAge<13||minimumAge>120)throw new Error('MINIMUM_PATIENT_AGE must be a whole number from 13 to 120');
 return {licensedStates:new Set(states),minimumAge};
}
// Only exactly 'off' disables the gate; anything else (unset, 'on', a typo) enforces it.
export function enforcementMode(value:string|undefined){return {enforced:value!=='off',recognized:value===undefined||value==='on'||value==='off'}}
// Run once at server start so a bad value fails fast instead of as a 500 on the first screening.
// Lines are metadata only: the raw configured value is never echoed.
export function enrollmentStartupLog(env:Record<string,string|undefined>=process.env):{level:'info'|'warn';text:string}[]{
 try{rulesFromEnv(env)}catch(error){throw new Error(`Invalid enrollment configuration: ${(error as Error).message}`)}
 const mode=enforcementMode(env.ENROLLMENT_ENFORCEMENT);
 const lines:{level:'info'|'warn';text:string}[]=[{level:'info',text:`enrollment enforcement: ${mode.enforced?'on':'off'}`}];
 if(!mode.recognized)lines.push({level:'warn',text:'ENROLLMENT_ENFORCEMENT is unrecognized (expected exactly "on" or "off"); enrollment enforcement is ON'});
 return lines;
}
export function ageOn(dateOfBirth:string,today:string):number{
 const [by,bm,bd]=dateOfBirth.split('-').map(Number),[ty,tm,td]=today.split('-').map(Number);
 return ty-by-(tm<bm||(tm===bm&&td<bd)?1:0);
}
export function evaluate(input:ScreeningAnswers,rules:EligibilityRules,today:string){
 const reasons:IneligibleReason[]=[];
 if(input.stateCode==='NON_US'||!rules.licensedStates.has(input.stateCode))reasons.push('state');
 if(ageOn(input.dateOfBirth,today)<rules.minimumAge)reasons.push('age');
 if(input.pregnancyStatus==='pregnant')reasons.push('pregnancy');
 if(input.pregnancyStatus==='breastfeeding')reasons.push('breastfeeding');
 const flags:ScreeningFlag[]=input.pregnancyStatus==='trying_to_conceive'?['trying_to_conceive']:[];
 return {eligible:reasons.length===0,reasons,flags};
}
