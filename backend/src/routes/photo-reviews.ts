import express from 'express';
import {ZodError} from 'zod';
import {requireDermatologist} from '../middleware/auth';
import {uuid} from '../services/routineCare';
import {parsePagination} from '../services/pagination';
import {emptyReviewBody,markReviewed,reviewError,reviewQueue,reviewStatus,statusQuery} from '../services/photoReview';
const router=express.Router();
const route=(handler:express.RequestHandler):express.RequestHandler=>async(req,res,next)=>{
 try{await handler(req,res,next)}catch(error){next(error instanceof ZodError||(error as {statusCode?:number}).statusCode?error:reviewError(500,'Photo review operation failed'))}
};
router.get('/status',route(async(req,res)=>{res.json(await reviewStatus(statusQuery.parse(req.query).photoIds,req.user!))}));
router.get('/queue',requireDermatologist,route(async(req,res)=>{const{page,limit}=parsePagination(req.query,20);res.json(await reviewQueue(req.user!.id,page,limit))}));
router.put('/photos/:photoId',requireDermatologist,route(async(req,res)=>{
 emptyReviewBody.parse(req.body);const result=await markReviewed(uuid.parse(req.params.photoId),req.user!.id);res.status(result.created?201:200).json({review:result.review});
}));
export default router;
