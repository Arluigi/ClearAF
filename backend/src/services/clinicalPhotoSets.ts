import {PhotoSlot,MedicalDraft} from '../contracts/unzitLaunch';
import {captureIdentity} from './photoCapture';
import {enrollmentError} from './enrollment';
export function requiredClinicalSlots(answers:MedicalDraft):PhotoSlot[]{return ['front','left','right',...(answers.M6?.includes('chest')?['chest' as const]:[]),...(answers.M6?.includes('back')?['back' as const]:[])]}
export async function validateClinicalPhotoItems(db:any,patientId:string,setId:string,items:{slot:PhotoSlot;photoId:string;captureId:string}[],required:PhotoSlot[],target?:{purpose:string;id:string},complete=true){
 if(complete&&required.some(slot=>!items.some(i=>i.slot===slot))||new Set(items.map(i=>i.slot)).size!==items.length||new Set(items.map(i=>i.photoId)).size!==items.length)throw enrollmentError(409,'INCOMPLETE_PHOTO_SET');
 for(const item of items){
  const identity=captureIdentity(patientId,item.captureId),photo=await db.skinPhoto.findUnique({where:{id:item.photoId}});
  if(!photo||photo.userId!==patientId||identity.id!==photo.id||photo.photoUrl!==identity.storagePath)throw enrollmentError(404,'NOT_FOUND');
  if(target&&(!photo.launchRequestHash||photo.launchTargetType!==target.purpose||photo.launchTargetId!==target.id))throw enrollmentError(409,'OPERATION_CONFLICT');
  const association=await db.clinicalPhotoSetItem.findFirst({where:{photoId:item.photoId}});
  if(association&&association.setId!==setId)throw enrollmentError(409,'OPERATION_CONFLICT');
 }
}
export async function assertMutableLaunchPhoto(db:any,photoId:string){
 const item=await db.clinicalPhotoSetItem.findFirst({where:{photoId}});
 if(!item)return;
 const set=await db.clinicalPhotoSet.findUnique({where:{id:item.setId}});
 if(set&&set.status!=='draft')throw enrollmentError(409,'OPERATION_CONFLICT');
}
export async function assertLegacyPhotoWriter(db:any,patientId:string){if(await db.launchCase.findUnique({where:{patientId}}))throw enrollmentError(403,'LAUNCH_STEP_REQUIRED')}
