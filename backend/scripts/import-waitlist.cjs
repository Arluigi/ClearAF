// Operator-only, counts-only importer. Runtime configuration may load normally.
const crypto=require('node:crypto');
function parseWaitlist(input){
 if(typeof input!=='string'||Buffer.byteLength(input)>10*1024*1024)throw Error('Invalid CSV');
 const rows=[];let row=[],field='',quoted=false,closed=false;
 input=input.replace(/^\uFEFF/,'');
 for(let i=0;i<input.length;i++){
  const ch=input[i];
  if(quoted){if(ch==='"'){if(input[i+1]==='"'){field+='"';i++}else{quoted=false;closed=true}}else field+=ch;continue}
  if(ch==='"'){if(field||closed)throw Error('Invalid CSV quoting');quoted=true;continue}
  if(ch===','||ch==='\n'||ch==='\r'){
   row.push(field);field='';closed=false;
   if(ch!==','){if(ch==='\r'&&input[i+1]==='\n')i++;if(row.some(x=>x!==''))rows.push(row);row=[]}
  }else {if(closed)throw Error('Invalid CSV quoting');field+=ch}
 }
 if(quoted)throw Error('Invalid CSV quoting');
 if(field||closed||row.length){row.push(field);rows.push(row)}
 if(!rows.length)throw Error('Missing email column');
 const header=rows.shift().map(x=>x.trim().toLowerCase()),indexes=header.flatMap((x,i)=>x==='email'?[i]:[]);
 if(indexes.length!==1)throw Error('Expected one email column');
 const emails=new Set();
 for(const values of rows){if(values.length!==header.length)throw Error('Invalid CSV columns');const email=values[indexes[0]].trim().toLowerCase();if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Invalid email');emails.add(email)}
 return [...emails].sort();
}
async function importWaitlist(db,csv,{apply=false}={}){
 const emails=parseWaitlist(csv);if(!apply)return {parsed:emails.length,applied:0};
 const batch=crypto.randomUUID();await db.query('BEGIN');
 try{for(const email of emails)await db.query('INSERT INTO public.launch_allowlist (email,"importBatch") VALUES ($1,$2) ON CONFLICT (email) DO UPDATE SET enabled=true,"importBatch"=EXCLUDED."importBatch","importedAt"=CURRENT_TIMESTAMP',[email,batch]);await db.query('COMMIT');return {parsed:emails.length,applied:emails.length}}catch(e){await db.query('ROLLBACK');throw e}
}
async function run(){
 const args=process.argv.slice(2);if(![1,2].includes(args.length)||args.length===2&&args[1]!=='--apply')throw Error('Expected CSV path and optional --apply');
 const csv=require('node:fs').readFileSync(args[0],'utf8');
 if(args.length===1){console.log(JSON.stringify(await importWaitlist(null,csv)));return}
 require('dotenv').config({quiet:true});require('./recovery-drill.cjs').local(process.env.DATABASE_URL,['postgres:','postgresql:']);
 // This phase allows only local synthetic identities, even in an operator import.
 if(parseWaitlist(csv).some(x=>!x.endsWith('@example.invalid')))throw Error('Synthetic identities required');
 const db=new (require('pg').Client)({connectionString:process.env.DATABASE_URL});await db.connect();try{console.log(JSON.stringify(await importWaitlist(db,csv,{apply:true})))}finally{await db.end()}
}
if(require.main===module)run().catch(()=>{console.error('Waitlist import failed');process.exitCode=1});
module.exports={parseWaitlist,importWaitlist};
