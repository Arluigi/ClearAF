import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import {readFileSync} from 'node:fs';
import {launchEnrollment} from '../src/services/launchEnrollment';
test('consent evidence uses the nearest forwarded client only when one proxy hop is trusted',async()=>{
 process.env.SUPABASE_URL='https://synthetic.example.invalid';process.env.SUPABASE_ANON_KEY='synthetic';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic';
 const router=(await import('../src/routes/launch-enrollment')).default;
 const original=launchEnrollment.consents;const seen:string[]=[];
 launchEnrollment.consents=async(_patient,_case,_input,ip)=>{seen.push(ip);return {created:false,response:{}} as any};
 try{
  for(const hops of [0,1]){
   const app=express();app.set('trust proxy',hops);app.use(express.json());app.use((req:any,_res,next)=>{req.user={id:'synthetic',userType:'patient'};next()});app.use('/api/launch',router);
   await request(app).put('/api/launch/enrollment/synthetic/consents').set('X-Forwarded-For','198.51.100.88, 203.0.113.42').send({}).expect(200);
   if(hops===0)assert.match(seen.at(-1)!,/^(::ffff:)?127\.0\.0\.1$|^::1$/);
   else assert.equal(seen.at(-1),'203.0.113.42');
  }
 }finally{launchEnrollment.consents=original}
});
test('server configures numeric TRUST_PROXY_HOPS, and Cloud Run passes one hop as ordinary config',()=>{
 const server=readFileSync(new URL('../src/server.ts',import.meta.url),'utf8');
 assert.match(server,/app\.set\('trust proxy',/);
 assert.match(server,/TRUST_PROXY_HOPS/);
 const deploy=readFileSync(new URL('../../scripts/deploy-cloudrun.sh',import.meta.url),'utf8');
 assert.match(deploy,/--set-env-vars=[^\n]*TRUST_PROXY_HOPS=1/);
 const manifest=readFileSync(new URL('../../scripts/cloudrun-config.sh',import.meta.url),'utf8');assert.doesNotMatch(manifest,/TRUST_PROXY_HOPS/);
});
