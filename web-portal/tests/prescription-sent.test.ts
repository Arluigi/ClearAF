import './env';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { prescriptionBody, prescriptionBlock } from '../src/components/patients/PrescriptionSentForm';
import { PrescriptionSentRows } from '../src/components/patients/PrescriptionSentHistory';
import { IdempotentAction } from '../src/lib/care-decisions';
import type { LaunchPharmacy, LaunchChart } from '../src/types/api';
const pharmacy:LaunchPharmacy={name:'Synthetic Pharmacy',addressLine1:'1 Test Way',addressLine2:null,city:'Raleigh',state:'NC',postalCode:'27601',phone:'5550100100'};
const draft=()=>({drug:'Synthetic drug',strength:'1%',sig:'Synthetic directions',pharmacy:{...pharmacy},sentAt:'2026-11-09T10:30',confirmed:true,pharmacyConfirmed:true});
test('prescription requires every field, explicit external-send/pharmacy confirmations and valid past timestamp',()=>{
 const now=Date.parse('2026-11-10T12:00:00Z');assert.equal(prescriptionBody(draft(),now).sentAt,new Date('2026-11-09T10:30').toISOString());
 for(const key of ['drug','strength','sig','sentAt'] as const){const input=draft();input[key]='';assert.throws(()=>prescriptionBody(input,now));}
 for(const key of ['name','addressLine1','city','state','postalCode','phone'] as const){const input=draft();input.pharmacy[key]='';assert.throws(()=>prescriptionBody(input,now));}
 for(const key of ['confirmed','pharmacyConfirmed'] as const){const input=draft();input[key]=false;assert.throws(()=>prescriptionBody(input,now));}
 assert.throws(()=>prescriptionBody({...draft(),sentAt:'2099-01-01T12:00'},now),/future/i);assert.throws(()=>prescriptionBody({...draft(),sentAt:'invalid'},now));
});
test('a retry freezes the pharmacy snapshot and uses the same chart record id',async()=>{
 const input=draft(),body=prescriptionBody(input,Date.parse('2026-11-10'));let fails=true;const calls:unknown[]=[];
 const action=new IdempotentAction<typeof body,{id:string}&typeof body>(async(id,payload)=>{calls.push([id,payload]);if(fails)throw new Error('lost');return {id,...payload};},()=> 'record-id');
 await action.submit(body);input.pharmacy.name='Changed destination';body.pharmacy.name='Changed after submit';fails=false;await action.submit(prescriptionBody(input,Date.parse('2026-11-10')));
 assert.deepEqual(calls[0],calls[1]);assert.equal((calls[1] as [string,typeof body])[1].pharmacy.name,'Synthetic Pharmacy');
});
test('identity, clinical approval, paid care and latest NC evidence gate prescription recording',()=>{
 const chart={enrollment:{case:{identity:{status:'approved',attestedInNC:true},status:'approved',destination:{planId:'care'}},membership:{status:'active',access:'care',paidThrough:'2099-01-01T00:00:00Z',planId:'care'}},checkIns:{data:[]}} as unknown as LaunchChart;
 assert.equal(prescriptionBlock(chart),null);chart.enrollment.case.identity!.status='uploaded';assert.match(prescriptionBlock(chart)!,/identity/i);chart.enrollment.case.identity!.status='approved';chart.checkIns.data=[{submittedAt:'2026-11-09',answers:{physicallyInNC:false}}] as LaunchChart['checkIns']['data'];assert.match(prescriptionBlock(chart)!,/NC/);
});
test('persisted entries show external source and immutable pharmacy; legacy records do not invent sent confirmations',()=>{
 const html=renderToStaticMarkup(h(PrescriptionSentRows,{records:[{id:'r',patientId:'p',clinicianId:'c',drug:'Synthetic drug',strength:'1%',sig:'Synthetic directions',pharmacy,sentAt:'2026-11-09T12:00:00Z',recordedAt:'2026-11-09T12:01:00Z',source:'treatrx_external'}]}));assert.match(html,/Synthetic Pharmacy/);assert.match(html,/TreatRx/);assert.match(html,/Recorded/);assert.doesNotMatch(html,/Send e-Rx|dispensed|shipped/);
 const legacy=renderToStaticMarkup(h(PrescriptionSentRows,{records:[{id:'legacy',medicationName:'Legacy medication',dosage:'Legacy dosage',instructions:'Legacy directions',pharmacy:'Legacy pharmacy',prescribedDate:'2026-09-01'}]}));assert.match(legacy,/Legacy medication/);assert.match(legacy,/Sent time not recorded/);assert.doesNotMatch(legacy,/Already sent in TreatRx/);
});
test('prescription history controls prevent refresh and paging while an unsaved or ambiguous record exists',async()=>{
 const {PrescriptionRecordControls}=await import('../src/components/patients/PrescriptionSentHistory');
 const html=renderToStaticMarkup(h(PrescriptionRecordControls,{locked:true,page:2,totalPages:3,onRefresh:()=>{},onPage:()=>{}}));assert.match(html,/<fieldset[^>]*disabled/);assert.match(html,/Save or resolve/);
 const ready=renderToStaticMarkup(h(PrescriptionRecordControls,{locked:false,page:2,totalPages:3,onRefresh:()=>{},onPage:()=>{}}));assert.doesNotMatch(ready,/<fieldset[^>]*disabled/);
});
