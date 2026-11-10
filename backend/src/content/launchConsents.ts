import {createHash} from 'node:crypto';
import {ConsentSchema,ConsentKeySchema} from '../contracts/unzitLaunch';
// Operator publications retain draft status until clinical/legal wording is approved.
export function validateLaunchDocuments(input:unknown){
 const docs=ConsentSchema.array().length(4).parse(input);
 if(new Set(docs.map(x=>x.key)).size!==4||ConsentKeySchema.options.some(k=>!docs.some(d=>d.key===k)))throw Error('Four distinct documents required');
 for(const d of docs){if(createHash('sha256').update(d.body,'utf8').digest('hex')!==d.sha256)throw Error('Content digest mismatch');if(/draft|pending-review/.test(d.versionLabel)&&!d.body.includes('DRAFT'))throw Error('Draft label required')}
 return docs;
}
