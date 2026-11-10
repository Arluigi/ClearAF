// Compatibility cleanup for this run's newly created legacy/probe accounts only.
const assert=require('node:assert/strict');
const {uuid,validateLocalTargets}=require('./unzit-live-guards.cjs');
const roles=['patientA','patientB','doctorA','doctorB','accounts','postmigration','recovery-signup'];
const nullFields=['eligibility','rulesVersion','planId','settingsVersion','destination','identityId','intakeId','photoSetId','submittedAt','approvedAt','patientMessage'];
async function removeEmptyLegacyFixtureCase(db,account,{env=process.env,recordIntent}={}){
 validateLocalTargets(env);
 const {id,email,run,role}=account;
 assert(uuid(id)&&uuid(run)&&roles.includes(role)&&email===(role==='accounts'?`clearaf-accounts-${run}@example.invalid`:`clearaf-security-${run}-${role.toLowerCase()}@example.invalid`),'Unexpected legacy fixture identity');
 await db.query('BEGIN');try{
  const proof=await db.query('SELECT u.id FROM auth.users u JOIN public.launch_allowlist a ON a.email=u.email WHERE u.id=$1::uuid AND u.email=$2 AND a."importBatch"=$3::uuid AND a.enabled=true FOR UPDATE OF u',[id,email,run]);
  assert(proof.rows.length===1&&proof.rows[0].id===id,'Legacy fixture identity proof failed');
  const {rows}=await db.query('SELECT * FROM public.launch_cases WHERE "patientId"=$1::uuid FOR UPDATE',[id]);
  assert(rows.length<=1,'Unexpected legacy empty case count');
  if(!rows.length){await db.query('COMMIT');return null;}
  const row=rows[0];assert(uuid(row.id)&&row.patientId===id&&row.status==='consents'&&row.revision===0&&nullFields.every(k=>row[k]===null),'Legacy fixture case must be empty');assert.deepEqual(row.flags,[],'Legacy fixture case must be empty');
  if(recordIntent)await recordIntent(row.id);
  const children=[['identity_verifications','caseId'],['intake_revisions','caseId'],['care_memberships','caseId'],['launch_reviews','caseId'],['clinical_photo_sets','caseId'],['launch_case_submissions','caseId'],['prescriptions','launchCaseId'],['skin_photos','launchTargetId']];
  const childGuards=children.map(([table,column])=>`NOT EXISTS(SELECT 1 FROM public."${table}" child WHERE child."${column}"=c.id)`).join(' AND ');
  const result=await db.query(`DELETE FROM public.launch_cases c WHERE c.id=$1::uuid AND c."patientId"=$2::uuid AND c.status='consents' AND c.revision=0 AND ${nullFields.map(k=>`c."${k}" IS NULL`).join(' AND ')} AND c.flags='[]'::jsonb AND ${childGuards} AND NOT EXISTS(SELECT 1 FROM public.consent_acceptances consent WHERE consent."userId"=c."patientId")`,[row.id,id]);
  assert.equal(result.rowCount,1,'Legacy empty case has children or changed; cleanup refused');await db.query('COMMIT');return row.id;
 }catch(error){await db.query('ROLLBACK');throw error;}
}
module.exports={removeEmptyLegacyFixtureCase};
