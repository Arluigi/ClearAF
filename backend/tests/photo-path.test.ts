import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_URL='https://security-test.supabase.co';
process.env.SUPABASE_ANON_KEY='synthetic-anon';
process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-service';
const { ownedPhotoPath } = require('../src/services/photoAccess');
const owner='11111111-1111-4111-8111-111111111111';
const prefix=`https://security-test.supabase.co/storage/v1/object/public/patient-photos/`;
test('accepts owned server object path and legacy project URL',()=>{assert.equal(ownedPhotoPath(`${owner}/image.jpg`,owner),`${owner}/image.jpg`);assert.equal(ownedPhotoPath(`${prefix}${owner}/image.jpg`,owner),`${owner}/image.jpg`)});
for(const path of [
 `${prefix}${owner}/../image.jpg`,`${prefix}${owner}/%2e%2e/image.jpg`,`${prefix}${owner}%2fimage.jpg`,
 `${prefix}${owner}/image.jpg?token=leaked`,`${prefix}${owner}/image.jpg#fragment`,
 `https://attacker.invalid/storage/v1/object/public/patient-photos/${owner}/image.jpg`,
 `${prefix}22222222-2222-4222-8222-222222222222/image.jpg`,`${owner}\\image.jpg`,
 `https://security-test.supabase.co.attacker.invalid/storage/v1/object/public/patient-photos/${owner}/image.jpg`,
 `${owner}/image.html`,`${owner}/nested/image.jpg`
])test('rejects ambiguous or unowned path '+path,()=>assert.throws(()=>ownedPhotoPath(path,owner)));
