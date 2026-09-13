import {test} from 'node:test';
import assert from 'node:assert/strict';
import {statusQuery, emptyReviewBody} from '../src/services/photoReview';
const id='11111111-1111-4111-8111-111111111111';
test('batch accepts unique UUIDs only, with a hard bound',()=>{
 assert.deepEqual(statusQuery.parse({photoIds:id}).photoIds,[id]);
 for(const photoIds of ['', 'bad', `${id},`, `${id},${id}`,Array(51).fill(id).join(',')]) assert.equal(statusQuery.safeParse({photoIds}).success,false);
 assert.equal(statusQuery.safeParse({}).success,false);
 assert.equal(statusQuery.safeParse({photoIds:[id]}).success,false);
});
test('review author and time cannot be supplied by clients',()=>{
 assert.deepEqual(emptyReviewBody.parse({}),{});
 for(const body of [{reviewerId:id},{reviewedAt:new Date().toISOString()},[],null])assert.equal(emptyReviewBody.safeParse(body).success,false);
});

import {prisma} from '../src/config/database';
import {markReviewed,reviewStatus} from '../src/services/photoReview';
const owner='22222222-2222-4222-8222-222222222222',clinician='33333333-3333-4333-8333-333333333333',other='44444444-4444-4444-8444-444444444444';
test('assignment is checked after locking and retry retains original author/time',async()=>{
 const original=prisma.$transaction;let assignment=clinician,afterLock:(()=>void)|undefined,row:any=null,creates=0;
 const tx:any={
  skinPhoto:{findUnique:async()=>({userId:owner}),findMany:async()=>[{id,userId:owner}]},
  user:{findUnique:async()=>({dermatologistId:assignment})},
  $queryRaw:async()=>{afterLock?.();afterLock=undefined;return[]},
  photoReview:{findUnique:async()=>row,findMany:async()=>row?[row]:[],create:async({data}:any)=>{creates++;row={...data,reviewedAt:new Date('2026-01-01'),reviewer:{name:'Original clinician'}};return row}}
 };
 (prisma as any).$transaction=async(fn:any)=>fn(tx);
 try{
  afterLock=()=>{assignment=other};await assert.rejects(markReviewed(id,clinician),{statusCode:404});assert.equal(creates,0);
  assignment=clinician;const first=await markReviewed(id,clinician);assert.equal(first.created,true);
  assignment=other;const repeated=await markReviewed(id,other);assert.equal(repeated.created,false);assert.deepEqual(repeated.review,first.review);assert.equal(creates,1);
  await assert.rejects(reviewStatus([id],{id:clinician,userType:'dermatologist'}),{statusCode:404});
  await assert.rejects(reviewStatus([id],{id:other,userType:'patient'}),{statusCode:404});
  assert.deepEqual((await reviewStatus([id],{id:owner,userType:'patient'})).reviews,[first.review]);
 }finally{prisma.$transaction=original}
});
test('mixed or missing photo batches return no partial status',async()=>{
 const original=prisma.$transaction;let reads=0;
 (prisma as any).$transaction=async(fn:any)=>fn({skinPhoto:{findMany:async()=>[{id,userId:owner}]},photoReview:{findMany:async()=>{reads++;return[]}}});
 try{await assert.rejects(reviewStatus([id,other],{id:owner,userType:'patient'}),{statusCode:404});assert.equal(reads,0)}finally{prisma.$transaction=original}
});
