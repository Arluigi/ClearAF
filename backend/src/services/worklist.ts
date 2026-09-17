import {Prisma} from '@prisma/client';
import {prisma} from '../config/database';
import {ADHERENCE_UNDER,WINDOW_DAYS,adherence,routineState,underThreshold,windowDates,type Adherence} from './worklistAdherence';
import type {WorklistQuery} from './worklistValidation';

export const CHECK_IN_WINDOW_DAYS=7;
export const worklistError=(statusCode:number,code:string)=>Object.assign(new Error(code),{statusCode,code});
const iso=(date:Date|null|undefined)=>date?date.toISOString():null;
const earliest=(dates:(Date|null)[])=>dates.filter((d):d is Date=>d!==null).sort((a,b)=>a.getTime()-b.getTime())[0]??null;

/**
 * Read-only clinician worklist. Every read filters by the patient's current assignment, inside one
 * RepeatableRead snapshot so counts and rows agree. Never returns message bodies, answers or report text.
 */
export async function worklist(clinicianId:string,query:WorklistQuery,now=new Date()){
 const assigned={dermatologistId:clinicianId};
 const name=query.search?{name:{contains:query.search,mode:'insensitive' as const}}:{};
 const unread={clinicianId,recipientId:clinicianId,recipientType:'dermatologist',readAt:null,patient:assigned};
 const dates=windowDates(query.localDate);
 const inWindow={gte:dates[0],lte:query.localDate};
 const since=new Date(now.getTime()-CHECK_IN_WINDOW_DAYS*86_400_000);
 const skip=(query.page-1)*query.limit,take=query.limit;
 return prisma.$transaction(async tx=>{
  // Summary across all currently assigned patients.
  const assignedPatients=await tx.user.count({where:assigned});
  const photos=await tx.skinPhoto.aggregate({where:{review:{is:null},user:assigned},_count:{_all:true},_min:{createdAt:true}});
  const unreadByPatient=await tx.assignedMessage.groupBy({by:['patientId'],where:unread,_count:{_all:true}});
  const checkIns=await tx.careFormResponse.count({where:{user:assigned,receivedAt:{gte:since}}});
  const revisions=await tx.careRoutineRevision.findMany({where:{user:assigned},select:{userId:true,timeOfDay:true,version:true,isActive:true,createdAt:true}});
  const daily=await tx.careRoutineCompletion.groupBy({by:['userId','localDate'],where:{user:assigned,localDate:inWindow},_count:{_all:true}});
  const routines=routineState(revisions);
  const adherenceFor=(userId:string,slots:Map<string,number>):Adherence|null=>
   routines.active.has(userId)?adherence(query.localDate,routines.first.get(userId)!,slots):null;
  const recordedDays=new Map<string,Map<string,number>>();
  for(const row of daily){const days=recordedDays.get(row.userId)??new Map<string,number>();days.set(row.localDate,row._count._all);recordedDays.set(row.userId,days)}
  let adherenceUnder=0;
  for(const userId of routines.active)if(underThreshold(adherenceFor(userId,recordedDays.get(userId)??new Map())))adherenceUnder++;

  // One page of patient ids in the filter's order.
  let ids:string[],total:number;
  if(query.filter==='needs-review'){
   // Same order as the photo review queue: oldest unreviewed upload first, then patient id.
   const groups=await tx.skinPhoto.groupBy({by:['userId'],where:{review:{is:null},user:{...assigned,...name}},_min:{createdAt:true},orderBy:[{_min:{createdAt:'asc'}},{userId:'asc'}],skip,take});
   ids=groups.map(group=>group.userId);
   total=await tx.user.count({where:{...assigned,...name,skinPhotos:{some:{review:{is:null}}}}});
  }else if(query.filter==='flagged'){
   // Open and seen reports stay flagged until resolved; oldest unresolved report first.
   const groups=await tx.urgentReport.groupBy({by:['patientId'],where:{status:{not:'resolved'},patient:{...assigned,...name}},_min:{createdAt:true},orderBy:[{_min:{createdAt:'asc'}},{patientId:'asc'}],skip,take});
   ids=groups.map(group=>group.patientId);
   total=await tx.user.count({where:{...assigned,...name,urgentReports:{some:{status:{not:'resolved'}}}}});
  }else{
   // Same order as GET /users.
   ids=(await tx.user.findMany({where:{...assigned,...name},orderBy:[{updatedAt:'desc'},{id:'desc'}],skip,take,select:{id:true}})).map(user=>user.id);
   total=await tx.user.count({where:{...assigned,...name}});
  }

  // Page enrichment: one grouped read per concern, never per patient.
  const onPage={in:ids};
  const users=ids.length?await tx.user.findMany({where:{...assigned,id:onPage},select:{id:true,name:true,joinDate:true}}):[];
  const pagePhotos=ids.length?await tx.skinPhoto.groupBy({by:['userId'],where:{userId:onPage,review:{is:null},user:assigned},_count:{_all:true},_min:{createdAt:true}}):[];
  const pageCheckIns=ids.length?await tx.careFormResponse.groupBy({by:['userId'],where:{userId:onPage,user:assigned},_max:{receivedAt:true}}):[];
  const pageUrgent=ids.length?await tx.urgentReport.groupBy({by:['patientId','status'],where:{patientId:onPage,status:{not:'resolved'},patient:assigned},_count:{_all:true},_min:{createdAt:true}}):[];
  const pageCompletions=ids.length?await tx.careRoutineCompletion.findMany({where:{userId:onPage,user:assigned,localDate:inWindow},select:{userId:true,localDate:true,routine:{select:{timeOfDay:true}}}}):[];

  const slots=new Map<string,Map<string,Set<string>>>();
  for(const row of pageCompletions){
   const days=slots.get(row.userId)??new Map<string,Set<string>>();
   const done=days.get(row.localDate)??new Set<string>();
   done.add(row.routine.timeOfDay);days.set(row.localDate,done);slots.set(row.userId,days);
  }
  const byId=new Map(users.map(user=>[user.id,user]));
  const data=ids.filter(id=>byId.has(id)).map(id=>{
   const user=byId.get(id)!;
   const photo=pagePhotos.find(row=>row.userId===id);
   const urgent=pageUrgent.filter(row=>row.patientId===id);
   const daySlots=new Map([...(slots.get(id)??new Map<string,Set<string>>()).entries()].map(([date,done])=>[date,done.size] as [string,number]));
   return {
    patientId:id,
    name:user.name,
    joinedAt:user.joinDate.toISOString(),
    photos:{unreviewedCount:photo?._count._all??0,oldestUploadAt:iso(photo?._min.createdAt)},
    unreadMessages:unreadByPatient.find(row=>row.patientId===id)?._count._all??0,
    latestCheckInAt:iso(pageCheckIns.find(row=>row.userId===id)?._max.receivedAt),
    urgent:{
     open:urgent.find(row=>row.status==='open')?._count._all??0,
     acknowledged:urgent.find(row=>row.status==='acknowledged')?._count._all??0,
     oldestAt:iso(earliest(urgent.map(row=>row._min.createdAt))),
    },
    adherence:adherenceFor(id,daySlots),
   };
  });
  return {
   filter:query.filter,
   localDate:query.localDate,
   summary:{
    assignedPatients,
    photosToReview:{count:photos._count._all,oldestUploadAt:iso(photos._min.createdAt)},
    unreadMessages:{count:unreadByPatient.reduce((sum,row)=>sum+row._count._all,0),patients:unreadByPatient.length},
    checkInsSubmitted:{count:checkIns,since:since.toISOString(),days:CHECK_IN_WINDOW_DAYS},
    adherenceUnderThreshold:{count:adherenceUnder,threshold:ADHERENCE_UNDER,windowDays:WINDOW_DAYS},
   },
   data,
   pagination:{page:query.page,limit:query.limit,total,totalPages:Math.ceil(total/query.limit)},
  };
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
}
