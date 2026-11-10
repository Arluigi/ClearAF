import {prisma} from '../config/database';
import {contracts,UUIDSchema,PrescriptionSentSchema} from '../contracts/unzitLaunch';
import {enrollmentError} from './enrollment';
import {launchFingerprint} from './launchEnrollment';
import {authorizeAssignedPatient,assertLaunchPrescriptionAccess} from './careAccess';
export function prescriptionSentDTO(r:any){return PrescriptionSentSchema.parse({id:r.id,patientId:r.patientId,clinicianId:r.dermatologistId,drug:r.medicationName,strength:r.strength,sig:r.instructions,pharmacy:r.pharmacySnapshot,sentAt:new Date(r.sentAt).toISOString(),recordedAt:new Date(r.recordedAt).toISOString(),source:r.source})}
export async function prescriptionPage(tx:any,patientId:string,page=1,limit=20){const where={patientId,source:'treatrx_external'},total=await tx.prescription.count({where}),rows=await tx.prescription.findMany({where,orderBy:[{sentAt:'desc'},{id:'desc'}],skip:(page-1)*limit,take:limit});return {data:rows.map(prescriptionSentDTO),pagination:{page,limit,total,totalPages:Math.ceil(total/limit)}}}
export function createPrescriptionRecords({db,now=()=>new Date()}:{db:any;now?:()=>Date}){return {
 async record(patientId:string,clinicianId:string,recordId:string,input:unknown){UUIDSchema.parse(patientId);UUIDSchema.parse(recordId);const parsed=contracts['PUT /patients/:patientId/prescriptions-sent/:recordId'].request.parse(input),a={...parsed,sentAt:new Date(parsed.sentAt).toISOString()};if(new Date(a.sentAt)>now())throw enrollmentError(400,'VALIDATION_ERROR');return db.$transaction(async(tx:any)=>{
  await authorizeAssignedPatient(tx,patientId,clinicianId);
  const old=await tx.prescription.findUnique({where:{id:recordId}});
  if(old){if(old.patientId!==patientId)throw enrollmentError(404,'NOT_FOUND');if(old.dermatologistId!==clinicianId||old.source!=='treatrx_external')throw enrollmentError(409,'OPERATION_CONFLICT');const d=prescriptionSentDTO(old);if(launchFingerprint({drug:d.drug,strength:d.strength,sig:d.sig,pharmacy:d.pharmacy,sentAt:d.sentAt})!==launchFingerprint(a))throw enrollmentError(409,'OPERATION_CONFLICT');return {prescription:d,created:false}}
  const row=await assertLaunchPrescriptionAccess(tx,patientId,now());if(!row)throw enrollmentError(403,'LAUNCH_STEP_REQUIRED');
  const saved=await tx.prescription.create({data:{id:recordId,patientId,dermatologistId:clinicianId,medicationName:a.drug,dosage:a.strength,strength:a.strength,instructions:a.sig,pharmacy:a.pharmacy.name,pharmacySnapshot:a.pharmacy,prescribedDate:new Date(a.sentAt),sentAt:new Date(a.sentAt),recordedAt:now(),source:'treatrx_external',launchCaseId:row.id}});return {prescription:prescriptionSentDTO(saved),created:true};
 })},
 async list(patientId:string,page=1,limit=20){const q=contracts['GET /prescriptions-sent'].request.parse({page,limit});return db.$transaction(async(tx:any)=>{await tx.$queryRaw`SELECT id FROM public.user_profiles WHERE id=${patientId}::uuid FOR SHARE`;if(!await tx.user.findUnique({where:{id:patientId}}))throw enrollmentError(404,'NOT_FOUND');return prescriptionPage(tx,patientId,q.page,q.limit)})}
}}
export const prescriptionRecords=createPrescriptionRecords({db:prisma});
