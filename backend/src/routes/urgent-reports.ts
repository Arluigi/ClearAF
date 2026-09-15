import express from 'express';
import {z,ZodError} from 'zod';
import {requirePatient,requireDermatologist} from '../middleware/auth';
import * as service from '../services/urgentReports';
import {uuid,reportInput,resolveInput,emptyBody,pageQuery} from '../services/urgentReportsValidation';
const router=express.Router();
const route=(handler:express.RequestHandler):express.RequestHandler=>async(req,res,next)=>{try{await handler(req,res,next)}catch(error){next(error instanceof ZodError||(error as {statusCode?:number}).statusCode?error:service.urgentError(500,'URGENT_REPORT_OPERATION_FAILED'))}};
const noQuery=(req:express.Request)=>z.object({}).strict().parse(req.query);
// Declared before '/:reportId' routes so the literal paths win.
router.get('/queue',requireDermatologist,route(async(req,res)=>{const {page,limit}=pageQuery.parse(req.query);res.json(await service.queue(req.user!.id,page,limit))}));
router.get('/patients/:patientId',requireDermatologist,route(async(req,res)=>{const {page,limit}=pageQuery.parse(req.query);res.json(await service.patientHistory(uuid.parse(req.params.patientId),req.user!.id,page,limit))}));
router.get('/',requirePatient,route(async(req,res)=>{const {page,limit}=pageQuery.parse(req.query);res.json(await service.mine(req.user!.id,page,limit))}));
router.put('/:reportId',requirePatient,route(async(req,res)=>{noQuery(req);const r=await service.create(req.user!.id,uuid.parse(req.params.reportId),reportInput.parse(req.body));res.status(r.created?201:200).json({report:r.report})}));
router.post('/:reportId/acknowledge',requireDermatologist,route(async(req,res)=>{noQuery(req);emptyBody.parse(req.body);res.json(await service.acknowledge(uuid.parse(req.params.reportId),req.user!.id))}));
router.post('/:reportId/resolve',requireDermatologist,route(async(req,res)=>{noQuery(req);res.json(await service.resolve(uuid.parse(req.params.reportId),req.user!.id,resolveInput.parse(req.body).resolutionNote))}));
export default router;
