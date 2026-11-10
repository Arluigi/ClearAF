import './env';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { launchReviewHref, launchWaiting } from '../src/lib/patient-navigation';
import { LaunchQueueRows } from '../src/components/patients/LaunchReviewQueue';
import { LatestRead } from '../src/lib/care-support';
import type { LaunchQueueItem } from '../src/types/api';
const items:LaunchQueueItem[]=['identity','enrollment','check_in'].map((kind,i)=>({id:String(i),patientId:'p',patientName:'Synthetic Patient',kind:kind as LaunchQueueItem['kind'],targetId:'target',receivedAt:'2026-11-09T12:00:00Z',flags:['sensitive flag']}));
test('all three explicit review kinds link to their target without clinical details',()=>{
 const html=renderToStaticMarkup(h(LaunchQueueRows,{items,context:'page=2&filter=flagged',now:new Date('2026-11-09T15:00:00Z')}));
 assert.match(html,/Identity/);assert.match(html,/Enrollment/);assert.match(html,/Check-in/);assert.doesNotMatch(html,/sensitive flag/);assert.match(html,/Waiting 3 hours/);
 const link=launchReviewHref(items[2],'page=2&filter=flagged&body=private');const params=new URLSearchParams(link.split('?')[1]);assert.equal(params.get('tab'),'check-ins');assert.equal(params.get('reviewTarget'),'target');assert.equal(params.get('filter'),'flagged');assert.equal(params.has('body'),false);
 assert.equal(launchWaiting('2026-11-10T12:00:00Z',new Date('2026-11-09T12:00:00Z')),'Waiting less than an hour');
});
test('queue preserves server chronological paging order and empty state',()=>{
 const html=renderToStaticMarkup(h(LaunchQueueRows,{items:[items[2],items[0]],context:'',now:new Date()}));assert.ok(html.indexOf('Check-in')<html.indexOf('Identity'));
 assert.match(renderToStaticMarkup(h(LaunchQueueRows,{items:[],context:'',now:new Date()})),/No launch reviews waiting/);
});
test('reloading removes resolved reviews, stale pages cannot reappear, errors clear rows',async()=>{
 const read=new LatestRead<LaunchQueueItem[]>();let resolve!:(x:LaunchQueueItem[])=>void;
 const old=read.load(()=>new Promise(r=>{resolve=r;}));await read.load(async()=>[items[2]]);resolve(items);await old;assert.deepEqual(read.snapshot().data,[items[2]]);
 await read.load(async()=>[]);assert.deepEqual(read.snapshot().data,[]);await read.load(async()=>{throw new Error('404');});assert.equal(read.snapshot().status,'error');assert.equal(read.snapshot().data,null);
 await read.load(async()=>items);assert.equal(read.snapshot().status,'ready');
 const pending=read.load(()=>new Promise(r=>{resolve=r;}));read.cancel();resolve([]);await pending;assert.equal(read.snapshot().data,null);
});
test('refresh on a removed last page clamps and reloads; an empty queue returns to page one',async()=>{
 const {readLaunchQueue}=await import('../src/lib/launch');const calls:number[]=[];
 const response=(page:number,totalPages:number,data:LaunchQueueItem[]=[])=>({data,pagination:{page,limit:20,total:totalPages*20,totalPages}});
 let totalPages=3;
 const read=async(page:number)=>{calls.push(page);return response(page,totalPages,page<=totalPages?[items[0]]:[]);};
 assert.equal((await readLaunchQueue(read,3)).pagination.page,3);
 totalPages=1;const refreshed=await readLaunchQueue(read,3);assert.deepEqual(calls,[3,3,1]);assert.equal(refreshed.pagination.page,1);assert.equal(refreshed.data.length,1);
 totalPages=0;calls.length=0;const empty=await readLaunchQueue(read,3);assert.deepEqual(calls,[3,1]);assert.equal(empty.pagination.page,1);assert.deepEqual(empty.data,[]);
});
