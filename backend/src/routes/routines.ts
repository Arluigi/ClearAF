import express from 'express';
import { z, ZodError } from 'zod';
import { requirePatient, requireDermatologist } from '../middleware/auth';
import { requireEnrolledPatient } from '../middleware/enrollmentGate';
import { careError, completionInput, history, localDate, revisionInput, saveCompletion, saveRevision, slot, snapshot, uuid } from '../services/routineCare';
const router = express.Router();
// Keep provider details and development stacks out of this clinical API.
const route = (handler: express.RequestHandler): express.RequestHandler => async (req,res,next) => {
  try { await handler(req,res,next); } catch (error) {
    next(error instanceof ZodError || (error as {statusCode?:number}).statusCode ? error : careError(500,'Routine operation failed'));
  }
};
const dateQuery = z.object({localDate:localDate.optional()}).strict();
const requestedDate = (query: unknown) => dateQuery.parse(query).localDate ?? new Date().toISOString().slice(0,10);
const pagination = z.object({page:z.coerce.number().int().min(1).max(1000000).default(1),limit:z.coerce.number().int().min(1).max(50).default(20)}).strict();
router.get('/',requirePatient,route(async(req,res)=>{res.json(await snapshot(req.user!.id,requestedDate(req.query)))}));
router.get('/patients/:patientId',requireDermatologist,route(async(req,res)=>{res.json(await snapshot(uuid.parse(req.params.patientId),requestedDate(req.query),req.user!.id))}));
router.get('/patients/:patientId/completions',requireDermatologist,route(async(req,res)=>{const {page,limit}=pagination.parse(req.query);res.json(await history(uuid.parse(req.params.patientId),req.user!.id,page,limit))}));
router.put('/patients/:patientId/:timeOfDay/revisions/:revisionId',requireDermatologist,route(async(req,res)=>{
  const result=await saveRevision(uuid.parse(req.params.patientId),req.user!.id,slot.parse(req.params.timeOfDay),uuid.parse(req.params.revisionId),revisionInput.parse(req.body));
  res.status(result.created?201:200).json({routine:result.routine});
}));
router.put('/completions/:completionId',requirePatient,requireEnrolledPatient,route(async(req,res)=>{
  const result=await saveCompletion(req.user!.id,uuid.parse(req.params.completionId),completionInput.parse(req.body));
  res.status(result.created?201:200).json({completion:result.completion});
}));
const forbidden:express.RequestHandler=(_req,res)=>{res.status(403).json({error:'Routine definitions require clinician assignment',code:'INSUFFICIENT_PERMISSIONS'})};
const gone:express.RequestHandler=(_req,res)=>{res.status(410).json({error:'Legacy routine operation retired',code:'ROUTINE_OPERATION_RETIRED'})};
router.post('/',forbidden);router.patch('/:id',forbidden);router.delete('/:id',forbidden);
router.get('/:id',gone);router.post('/reset-daily',gone);router.post('/:routineId/steps/:stepId/complete',gone);
export default router;
