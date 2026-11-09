import express from 'express';
import {z} from 'zod';
import {requirePatient} from '../middleware/auth';
import {runtimeLaunchBilling,safeBillingError} from '../services/launchBilling';
import {isLoopbackPeer} from '../services/billingProvider';
import {fakeResolutionInput} from '../services/launchBillingValidation';
import {enrollmentError} from '../services/enrollment';
const router=express.Router();
const endpoint=(fn:express.RequestHandler):express.RequestHandler=>async(req,res,next)=>{try{res.set('Cache-Control','no-store');res.set('Referrer-Policy','no-referrer');z.object({}).strict().parse(req.query);await fn(req,res,next)}catch(error){next(error instanceof z.ZodError?error:safeBillingError(error))}};
router.get('/billing',requirePatient,endpoint(async(req,res)=>{res.json(await runtimeLaunchBilling().get(req.user!.id))}));
router.post('/billing/checkout',requirePatient,endpoint(async(req,res)=>{res.json(await runtimeLaunchBilling().checkout(req.user!.id,req.body))}));
router.post('/billing/portal',requirePatient,endpoint(async(req,res)=>{res.json(await runtimeLaunchBilling().portal(req.user!.id,req.body))}));
// This endpoint is mounted only for explicitly configured fake billing. Socket identity is not proxy-controlled.
if(process.env.BILLING_PROVIDER==='fake'&&['test','development'].includes(process.env.NODE_ENV??''))router.post('/billing/fake/operations/:operationId/resolve',requirePatient,endpoint(async(req,res)=>{
 if(!isLoopbackPeer(req.socket.remoteAddress))throw enrollmentError(403,'INSUFFICIENT_PERMISSIONS');
 const body=fakeResolutionInput.parse(req.body);
 res.json(await runtimeLaunchBilling().resolveFake(req.user!.id,req.user!.email,req.params.operationId,body.outcome));
}));
export const launchBillingWebhook:express.RequestHandler=async(req,res,next)=>{try{res.set('Cache-Control','no-store');res.set('Referrer-Policy','no-referrer');const signature=req.header('Stripe-Signature');if(!signature||!Buffer.isBuffer(req.body))throw enrollmentError(400,'VALIDATION_ERROR');res.json(await runtimeLaunchBilling().webhook(req.body,signature))}catch(error){next(safeBillingError(error))}};
export const launchBillingReturn:express.RequestHandler=(_req,res)=>{res.set('Cache-Control','no-store');res.set('Referrer-Policy','no-referrer');res.type('html').send('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UNZIT</title><p>Return to UNZIT</p><p>Refresh your membership status in the app.</p></html>')};
export default router;
