import {Request,Response,NextFunction} from 'express';
import {isEnrolled} from '../services/enrollment';
import {prisma} from '../config/database';
import {requirePatientCareScope} from '../services/careAccess';
import {enforcementMode} from '../services/enrollmentRules';
// Read at request time so production can start with ENROLLMENT_ENFORCEMENT=off while older iOS builds remain installed.
export const enrollmentEnforced=()=>enforcementMode(process.env.ENROLLMENT_ENFORCEMENT).enforced;
export async function requireEnrolledPatient(req:Request,res:Response,next:NextFunction){
 if(req.user?.userType!=='patient')return next();
 try{
  const launch=await requirePatientCareScope(prisma,req.user.id,'clinical_write');
  if(launch.caseRow||!enrollmentEnforced())return next();
  if(await isEnrolled(req.user.id))return next();
  return res.status(403).json({error:'Enrollment required',code:'ENROLLMENT_REQUIRED'});
 }catch(error){return next(error)}
}
