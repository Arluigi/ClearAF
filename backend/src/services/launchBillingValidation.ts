import {z} from 'zod';
import {contracts} from '../contracts/unzitLaunch';
export const checkoutInput=contracts['POST /billing/checkout'].request;
export const portalInput=contracts['POST /billing/portal'].request;
export const fakeResolutionInput=z.object({outcome:z.enum(['succeed','decline','requires_action'])}).strict();
export const providerEventInput=z.object({id:z.string().min(1).max(255),type:z.string().min(1).max(100),objectId:z.string().min(1).max(255),createdAt:z.string().datetime()}).strict();
