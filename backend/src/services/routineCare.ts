import { z } from 'zod';
import { isDeepStrictEqual } from 'node:util';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';

export const uuid = z.string().uuid().transform(value => value.toLowerCase());
export const slot = z.enum(['morning', 'evening']);
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export const localDate = z.string().refine(validDate, 'Invalid local date');
export const revisionInput = z.object({
  expectedRevisionId: uuid.nullable(),
  name: z.string().trim().min(1).max(120),
  isActive: z.boolean(),
  steps: z.array(z.object({ title: z.string().trim().min(1).max(120), instructions: z.string().max(2000) }).strict()).max(20)
}).strict().refine(value => !value.isActive || value.steps.length > 0, 'Active routine requires steps');
const timestamp = z.string().max(40).datetime({ offset: true }).refine(value => {
  const offset = value.match(/[+-](\d{2}):(\d{2})$/);
  return validDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value))
    && (!offset || (Number(offset[1]) <= 23 && Number(offset[2]) <= 59));
}, 'Invalid completion timestamp');
export const completionInput = z.object({
  revisionId: uuid, completedAt: timestamp, localDate,
  timeZone: z.string().min(1).max(100).refine(zone => {
    if (/^[+-]/.test(zone)) return false;
    try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); return true; } catch { return false; }
  }, 'Invalid IANA timezone')
}).strict().superRefine((value, context) => {
  const instant = new Date(value.completedAt);
  if (!Number.isFinite(instant.getTime())) return;
  if (instant.getTime() > Date.now() + 5 * 60 * 1000) context.addIssue({code:'custom', path:['completedAt'], message:'Completion is too far in the future'});
  try {
    const parts = new Intl.DateTimeFormat('en-US', {timeZone:value.timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(instant);
    const part = (type: string) => parts.find(p => p.type === type)?.value;
    if (`${part('year')}-${part('month')}-${part('day')}` !== value.localDate) context.addIssue({code:'custom',path:['localDate'],message:'Date does not match completion timezone'});
  } catch { /* The timezone field reports the validation error. */ }
});
export function careError(statusCode: number, message: string) {
  return Object.assign(new Error(message), {statusCode, code: statusCode === 404 ? 'NOT_FOUND' : statusCode === 409 ? 'ROUTINE_CONFLICT' : 'ROUTINE_ERROR'});
}
type DB = Prisma.TransactionClient;
async function authorize(db: DB, patientId: string, clinicianId: string) {
  const patient = await db.user.findUnique({where:{id:patientId},select:{dermatologistId:true}});
  if (!patient || patient.dermatologistId !== clinicianId) throw careError(404, 'Patient not found');
}
async function lock(db: DB, patientId: string) {
  await db.$queryRaw`SELECT id FROM public.user_profiles WHERE id = ${patientId}::uuid FOR UPDATE`;
}
export async function saveRevision(patientId: string, clinicianId: string, timeOfDay: 'morning'|'evening', id: string, input: z.infer<typeof revisionInput>) {
  const save = () => prisma.$transaction(async tx => {
    await lock(tx, patientId);
    await authorize(tx, patientId, clinicianId);
    const existing = await tx.careRoutineRevision.findUnique({where:{id}});
    if (existing) {
      const prior = existing.version > 1 ? await tx.careRoutineRevision.findFirst({where:{userId:patientId,timeOfDay,version:existing.version - 1}}) : null;
      if (existing.userId !== patientId || existing.timeOfDay !== timeOfDay || existing.createdBy !== clinicianId
        || existing.name !== input.name || existing.isActive !== input.isActive
        || !isDeepStrictEqual(existing.steps, input.steps) || (prior?.id ?? null) !== input.expectedRevisionId) throw careError(409, 'Revision identity conflicts with saved content');
      return {routine:existing, created:false};
    }
    const latest = await tx.careRoutineRevision.findFirst({where:{userId:patientId,timeOfDay},orderBy:{version:'desc'}});
    if ((latest?.id ?? null) !== input.expectedRevisionId) throw careError(409, 'Routine changed; reload before editing');
    const routine = await tx.careRoutineRevision.create({data:{id,userId:patientId,timeOfDay,version:(latest?.version ?? 0)+1,createdBy:clinicianId,name:input.name,isActive:input.isActive,steps:input.steps}});
    return {routine,created:true};
  });
  try { return await save(); } catch (error) {
    // A global client ID can race across different patient locks.
    if ((error as {code?:string}).code !== 'P2002') throw error;
    return save();
  }
}
export async function saveCompletion(userId: string, id: string, input: z.infer<typeof completionInput>) {
  const routine = await prisma.careRoutineRevision.findUnique({where:{id:input.revisionId}});
  if (!routine || routine.userId !== userId) throw careError(404, 'Routine not found');
  if (!routine.isActive) throw careError(400, 'Inactive revisions cannot be completed');
  const completedAt = new Date(input.completedAt);
  const existingResult = async () => {
    const existing = await prisma.careRoutineCompletion.findUnique({where:{id}});
    if (existing) {
      if (existing.userId !== userId) throw careError(404, 'Completion not found');
      if (existing.revisionId !== input.revisionId || existing.localDate !== input.localDate
        || existing.timeZone !== input.timeZone || existing.completedAt.getTime() !== completedAt.getTime()) throw careError(409, 'Completion identity conflicts with saved content');
      return existing;
    }
    return prisma.careRoutineCompletion.findUnique({where:{userId_revisionId_localDate:{userId,revisionId:input.revisionId,localDate:input.localDate}}});
  };
  const existing = await existingResult();
  if (existing) return {completion:existing,created:false};
  try {
    const completion = await prisma.careRoutineCompletion.create({data:{id,userId,revisionId:input.revisionId,completedAt,localDate:input.localDate,timeZone:input.timeZone}});
    return {completion,created:true};
  } catch (error) {
    if ((error as {code?:string}).code !== 'P2002') throw error;
    const winner = await existingResult();
    if (!winner) throw error;
    return {completion:winner,created:false};
  }
}
export async function snapshot(userId: string, date: string, clinicianId?: string) {
  return prisma.$transaction(async tx => {
    if (clinicianId) { await lock(tx,userId); await authorize(tx,userId,clinicianId); }
    const routines = (await Promise.all(['morning','evening'].map(timeOfDay => tx.careRoutineRevision.findFirst({where:{userId,timeOfDay},orderBy:{version:'desc'}})))).filter(Boolean);
    const completions = await tx.careRoutineCompletion.findMany({where:{userId,localDate:date},orderBy:[{receivedAt:'desc'},{id:'desc'}]});
    return {routines,completions};
  });
}
export async function history(userId: string, clinicianId: string, page: number, limit: number) {
  return prisma.$transaction(async tx => {
    await lock(tx,userId); await authorize(tx,userId,clinicianId);
    const where = {userId};
    const total = await tx.careRoutineCompletion.count({where});
    const data = await tx.careRoutineCompletion.findMany({where,include:{routine:true},orderBy:[{receivedAt:'desc'},{id:'desc'}],skip:(page-1)*limit,take:limit});
    return {data,pagination:{page,limit,total,totalPages:Math.ceil(total/limit)}};
  });
}
