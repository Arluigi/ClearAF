import {test} from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
process.env.SUPABASE_URL='https://security-test.supabase.co';
process.env.SUPABASE_ANON_KEY='synthetic-anon';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-service';
let active=true,verified=true;
const original=(Module as any)._load;
(Module as any)._load=function(name:string,...args:any[]){if(name==='@prisma/client')return {PrismaClient:class{dermatologist={findUnique:async()=>null};$queryRaw=async()=>[{active}];$queryRawUnsafe=async()=>[{active}]}};return original.call(this,name,...args)};
const config=require('../src/config/supabase');
config.supabaseAdmin.auth.getUser=async()=>({data:{user:{id:'11111111-1111-4111-8111-111111111111',email:'synthetic@example.invalid',email_confirmed_at:verified?'2026-01-01':null}},error:null});
const{authenticateToken}=require('../src/middleware/auth');(Module as any)._load=original;
async function authorize(){let status=200,called=false;const payload=Buffer.from(JSON.stringify({session_id:'22222222-2222-4222-8222-222222222222'})).toString('base64url');await authenticateToken({headers:{authorization:`Bearer e30.${payload}.synthetic`}},{status:(s:number)=>{status=s;return{json:()=>{}}}},()=>{called=true});return{status,called}}
test('confirmed active session is accepted',async()=>{active=true;verified=true;assert.deepEqual(await authorize(),{status:200,called:true})});
test('revoked session is rejected even if its access JWT has not expired',async()=>{active=false;verified=true;assert.deepEqual(await authorize(),{status:401,called:false})});
test('unconfirmed email cannot acquire a clinical role',async()=>{active=true;verified=false;assert.deepEqual(await authorize(),{status:401,called:false})});
