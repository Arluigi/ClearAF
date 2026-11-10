import type { LaunchCatalog, LaunchChart, LaunchPage, LaunchQueueItem, LaunchSignedImage, LaunchReview, LaunchEnrollmentResponse, LaunchCheckIn, LaunchMembership, LaunchPrescriptionSent } from '../types/api';
export type LaunchReviewBody = Pick<LaunchReview,'targetType'|'targetId'|'outcome'|'patientMessage'> & {expectedRevision:number};
export type PrescriptionSentBody = Pick<LaunchPrescriptionSent,'drug'|'strength'|'sig'|'pharmacy'|'sentAt'>;
export type LaunchReviewResult = {review:LaunchReview;enrollment:LaunchEnrollmentResponse;checkIn:LaunchCheckIn|null};
type Request = <T>(path:string, options?:RequestInit)=>Promise<T>;
const id=encodeURIComponent;
const paging=(page=1)=>new URLSearchParams({page:String(page),limit:'20'});
export function createLaunchAPI(request:Request) {
  return {
    catalog:()=>request<LaunchCatalog>('/catalog'),
    chart:(patientId:string,page=1,signal?:AbortSignal)=>request<LaunchChart>(`/patients/${id(patientId)}/chart?${paging(page)}`,{signal}),
    queue:(kind?:LaunchQueueItem['kind'],page=1,signal?:AbortSignal)=>{const query=paging(page);if(kind)query.set('kind',kind);return request<LaunchPage<LaunchQueueItem>>(`/review-queue?${query}`,{signal});},
    images:(patientId:string,identityId:string,signal?:AbortSignal)=>request<{idPhoto:LaunchSignedImage;selfie:LaunchSignedImage}>(`/patients/${id(patientId)}/identity/${id(identityId)}/images`,{signal}),
    review:(patientId:string,reviewId:string,body:LaunchReviewBody)=>request<LaunchReviewResult>(`/patients/${id(patientId)}/reviews/${id(reviewId)}`,{method:'PUT',body:JSON.stringify(body)}),
    prescription:(patientId:string,recordId:string,body:PrescriptionSentBody)=>request<{prescription:LaunchPrescriptionSent}>(`/patients/${id(patientId)}/prescriptions-sent/${id(recordId)}`,{method:'PUT',body:JSON.stringify(body)}),
    billing:()=>request<{membership:LaunchMembership|null}>('/billing'),
  };
}
