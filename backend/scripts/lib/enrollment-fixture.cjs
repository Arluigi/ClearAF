// Loopback live scripts enroll their synthetic patients so gated writes behave like the app.
const crypto=require('node:crypto');
async function enrollFixture(db,userIds,{rulesVersion,documentVersion,documentSha256}){
 for(const userId of userIds){
  await db.query('insert into public.eligibility_screenings(id,"userId","stateCode","dateOfBirth","pregnancyStatus",eligible,reasons,flags,"rulesVersion") values($1,$2,$3,$4,$5,true,$6,$6,$7)',[crypto.randomUUID(),userId,'IL','1990-01-01','none','{}',rulesVersion]);
  await db.query('insert into public.consent_acceptances("userId","documentVersion","documentSha256") values($1,$2,$3) on conflict do nothing',[userId,documentVersion,documentSha256]);
 }
}
async function unenrollFixture(db,userIds){
 await db.query('delete from public.consent_acceptances where "userId"=any($1::uuid[])',[userIds]);
 await db.query('delete from public.eligibility_screenings where "userId"=any($1::uuid[])',[userIds]);
}
module.exports={enrollFixture,unenrollFixture};
