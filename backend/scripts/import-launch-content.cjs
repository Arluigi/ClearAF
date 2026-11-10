// Operator-only publication. Build backend first. Dry-run by default; never prints source text.
const {z}=require('zod');
const {createHash}=require('node:crypto');
const {v5:uuidv5,v4:uuidv4}=require('uuid');
function canonical(value){return JSON.stringify(sort(value))}
function sort(v){return Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v}
function builtValidators(){return {contract:require('../dist/contracts/unzitLaunch'),...require('../dist/content/launchConsents'),...require('../dist/content/launchIntake'),...require('../dist/content/launchCheckIn'),revisionInput:require('../dist/services/routineCareValidation').revisionInput}}
function enumValues(schema){const d=schema._def;if(d.schema)return enumValues(d.schema);if(d.innerType)return enumValues(d.innerType);if(d.typeName==='ZodEnum')return {values:d.values,multi:false};if(d.typeName==='ZodArray'){const v=enumValues(d.type);return v&&{...v,multi:true}}return null}
function fixedChoices(questions,shape){for(const [id,schema]of Object.entries(shape)){const expected=enumValues(schema);if(!expected)continue;const q=questions.find(q=>q.id===id);if(!q||q.kind!==(expected.multi?'multi_choice':'choice')||q.options.length!==expected.values.length||expected.values.some(id=>!q.options.some(o=>o.id===id)))throw Error('Invalid source machine choices')}}
function validateLaunchContent(input,validators=builtValidators()){
 const copy=z.string().trim().min(1).max(2000);
 const photoGuidance=z.object({title:copy,instructions:z.array(copy).min(1),slots:z.array(z.object({id:z.enum(['front','left','right','chest','back','close_up']),label:copy,required:z.boolean(),requiredWhen:z.object({questionId:z.literal('M6'),value:z.enum(['chest','back'])}).strict().nullable()}).strict()).length(6)}).strict().superRefine((v,ctx)=>{
  if(new Set(v.slots.map(s=>s.id)).size!==6||v.slots.some(s=>s.required!==['front','left','right'].includes(s.id)||(['chest','back'].includes(s.id)?s.requiredWhen?.value!==s.id:s.requiredWhen!==null)))ctx.addIssue({code:'custom',message:'Invalid required photo slots'});
 });
 const identityGuidance=z.object({title:copy,items:z.array(z.object({id:z.enum(['government_id','selfie','nc_attestation']),required:z.literal(true),instructions:copy}).strict()).length(3)}).strict().refine(v=>new Set(v.items.map(i=>i.id)).size===3,'Invalid identity guidance');
 const envelope=z.object({status:z.enum(['draft','approved']),versionLabel:z.string().min(1).max(80),approvalReference:z.string().min(1).max(160).nullable(),clinicianId:z.string().uuid(),consents:z.array(z.unknown()),eligibilityQuestions:z.array(z.unknown()),medicalQuestions:z.array(z.unknown()),checkInForm:z.unknown(),photoGuidance:photoGuidance.optional(),identityGuidance:identityGuidance.optional(),templates:z.array(z.object({key:z.string().regex(/^[a-z][a-z0-9_]{0,59}$/),name:z.string().min(1).max(120),steps:z.array(z.unknown()).min(1).max(20)}).strict()).length(6)}).strict().parse(input);
 const pending=label=>label==='0.9-draft'||/^\d+\.\d+-pending-review$/.test(label);
 if(envelope.status==='draft'&&!pending(envelope.versionLabel)||envelope.status==='approved'&&(!envelope.approvalReference||pending(envelope.versionLabel)))throw Error('Clinical publication approval reference required');
 const docs=validators.validateLaunchDocuments(envelope.consents);
 if(docs.some(d=>d.acceptedAt!==null)||envelope.status==='draft'&&docs.some(d=>d.versionLabel!==envelope.versionLabel||!d.body.includes('DRAFT'))||envelope.status==='approved'&&docs.some(d=>/draft|pending-review/.test(d.versionLabel)))throw Error('Invalid publication document state');
 const eligibility=validators.contract.QuestionSchema.array().length(4).parse(envelope.eligibilityQuestions);
 if(new Set(eligibility.map(q=>q.id)).size!==4||['E1','E2','E3','E4'].some(id=>!eligibility.some(q=>q.id===id)))throw Error('Invalid eligibility source identity');
 const medical=validators.validateLaunchIntakeCatalog(envelope.medicalQuestions);
 fixedChoices(eligibility,validators.contract.EligibilitySchema.shape);fixedChoices(medical,validators.contract.MedicalHistorySchema.shape);
 const checkInForm=validators.validateLaunchCheckInContent(envelope.checkInForm);
 if(envelope.status==='draft'&&(!checkInForm.title.startsWith('DRAFT')||checkInForm.versionLabel!==envelope.versionLabel))throw Error('Draft label required');
 if(new Set(envelope.templates.map(t=>t.key)).size!==6)throw Error('Six distinct template keys required');
 // Seed starting points as drafts only. Existing clinician-owned version tooling handles later approval.
 const templates=envelope.templates.map(t=>({key:t.key,...validators.revisionInput.parse({expectedRevisionId:null,name:t.name.startsWith('DRAFT: ')?t.name:'DRAFT: '+t.name,isActive:false,steps:t.steps})}));
 const content={consents:docs,eligibilityQuestions:eligibility,medicalQuestions:medical,checkInForm,publication:{status:envelope.status,versionLabel:envelope.versionLabel,approvalReference:envelope.approvalReference}};
 if(envelope.photoGuidance)content.photoGuidance=envelope.photoGuidance;
 if(envelope.identityGuidance)content.identityGuidance=envelope.identityGuidance;
 content.publication.sha256=createHash('sha256').update(canonical({content,templates})).digest('hex');
 if(Buffer.byteLength(JSON.stringify(content))>190000)throw Error('Content publication too large');
 return {clinicianId:envelope.clinicianId,versionLabel:envelope.versionLabel,content,templates};
}
function assertDocumentHistory(history,docs){for(const doc of docs){let latest=0;for(const settings of history)for(const prior of settings.content?.consents??[]){if(prior.key!==doc.key)continue;latest=Math.max(latest,prior.version);if(prior.version===doc.version){const immutable=d=>({title:d.title,body:d.body,sha256:d.sha256,effectiveAt:d.effectiveAt,versionLabel:d.versionLabel});if(canonical(immutable(prior))!==canonical(immutable(doc)))throw Error('Document version is immutable')}}if(doc.version<latest)throw Error('Document version cannot go backwards')}}
async function publishLaunchContent(db,publication){
 await db.query('BEGIN');try{
  await db.query('LOCK TABLE public.launch_settings IN EXCLUSIVE MODE');
  const clinician=await db.query('SELECT id FROM public.dermatologists WHERE id=$1 FOR UPDATE',[publication.clinicianId]);if(clinician.rows.length!==1)throw Error('Invalid launch clinician');
  const history=(await db.query('SELECT * FROM public.launch_settings ORDER BY version')).rows;assertDocumentHistory(history,publication.content.consents);
  const {rows:[previous]}=await db.query('select * from public.launch_settings where active FOR UPDATE');if(!previous)throw Error('Missing active settings');
  if(previous.clinicianId===publication.clinicianId&&previous.content?.publication?.sha256===publication.content.publication.sha256){await db.query('COMMIT');return {published:0,templates:0,version:previous.version}}
  const version=Number((await db.query('select max(version) as version from public.launch_settings')).rows[0].version)+1;
  await db.query('update public.launch_settings set active=false where active');
  await db.query('INSERT INTO public.launch_settings(version,active,"careAmountCents","allInAmountCents","carePriceId","allInPriceId","clinicianId","contentVersion",content) VALUES($1,true,$2,$3,$4,$5,$6,$7,$8)',[version,previous.careAmountCents,previous.allInAmountCents,previous.carePriceId,previous.allInPriceId,publication.clinicianId,publication.versionLabel,JSON.stringify(publication.content)]);
  let templates=0;
  for(const template of publication.templates){const templateId=uuidv5(template.key,publication.clinicianId),latest=(await db.query('SELECT * FROM public.care_template_revisions WHERE "templateId"=$1 AND "ownerId"=$2 ORDER BY version DESC LIMIT 1',[templateId,publication.clinicianId])).rows[0];
   if(latest&&latest.name===template.name&&latest.isActive===false&&canonical(latest.steps)===canonical(template.steps))continue;
   await db.query('INSERT INTO public.care_template_revisions(id,"templateId","ownerId",version,name,"isActive",steps) VALUES($1,$2,$3,$4,$5,false,$6)',[uuidv4(),templateId,publication.clinicianId,(latest?.version??0)+1,template.name,JSON.stringify(template.steps)]);templates++;
  }
  await db.query('COMMIT');return {published:1,templates,version};
 }catch(error){await db.query('ROLLBACK');throw error}
}
async function run(){
 const args=process.argv.slice(2);if(![1,2].includes(args.length)||args.length===2&&args[1]!=='--apply')throw Error('Expected content JSON and optional --apply');
 const fs=require('node:fs'),path=require('node:path'),file=fs.realpathSync(args[0]),name=path.basename(file);if(name.startsWith('.env')&&name!=='.env.example'||name==='Local.generated.xcconfig'||fs.statSync(file).size>250000)throw Error('Invalid source file');
 const publication=validateLaunchContent(JSON.parse(fs.readFileSync(file,'utf8')));
 if(args.length===1){console.log(JSON.stringify({validatedDocuments:4,questions:27,templates:6,applied:0}));return}
 require('dotenv').config({quiet:true});const {local}=require('./recovery-drill.cjs');local(process.env.DATABASE_URL,['postgres:','postgresql:']);local(process.env.SUPABASE_URL,['http:','https:']);
 const db=new(require('pg').Client)({connectionString:process.env.DATABASE_URL});await db.connect();try{console.log(JSON.stringify(await publishLaunchContent(db,publication)))}finally{await db.end()}
}
if(require.main===module)run().catch(()=>{console.error('Launch content publication failed');process.exitCode=1});
module.exports={validateLaunchContent,publishLaunchContent,assertDocumentHistory};
