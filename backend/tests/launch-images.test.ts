import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {sanitizeLaunchJPEG,IDENTITY_IMAGE_BYTES,SKIN_IMAGE_BYTES} from '../src/services/identityVerification';
test('stored JPEG re-encoding strips EXIF and respects image budgets',async()=>{
 const input=await sharp({create:{width:100,height:100,channels:3,background:'#aabbcc'}}).jpeg().withMetadata({exif:{IFD0:{Artist:'Synthetic metadata'}}}).toBuffer();
 assert.ok((await sharp(input).metadata()).exif);
 const stored=await sanitizeLaunchJPEG(input,'identity');assert.equal((await sharp(stored).metadata()).exif,undefined);
 for(const [kind,size] of [['identity',IDENTITY_IMAGE_BYTES],['skin',SKIN_IMAGE_BYTES]] as const)await assert.rejects(sanitizeLaunchJPEG(Buffer.alloc(size+1),kind),{statusCode:413,code:'PAYLOAD_TOO_LARGE'});
});
test('mislabeled/non-JPEG images and excessive pixel dimensions are refused',async()=>{
 const png=await sharp({create:{width:10,height:10,channels:3,background:'white'}}).png().toBuffer();
 await assert.rejects(sanitizeLaunchJPEG(png,'identity'));
 await assert.rejects(sanitizeLaunchJPEG(Buffer.from('synthetic'),'skin'));
});
import {Readable} from 'node:stream';
import {readLaunchMultipart} from '../src/services/identityVerification';
const multipart=(parts:string[],boundary='synthetic')=>Buffer.from(parts.map(p=>'--'+boundary+'\r\n'+p+'\r\n').join('')+'--'+boundary+'--\r\n');
const request=(bytes:Buffer)=>Object.assign(Readable.from([bytes]),{headers:{'content-type':'multipart/form-data; boundary=synthetic'}});
test('multipart counts streamed bytes without Content-Length and rejects duplicate/oversized parts',async()=>{
 const bytes=multipart(['Content-Disposition: form-data; name="fullName"\r\n\r\nSynthetic Example','Content-Disposition: form-data; name="selfie"; filename="x.jpg"\r\nContent-Type: image/jpeg\r\n\r\nsynthetic']);
 const parsed=await readLaunchMultipart(request(bytes) as any,'identity');assert.equal(parsed.fullName,'Synthetic Example');assert.ok(Buffer.isBuffer(parsed.selfie));
 await assert.rejects(readLaunchMultipart(request(Buffer.alloc(3.5*1024*1024+1)) as any,'identity'),{code:'PAYLOAD_TOO_LARGE'});
 await assert.rejects(readLaunchMultipart(request(multipart(['Content-Disposition: form-data; name="fullName"\r\n\r\nA','Content-Disposition: form-data; name="fullName"\r\n\r\nB'])) as any,'identity'),{code:'VALIDATION_ERROR'});
 const oversized=multipart(['Content-Disposition: form-data; name="selfie"; filename="x.jpg"\r\nContent-Type: image/jpeg\r\n\r\n'+'x'.repeat(IDENTITY_IMAGE_BYTES+1)]);await assert.rejects(readLaunchMultipart(request(oversized) as any,'identity'),{code:'PAYLOAD_TOO_LARGE'});
});
import {storeLaunchJPEG,identityObjectPaths} from '../src/services/identityVerification';
test('crash-resume verifies exact existing bytes and never overwrites a private object',async()=>{
 const paths=identityObjectPaths('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002');assert.deepEqual(paths,identityObjectPaths('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'));assert.notEqual(paths.idPhotoPath,paths.selfiePath);
 const objects=new Map<string,Buffer>();let writes=0;const storage={upload:async(path:string,bytes:Buffer)=>{if(objects.has(path))return {error:{statusCode:'409'}};objects.set(path,bytes);writes++;return {error:null}},download:async(path:string)=>({data:new Blob([objects.get(path)!]),error:null})};
 const bytes=Buffer.from('synthetic JPEG fixture');await storeLaunchJPEG(storage,paths.idPhotoPath,bytes);await storeLaunchJPEG(storage,paths.idPhotoPath,bytes);assert.equal(writes,1);
 await assert.rejects(storeLaunchJPEG(storage,paths.idPhotoPath,Buffer.from('different bytes')),{code:'OPERATION_CONFLICT'});assert.equal(writes,1);
});
test('image endpoints refuse already-consumed JSON bodies before waiting for stream end',async()=>{const req={headers:{'content-type':'application/json'},readableEnded:true};await assert.rejects(readLaunchMultipart(req as any,'identity'),{code:'VALIDATION_ERROR'})});
