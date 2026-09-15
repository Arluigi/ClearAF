import {createHash} from 'node:crypto';
// Versions are immutable once released: add a new entry to change the text. Acceptances record the hash.
export type ConsentDocument={version:number;title:string;body:string};
const documents:readonly ConsentDocument[]=[{version:1,title:'Consent to online dermatology care (DRAFT)',body:[
 'DRAFT — placeholder text pending review by ClearAF\'s clinical and legal leads. Do not rely on it.',
 'ClearAF provides asynchronous care: you share photos and answers, and your assigned clinician reviews them later. It is not a live visit.',
 'ClearAF is not an emergency service. If you have trouble breathing, swelling of your face, lips or throat, or feel seriously unwell, call 911.',
 'Your clinician may decide that online care is not right for you and recommend in-person care instead.',
 'Your photos and answers are shared with your assigned care team through ClearAF.',
 'You can stop using ClearAF at any time. Record retention will be described in the final version of this document.'
].join('\n\n')}];
export function consentHash(doc:ConsentDocument):string{return createHash('sha256').update(JSON.stringify([doc.version,doc.title,doc.body])).digest('hex')}
export function currentConsent(){const doc=documents[documents.length-1];return {...doc,sha256:consentHash(doc)}}
