import sharp from 'sharp';
import {enrollmentError} from './enrollment';
export const IDENTITY_IMAGE_BYTES=1.5*1024*1024,SKIN_IMAGE_BYTES=3*1024*1024,MULTIPART_BYTES=3.5*1024*1024;
export async function sanitizeLaunchJPEG(bytes:Buffer,purpose:'identity'|'skin'){
 const max=purpose==='identity'?IDENTITY_IMAGE_BYTES:SKIN_IMAGE_BYTES;
 if(bytes.length>max)throw enrollmentError(413,'PAYLOAD_TOO_LARGE');
 try{
  const decoder=sharp(bytes,{limitInputPixels:24_000_000,failOn:'warning'});
  const metadata=await decoder.metadata();
  if(metadata.format!=='jpeg'||!metadata.width||!metadata.height||metadata.width>10000||metadata.height>10000)throw Error('Invalid JPEG');
  const encoded=await decoder.rotate().jpeg({quality:90,mozjpeg:true}).toBuffer();
  if(encoded.length>max)throw enrollmentError(413,'PAYLOAD_TOO_LARGE');
  return encoded;
 }catch(e){if((e as any).statusCode)throw e;throw enrollmentError(400,'VALIDATION_ERROR')}
}

/** Read actual streamed bytes before parsing. Never trust Content-Length. */
export async function readLaunchMultipart(req:import('node:http').IncomingMessage,purpose:'identity'|'skin'):Promise<Record<string,any>>{
 if(req.destroyed||req.readableEnded||!/^multipart\/form-data\s*;/i.test(String(req.headers['content-type']??''))||!/(?:^|;)\s*boundary=(?:"[^"]+"|[^;\s]+)/i.test(String(req.headers['content-type']??'')))throw enrollmentError(400,'VALIDATION_ERROR');
 const bytes=await new Promise<Buffer>((resolve,reject)=>{
  let size=0,finished=false;const chunks:Buffer[]=[];
  const fail=(error:Error)=>{if(finished)return;finished=true;chunks.length=0;req.removeListener('data',data);req.resume();reject(error)};
  const data=(chunk:Buffer)=>{size+=chunk.length;if(size>MULTIPART_BYTES)return fail(enrollmentError(413,'PAYLOAD_TOO_LARGE'));chunks.push(chunk)};
  req.on('data',data);req.once('error',()=>fail(enrollmentError(400,'VALIDATION_ERROR')));req.once('aborted',()=>fail(enrollmentError(400,'VALIDATION_ERROR')));
  req.once('end',()=>{if(!finished){finished=true;resolve(Buffer.concat(chunks))}});
 });
 return new Promise((resolve,reject)=>{
  let parser:any;try{parser=require('busboy')({headers:req.headers,limits:{fileSize:purpose==='identity'?IDENTITY_IMAGE_BYTES:SKIN_IMAGE_BYTES,files:purpose==='identity'?2:1,fields:8,fieldSize:2000,parts:10}})}catch{return reject(enrollmentError(400,'VALIDATION_ERROR'))}
  const fields=Object.create(null),seen=new Set<string>();let failure:Error;
  const fail=(status=400)=>{failure??=enrollmentError(status,status===413?'PAYLOAD_TOO_LARGE':'VALIDATION_ERROR')};
  parser.on('field',(name:string,value:string,info:any)=>{if(seen.has(name))fail();seen.add(name);if(info.nameTruncated||info.valueTruncated)fail(413);fields[name]=value});
  parser.on('file',(name:string,file:any,info:any)=>{
   if(seen.has(name))fail();seen.add(name);if(info.mimeType!=='image/jpeg')fail();const parts:Buffer[]=[];
   file.on('data',(chunk:Buffer)=>parts.push(chunk));file.on('limit',()=>fail(413));file.on('error',()=>fail());file.on('end',()=>{fields[name]=Buffer.concat(parts)});
  });
  for(const event of ['filesLimit','fieldsLimit','partsLimit'])parser.on(event,()=>fail(413));
  parser.on('error',()=>reject(enrollmentError(400,'VALIDATION_ERROR')));parser.on('close',()=>failure?reject(failure):resolve(fields));parser.end(bytes);
 });
}

import {v5 as uuidv5} from 'uuid';
export function identityObjectPaths(patientId:string,identityId:string){return {idPhotoPath:`${patientId}/${uuidv5(identityId+':id',patientId)}-id.jpg`,selfiePath:`${patientId}/${uuidv5(identityId+':selfie',patientId)}-selfie.jpg`}}
/** Idempotent private object storage after an interrupted DB transaction. Never upsert. */
export async function storeLaunchJPEG(storage:{upload:Function;download:Function},path:string,bytes:Buffer){
 const {error}=await storage.upload(path,bytes,{contentType:'image/jpeg',upsert:false});
 if(!error)return;
 if(String(error.statusCode??error.status)!=='409')throw enrollmentError(503,'BILLING_UNAVAILABLE');
 const downloaded=await storage.download(path);
 if(downloaded.error||!downloaded.data)throw enrollmentError(503,'BILLING_UNAVAILABLE');
 const existing=Buffer.from(await downloaded.data.arrayBuffer());
 if(!existing.equals(bytes))throw enrollmentError(409,'OPERATION_CONFLICT');
}
