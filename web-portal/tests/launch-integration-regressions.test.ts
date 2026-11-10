import './env';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readLaunchChart, launchMembershipWords} from '../src/lib/care-decisions';
import {prescriptionBlock} from '../src/components/patients/PrescriptionSentForm';
import type {LaunchChart, LaunchMembership} from '../src/types/api';
const now=Date.parse('2026-11-09T12:00:00Z');
const membership=(status:LaunchMembership['status']='past_due')=>({status,access:'care',paidThrough:'2099-01-01T00:00:00Z',planId:'care',destinationRequired:false} as LaunchMembership);
test('explicit legacy response selects existing care decisions, refunds and check-ins; errors never do',async()=>{
 const legacy=await readLaunchChart(async()=>({careModel:'legacy'}));assert.equal(legacy,null);
 for(const status of [401,403,404,503])await assert.rejects(readLaunchChart(async()=>{throw {status};}));
 await assert.rejects(readLaunchChart(async()=>({} as LaunchChart)));
});
test('server care access plus unexpired paid-through controls care words independently of billing status',()=>{
 assert.equal(launchMembershipWords(membership(),'approved',now),'Care active');
 for(const paidThrough of [null,'invalid','2026-11-09T12:00:00Z'])assert.match(launchMembershipWords({...membership('active'),paidThrough},'approved',now),/not yet confirmed active/);
 assert.match(launchMembershipWords({...membership(),access:'read_only'},'approved',now),/not yet confirmed active/);
});
test('past-due paid care can record sent Rx only with clinical, location and destination prerequisites',()=>{
 const chart={enrollment:{case:{status:'approved',identity:{status:'approved',attestedInNC:true},destination:{planId:'care'}},membership:membership()},checkIns:{data:[]}} as unknown as LaunchChart;
 assert.equal(prescriptionBlock(chart,now),null);
 for(const mutate of [(c:LaunchChart)=>c.enrollment.membership!.paidThrough=null,(c:LaunchChart)=>c.enrollment.membership!.paidThrough='2026-11-09T12:00:00Z',(c:LaunchChart)=>c.enrollment.membership!.access='enrollment',(c:LaunchChart)=>c.enrollment.membership!.destinationRequired=true,(c:LaunchChart)=>c.enrollment.case.destination=null,(c:LaunchChart)=>c.enrollment.case.status='submitted']){const copy=structuredClone(chart);mutate(copy);assert.notEqual(prescriptionBlock(copy,now),null);}
});
