import type { LaunchCatalog, LaunchChartResponse, LaunchPage, LaunchQueueItem, LaunchSignedImage, LaunchReview, LaunchEnrollmentResponse, LaunchCheckIn, LaunchMembership, LaunchPrescriptionSent } from '../types/api';
export type LaunchReviewBody = Pick<LaunchReview,'targetType'|'targetId'|'outcome'|'patientMessage'> & {expectedRevision:number;clearHold?:{decisionNote:string};screeningDecisions?:{ibd?:{activity:'active'|'inactive';priorCDifficile:boolean;decisionNote:string};marksAcneRelated?:true;dailySunscreenConfirmed?:true;doxycyclineEsophagusOverrideNote?:string}};
export type PrescriptionSentBody = Pick<LaunchPrescriptionSent,'drug'|'strength'|'sig'|'pharmacy'|'sentAt'>;
export type LaunchReviewResult = {review:LaunchReview;enrollment:LaunchEnrollmentResponse;checkIn:LaunchCheckIn|null};
type Request = <T>(path:string, options?:RequestInit)=>Promise<T>;
const id=encodeURIComponent;
const paging=(page=1)=>new URLSearchParams({page:String(page),limit:'20'});
export function createLaunchAPI(request:Request) {
  return {
    catalog:(questionnaireVersion?:string)=>request<LaunchCatalog>('/catalog',(questionnaireVersion==='2.0-pending-review'||questionnaireVersion==='2.1-pending-review')?{headers:{'X-UNZIT-Questionnaire':questionnaireVersion}}:undefined),
    chart:(patientId:string,page=1,signal?:AbortSignal)=>request<LaunchChartResponse>(`/patients/${id(patientId)}/chart?${paging(page)}`,{signal}),
    queue:(kind?:LaunchQueueItem['kind'],page=1,signal?:AbortSignal)=>{const query=paging(page);if(kind)query.set('kind',kind);return request<LaunchPage<LaunchQueueItem>>(`/review-queue?${query}`,{signal});},
    images:(patientId:string,identityId:string,signal?:AbortSignal)=>request<{idPhoto:LaunchSignedImage;selfie:LaunchSignedImage}>(`/patients/${id(patientId)}/identity/${id(identityId)}/images`,{signal}),
    review:(patientId:string,reviewId:string,body:LaunchReviewBody)=>request<LaunchReviewResult>(`/patients/${id(patientId)}/reviews/${id(reviewId)}`,{method:'PUT',body:JSON.stringify(body)}),
    prescription:(patientId:string,recordId:string,body:PrescriptionSentBody)=>request<{prescription:LaunchPrescriptionSent}>(`/patients/${id(patientId)}/prescriptions-sent/${id(recordId)}`,{method:'PUT',body:JSON.stringify(body)}),
    billing:()=>request<{membership:LaunchMembership|null}>('/billing'),
  };
}

/** Queue counts can shrink while a clinician is on a later page. Reload the last available page. */
export async function readLaunchQueue(read:(page:number)=>Promise<LaunchPage<LaunchQueueItem>>,page:number):Promise<LaunchPage<LaunchQueueItem>> {
  const result=await read(page);
  const last=Math.max(1,result.pagination.totalPages);
  return page>last?readLaunchQueue(read,last):result;
}
