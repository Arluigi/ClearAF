import {z} from 'zod';
// Validation is independent of database/session initialization.
const uuid=z.string().uuid().transform(v=>v.toLowerCase());
const validDate=(v:string)=>{const d=new Date(`${v}T00:00:00Z`);return /^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v};
export const dayInput=z.string().refine(validDate,'Invalid local date');
export const monthInput=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export function monthBounds(month:string){monthInput.parse(month);const [year,m]=month.split('-').map(Number);return {start:`${month}-01`,end:`${String(m===12?year+1:year).padStart(4,'0')}-${String(m===12?1:m+1).padStart(2,'0')}-01`}}
const option=z.object({id:uuid,label:z.string().trim().min(1).max(160)}).strict();
export const questionInput=z.object({id:uuid,prompt:z.string().trim().min(1).max(300),type:z.enum(['text','choice']),required:z.boolean(),options:z.array(option).max(10)}).strict().superRefine((q,c)=>{if(q.type==='text'?q.options.length!==0:q.options.length<2)c.addIssue({code:'custom',message:'Invalid options for question type'});if(new Set(q.options.map(o=>o.id)).size!==q.options.length)c.addIssue({code:'custom',message:'Duplicate option identity'})});
export const formInput=z.object({expectedRevisionId:uuid.nullable(),title:z.string().trim().min(1).max(120),isActive:z.boolean(),questions:z.array(questionInput).max(10)}).strict().superRefine((v,c)=>{if(v.isActive&&!v.questions.length)c.addIssue({code:'custom',message:'Active form requires questions'});const ids=v.questions.flatMap(q=>[q.id,...q.options.map(o=>o.id)]);if(new Set(ids).size!==ids.length)c.addIssue({code:'custom',message:'Duplicate form identity'})});
const answerInput=z.object({questionId:uuid,text:z.string().max(2000).optional(),optionId:uuid.optional()}).strict();
export const responseInput=z.object({formId:uuid,submittedAt:z.string().max(40).datetime({offset:true}).refine(v=>validDate(v.slice(0,10))&&Number.isFinite(Date.parse(v))&&Date.parse(v)<=Date.now()+300000,'Invalid submission timestamp'),answers:z.array(answerInput).max(10)}).strict();
export function validateAnswers(questions:z.infer<typeof questionInput>[],answers:z.infer<typeof answerInput>[]){
 const issues:z.ZodIssue[]=[];const seen=new Set<string>();const fail=()=>issues.push({code:'custom',path:['answers'],message:'Answers do not match form'});
 for(const a of answers){const q=questions.find(q=>q.id===a.questionId);if(!q||seen.has(a.questionId)){fail();continue}seen.add(a.questionId);if(q.type==='text'){if(a.optionId!==undefined||a.text===undefined||a.text.length>2000||(q.required&&!a.text.trim()))fail()}else if(a.text!==undefined||!q.options.some(o=>o.id===a.optionId))fail()}
 if(questions.some(q=>q.required&&!seen.has(q.id)))fail();if(issues.length)throw new z.ZodError(issues);
}
// Compare timeline (iOS): two capture instants and the device zone that turns them into local dates.
export const timelineMaxDays=1096;
const instantInput=z.string().max(40).datetime({offset:true}).refine(v=>validDate(v.slice(0,10))&&Number.isFinite(Date.parse(v)),'Invalid timestamp');
const zoneInput=z.string().min(1).max(100).refine(zone=>{if(/^[+-]/.test(zone))return false;try{new Intl.DateTimeFormat('en-US',{timeZone:zone});return true}catch{return false}},'Invalid IANA timezone');
export const timelineQuery=z.object({from:instantInput,to:instantInput,timeZone:zoneInput}).strict().superRefine((v,c)=>{const from=Date.parse(v.from),to=Date.parse(v.to);if(from>to)c.addIssue({code:'custom',path:['to'],message:'to must not be before from'});else if(to-from>timelineMaxDays*86400000)c.addIssue({code:'custom',path:['to'],message:'Range is too long'})});
export function localDateIn(instant:Date,timeZone:string){const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(instant);const part=(type:string)=>parts.find(p=>p.type===type)?.value;return `${part('year')}-${part('month')}-${part('day')}`}
export function daySpan(fromDate:string,toDate:string){return Math.round((Date.parse(`${toDate}T00:00:00Z`)-Date.parse(`${fromDate}T00:00:00Z`))/86400000)+1}
