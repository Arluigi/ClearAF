// Explicit local operator command. No timers, detached jobs or public retry surface.
async function run(){
 require('dotenv').config({quiet:true});
 const {local}=require('./recovery-drill.cjs');
 local(process.env.DATABASE_URL,['postgres:','postgresql:']);
 local(process.env.SUPABASE_URL,['http:','https:']);
 const limit=process.argv[2]===undefined?25:Number(process.argv[2]);
 if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid limit');
 const {prisma}=require('../dist/config/database');
 try{const {runtimeLaunchBilling}=require('../dist/services/launchBilling');console.log(JSON.stringify(await runtimeLaunchBilling().reconcile(limit)))}finally{await prisma.$disconnect()}
}
if(require.main===module)run().catch(()=>{console.error('Billing reconciliation failed');process.exitCode=1});
module.exports={run};
