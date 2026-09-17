import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PhotoReviewController } from '../src/lib/photo-review';
const review = { photoId: 'a', reviewerName: 'Clinician', reviewedAt: '2026-09-13T00:00:00Z' };
test('comparison selects at most two current-page photos and reset discards late originals', async () => {
 let resolve!: (value: {photoUrl:string}) => void;
 const original = new Promise<{photoUrl:string}>(r => { resolve = r; });
 const controller = new PhotoReviewController(async () => ({reviews:[]}), async () => ({review}), () => original);
 await controller.load(['a','b','c']);
 controller.toggle('foreign'); controller.toggle('a'); controller.toggle('b'); controller.toggle('c');
 assert.deepEqual(controller.snapshot().selected, ['a','b']);
 controller.toggle('b'); assert.deepEqual(controller.snapshot().selected,['a']); controller.toggle('b');
 const pending = controller.compare();
 controller.reset(); resolve({photoUrl:'private'}); await pending;
 assert.deepEqual(controller.snapshot().originals, {});
 assert.deepEqual(controller.snapshot().selected, []);
});
test('review failure remains explicit and retry stores server acknowledgement', async () => {
 let fail = true;
 const controller = new PhotoReviewController(async () => { if(fail) throw Error(); return {reviews:[]}; }, async () => { if(fail) throw Error(); return {review}; }, async () => ({photoUrl:''}));
 await controller.load(['a']); assert.equal(controller.snapshot().status, 'error');
 fail=false; await controller.load(['a']); assert.equal(controller.snapshot().status,'ready');
 fail=true; await controller.mark('a'); assert.equal(controller.snapshot().errors.a, true); assert.equal(controller.snapshot().reviews.a, undefined);
 fail=false; await controller.mark('a'); assert.deepEqual(controller.snapshot().reviews.a, review); assert.equal(controller.snapshot().errors.a, undefined);
});
test('account reset rejects late acknowledgement', async () => {
 let resolve!: (value:{review:typeof review})=>void;
 const controller = new PhotoReviewController(async()=>({reviews:[]}), ()=>new Promise(r=>{resolve=r;}), async()=>({photoUrl:''}));
 await controller.load(['a']); const pending=controller.mark('a'); controller.reset(); resolve({review}); await pending;
 assert.deepEqual(controller.snapshot().reviews,{});
});

test('changing photo pages clears selection and ignores stale status', async () => {
 let resolve!: (value:{reviews:typeof review[]})=>void;
 let calls=0;
 const controller=new PhotoReviewController(()=>++calls===1?new Promise(r=>{resolve=r;}):Promise.resolve({reviews:[]}),async()=>({review}),async()=>({photoUrl:''}));
 const first=controller.load(['a']); controller.toggle('a'); await controller.load(['b']); resolve({reviews:[review]}); await first;
 assert.deepEqual(controller.snapshot().selected,[]); assert.deepEqual(controller.snapshot().reviews,{}); assert.deepEqual(controller.snapshot().ids,['b']);
});

test('a page load preselects only ids on that page, compares one or two photos, and a toggle while comparing starts over', async () => {
 const fetched: string[] = [];
 const controller = new PhotoReviewController(async () => ({reviews:[]}), async () => ({review}), async id => { fetched.push(id); return {photoUrl:`private-${id}`}; });
 await controller.load(['a','b','c'], ['b','c','foreign']);
 assert.deepEqual(controller.snapshot().selected, ['b','c']);
 await controller.compare();
 assert.deepEqual(controller.snapshot().originals, { b: { url: 'private-b' }, c: { url: 'private-c' } });
 controller.toggle('c');
 assert.deepEqual([controller.snapshot().selected, controller.snapshot().comparing, controller.snapshot().originals], [['b'], false, {}]);
 await controller.compare();
 assert.deepEqual(controller.snapshot().originals, { b: { url: 'private-b' } });
 controller.toggle('b');
 await controller.compare();
 assert.deepEqual(fetched, ['b','c','b']);
 controller.toggle('a'); controller.toggle('b'); controller.toggle('c');
 assert.deepEqual(controller.snapshot().selected, ['a','b']);
});
