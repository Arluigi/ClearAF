// Worklist adherence (spec §4.6, clinician side). Pure: computed only from recorded completion events.
export const WINDOW_DAYS=14;
export const ADHERENCE_UNDER=60;
const DAY=86_400_000;
export type DayState=0|1|2|null;
export type Adherence={percent:number|null;completedDays:number;countedDays:number;days:{localDate:string;routines:DayState}[]};
export type RevisionRow={userId:string;timeOfDay:string;version:number;isActive:boolean;createdAt:Date};

/** The 14 patient-local dates ending on `localDate`, oldest first. */
export function windowDates(localDate:string):string[]{
 const end=Date.parse(`${localDate}T00:00:00.000Z`);
 return Array.from({length:WINDOW_DAYS},(_,i)=>new Date(end-(WINDOW_DAYS-1-i)*DAY).toISOString().slice(0,10));
}

/**
 * `slots` maps localDate → routines completed that day (only > 0 matters for the percentage; the strip clamps to 2).
 * A day counts when a completion was recorded on it, or when it is after the UTC date of the first routine save and
 * before `localDate` (today is not over). Uncounted days are null and never count against the patient.
 */
export function adherence(localDate:string,firstRoutineAt:Date,slots:ReadonlyMap<string,number>):Adherence{
 const saved=Date.UTC(firstRoutineAt.getUTCFullYear(),firstRoutineAt.getUTCMonth(),firstRoutineAt.getUTCDate());
 const countsFrom=new Date(saved+DAY).toISOString().slice(0,10);
 const days=windowDates(localDate).map(date=>{
  const done=Math.min(Math.max(slots.get(date)??0,0),2) as 0|1|2;
  const counted=done>0||(date>=countsFrom&&date<localDate);
  return {localDate:date,routines:counted?done:null};
 });
 const countedDays=days.filter(d=>d.routines!==null).length;
 const completedDays=days.filter(d=>(d.routines??0)>0).length;
 return {percent:countedDays?Math.round(100*completedDays/countedDays):null,completedDays,countedDays,days};
}

export const underThreshold=(value:Adherence|null)=>value!==null&&value.percent!==null&&value.percent<ADHERENCE_UNDER;

/** First routine save per patient, and patients whose latest revision in some slot is active. */
export function routineState(revisions:RevisionRow[]){
 const first=new Map<string,Date>(),latest=new Map<string,RevisionRow>();
 for(const row of revisions){
  const earliest=first.get(row.userId);
  if(!earliest||row.createdAt<earliest)first.set(row.userId,row.createdAt);
  const key=`${row.userId}:${row.timeOfDay}`,current=latest.get(key);
  if(!current||row.version>current.version)latest.set(key,row);
 }
 const active=new Set([...latest.values()].filter(row=>row.isActive).map(row=>row.userId));
 return {first,active};
}
