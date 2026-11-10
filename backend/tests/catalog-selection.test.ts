import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
const {catalogPath, readCatalog, parseImportArgs}=require('../scripts/lib/launch-catalog.cjs');
test('catalog version must name an existing publication, never an arbitrary path',()=>{
 assert.equal(path.basename(catalogPath('1.0-pending-review')),'1.0-pending-review.json');
 assert.equal(readCatalog('1.0-pending-review').versionLabel,'1.0-pending-review');
 for(const version of [undefined,'','../1.0-pending-review','1.0-pending-review.json','/tmp/source','999.0-pending-review','.env','1.0-pending-review/..'])assert.throws(()=>catalogPath(version));
});
test('local importer requires explicit catalog and clinician and rejects duplicate/unknown arguments',()=>{
 const id='00000000-0000-4000-8000-000000000001';
 assert.deepEqual(parseImportArgs(['--catalog-version','1.0-pending-review','--clinician-id',id]),{catalogVersion:'1.0-pending-review',clinicianId:id,apply:false});
 assert.equal(parseImportArgs(['--apply','--clinician-id',id,'--catalog-version','1.0-pending-review']).apply,true);
 for(const args of [[],['--catalog-version','1.0-pending-review'],['--clinician-id',id],['--catalog-version','missing','--clinician-id',id],['--catalog-version','1.0-pending-review','--clinician-id','invalid'],['--catalog-version','1.0-pending-review','--clinician-id',id,'--apply','--apply'],['--catalog-version','1.0-pending-review','--clinician-id',id,'--unknown']])assert.throws(()=>parseImportArgs(args));
});
test('v2 selection is explicit and returns a distinct immutable publication',()=>{
 const v1=readCatalog('1.0-pending-review'),v2=readCatalog('2.0-pending-review');
 assert.equal(v1.versionLabel,'1.0-pending-review');assert.equal(v2.status,'draft');assert.equal(v2.approvalReference,null);
 assert.deepEqual(v2.consents.map((d:any)=>d.version),[3,3,3,3]);
 const {createHash}=require('node:crypto');
 for(const document of v2.consents){
  assert.match(document.body,/DRAFT.*pending Dr\. Om and Offit Kurman counsel approval/);
  assert(document.body.length>6000);
  assert.equal(document.sha256,createHash('sha256').update(document.body,'utf8').digest('hex'));
  assert.notEqual(document.sha256,v1.consents.find((d:any)=>d.key===document.key).sha256);
 }
 assert.equal(v2.templates.length,6);
 assert(v2.templates.find((t:any)=>t.key==='dark_marks').steps.some((step:any)=>step.instructions.includes('12 weeks')));
});
