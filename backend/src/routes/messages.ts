import express from 'express';
const router=express.Router();
// Preserve legacy rows; the active API uses bounded pair-authorized native messages.
router.use((_req,res)=>{res.status(410).json({error:'Legacy messaging retired',code:'MESSAGE_OPERATION_RETIRED'})});
export default router;
