import test from 'node:test';
import assert from 'node:assert/strict';
import { PhotoHistoryController } from '../src/lib/photo-history';
import type { Photo, PaginatedResponse } from '../src/types/api';
const photo = (id: string): Photo => ({id,userId:'synthetic',photoUrl:`http://localhost/${id}.jpg`,skinScore:0,captureDate:'2026-09-01T12:00:00Z',createdAt:'2026-09-01T12:00:00Z',updatedAt:'2026-09-01T12:00:00Z'});
const page = (number: number, id: string): PaginatedResponse<Photo> => ({data:[photo(id)],pagination:{page:number,limit:12,total:14,totalPages:2}});
function deferred<T>() { let resolve!: (value:T)=>void; let reject!: (error:Error)=>void; const promise=new Promise<T>((a,b)=>{resolve=a;reject=b}); return {promise,resolve,reject}; }

test('moving between pages replaces photos and exposes real totals',async()=>{
 const controller=new PhotoHistoryController(async n=>page(n,n===1?'newest':'older'));
 await controller.load(1); assert.equal(controller.snapshot().photos[0]?.id,'newest');
 await controller.load(2); assert.deepEqual(controller.snapshot().photos.map(p=>p.id),['older']);
 assert.equal(controller.snapshot().page,2); assert.equal(controller.snapshot().total,14);
});
test('request failure is visible and retry obtains fresh photo access',async()=>{
 let fail=true; const controller=new PhotoHistoryController(async()=>{if(fail)throw new Error('private provider detail');return page(1,'refreshed')});
 await controller.load(1); assert.equal(controller.snapshot().status,'error');
 assert(!controller.snapshot().error.includes('private provider detail'));
 fail=false; await controller.load(1); assert.equal(controller.snapshot().status,'ready');assert.equal(controller.snapshot().photos[0]?.id,'refreshed');
});
test('late page response cannot replace the page the clinician selected',async()=>{
 const older=deferred<PaginatedResponse<Photo>>();const controller=new PhotoHistoryController(n=>n===1?older.promise:Promise.resolve(page(2,'selected')));
 const first=controller.load(1);await controller.load(2);older.resolve(page(1,'late'));await first;
 assert.equal(controller.snapshot().page,2);assert.equal(controller.snapshot().photos[0]?.id,'selected');
});
test('unmount cancellation prevents late patient data from entering state',async()=>{
 const pending=deferred<PaginatedResponse<Photo>>();const controller=new PhotoHistoryController(()=>pending.promise);
 const work=controller.load(1);controller.cancel();pending.resolve(page(1,'old-patient'));await work;
 assert.deepEqual(controller.snapshot().photos,[]);
});
test('empty history and failed refresh do not leave old photos visible',async()=>{
 let response: PaginatedResponse<Photo>|Error=page(1,'old');const controller=new PhotoHistoryController(async()=>{if(response instanceof Error)throw response;return response});
 await controller.load(1); response=new Error('offline');await controller.load(1);assert.deepEqual(controller.snapshot().photos,[]);assert.equal(controller.snapshot().status,'error');
 response={data:[],pagination:{page:1,limit:12,total:0,totalPages:0}};await controller.load(1);assert.equal(controller.snapshot().status,'ready');assert.equal(controller.snapshot().totalPages,1);
});
