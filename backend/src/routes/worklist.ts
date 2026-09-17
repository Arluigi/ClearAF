import express from 'express';
import {ZodError} from 'zod';
import {requireDermatologist} from '../middleware/auth';
import {worklist,worklistError} from '../services/worklist';
import {worklistQuery} from '../services/worklistValidation';
const router=express.Router();
const route=(handler:express.RequestHandler):express.RequestHandler=>async(req,res,next)=>{try{await handler(req,res,next)}catch(error){next(error instanceof ZodError||(error as {statusCode?:number}).statusCode?error:worklistError(500,'WORKLIST_OPERATION_FAILED'))}};
// Read-only: counts plus one merged table of currently assigned patients.
router.get('/',requireDermatologist,route(async(req,res)=>{res.json(await worklist(req.user!.id,worklistQuery.parse(req.query)))}));
export default router;
