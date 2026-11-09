import {QuestionSchema} from '../contracts/unzitLaunch';
// Prompts and labels come from an immutable operator publication of sources.md.
// The absent source is not replaced with invented clinical/legal wording.
export function validateLaunchIntakeCatalog(input:unknown){
 const questions=QuestionSchema.array().length(23).parse(input);
 const expected=[...Array.from({length:22},(_,i)=>'M'+(i+1)),'medicationPreference'];
 if(new Set(questions.map(q=>q.id)).size!==23||expected.some(id=>!questions.some(q=>q.id===id)))throw Error('Invalid source questionnaire identity');
 return questions;
}
