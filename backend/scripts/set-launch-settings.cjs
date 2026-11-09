const {z}=require('zod');
const settingsSchema=z.object({careAmountCents:z.number().int().positive(),allInAmountCents:z.number().int().positive(),carePriceId:z.string().regex(/^price_[A-Za-z0-9_]+$/),allInPriceId:z.string().regex(/^price_[A-Za-z0-9_]+$/),clinicianId:z.string().uuid(),contentVersion:z.string().min(1).max(100)}).strict();
async function validateSettings(input,retrievePrice,clinicianExists){
 const settings=settingsSchema.parse(input);
 if(!await clinicianExists(settings.clinicianId))throw Error('Invalid clinician');
 if(settings.carePriceId===settings.allInPriceId)throw Error('Distinct prices required');
 for(const [key,amount] of [['carePriceId','careAmountCents'],['allInPriceId','allInAmountCents']]){
  const p=await retrievePrice(settings[key]);
  if(p.billing_scheme!=='per_unit'||p.transform_quantity!=null||p.custom_unit_amount!=null||p.recurring?.usage_type!=='licensed'||p.livemode!==false||p.active!==true||p.currency!=='usd'||p.unit_amount!==settings[amount]||p.recurring?.interval!=='month'||p.recurring.interval_count!==1)throw Error('Invalid test price');
 }
 return settings;
}
async function publishSettings(db,settings){
 await db.query('BEGIN');try{
 await db.query('LOCK TABLE public.launch_settings IN EXCLUSIVE MODE');
 const {rows:[previous]}=await db.query('select * from public.launch_settings where active FOR UPDATE');
 if(!previous)throw Error('Missing settings');
 // Content can only be switched to an existing immutable publication.
 if(previous.contentVersion!==settings.contentVersion)throw Error('Publish content before selecting its version');
 const version=Number((await db.query('select max(version) as version from public.launch_settings')).rows[0].version)+1;
 await db.query('update public.launch_settings set active=false where active');
 await db.query('insert into public.launch_settings (version,active,"careAmountCents","allInAmountCents","carePriceId","allInPriceId","clinicianId","contentVersion",content) values ($1,true,$2,$3,$4,$5,$6,$7,$8)',[version,settings.careAmountCents,settings.allInAmountCents,settings.carePriceId,settings.allInPriceId,settings.clinicianId,settings.contentVersion,previous.content]);
 await db.query('COMMIT');return {published:1,version};
 }catch(e){await db.query('ROLLBACK');throw e}
}
async function run(){
 if(process.argv.length!==3)throw Error('Expected settings JSON file');
 const input=JSON.parse(require('node:fs').readFileSync(process.argv[2],'utf8'));
 require('dotenv').config({quiet:true});require('./recovery-drill.cjs').local(process.env.DATABASE_URL,['postgres:','postgresql:']);
 const key=process.env.STRIPE_SECRET_KEY;if(!key?.startsWith('sk_test_'))throw Error('Test key required');
 const db=new (require('pg').Client)({connectionString:process.env.DATABASE_URL});await db.connect();
 try{const validated=await validateSettings(input,async id=>{const r=await fetch('https://api.stripe.com/v1/prices/'+encodeURIComponent(id),{headers:{Authorization:'Bearer '+key}});if(!r.ok)throw Error('Price unavailable');return r.json()},async id=>(await db.query('select id from public.dermatologists where id=$1',[id])).rowCount===1);console.log(JSON.stringify(await publishSettings(db,validated)))}finally{await db.end()}
}
if(require.main===module)run().catch(()=>{console.error('Settings publication failed');process.exitCode=1});
module.exports={validateSettings,publishSettings};
