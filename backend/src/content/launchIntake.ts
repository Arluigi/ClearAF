import {QuestionSchema} from '../contracts/unzitLaunch';
// Prompts and labels come from an immutable operator publication of sources.md.
// Stable machine identities are preserved when source wording is replaced.
export function validateLaunchIntakeCatalog(input:unknown){
 const questions=QuestionSchema.array().length(23).parse(input);
 const expected=[...Array.from({length:22},(_,i)=>'M'+(i+1)),'medicationPreference'];
 if(new Set(questions.map(q=>q.id)).size!==23||expected.some(id=>!questions.some(q=>q.id===id)))throw Error('Invalid source questionnaire identity');
 return questions;
}

export function validateIntakeV2Catalog(eligibility:unknown,medical:unknown){const all=[...QuestionSchema.array().parse(eligibility),...QuestionSchema.array().parse(medical)];const expected=require('./intakeV2Questions.json');const source=[...expected.eligibilityQuestions,...expected.medicalQuestions];if(all.length!==source.length||new Set(all.map(q=>q.id)).size!==source.length||source.some((q:any)=>!all.some((r:any)=>r.id===q.id&&r.kind===q.kind&&JSON.stringify(r.options.map((o:any)=>o.id))===JSON.stringify(q.options.map((o:any)=>o.id)))))throw Error('Invalid v2 questionnaire identity or choices');return {eligibilityQuestions:QuestionSchema.array().parse(eligibility),medicalQuestions:QuestionSchema.array().parse(medical)}}
