export type PhotoReview = { photoId: string; reviewerName: string; reviewedAt: string };
export type ReviewQueueItem = { patientId: string; name: string; unreviewedCount: number; oldestUploadAt: string; latestUploadAt: string };
type State = { ids: string[]; selected: string[]; comparing: boolean; originals: Record<string, {url?:string; error?:boolean}>; reviews: Record<string, PhotoReview>; status: 'loading'|'ready'|'error'; pending: Record<string,boolean>; errors: Record<string,boolean> };
const initial = (): State => ({ ids:[], selected:[], comparing:false, originals:{}, reviews:{}, status:'loading', pending:{}, errors:{} });
export class PhotoReviewController {
 private state = initial();
 private generation = 0;
 private comparison = 0;
 private abort?: AbortController;
 private listeners = new Set<()=>void>();
 constructor(private fetchStatus:(ids:string[])=>Promise<{reviews:PhotoReview[]}>, private writeReview:(id:string)=>Promise<{review:PhotoReview}>, private fetchOriginal:(id:string,signal:AbortSignal)=>Promise<{photoUrl:string}>) {}
 snapshot=()=>this.state;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};};
 private publish(change:Partial<State>) { this.state={...this.state,...change};this.listeners.forEach(listener=>listener()); }
 reset() { this.generation++; this.comparison++; this.abort?.abort(); this.state=initial(); this.listeners.forEach(listener=>listener()); }
 /** Loads review status for one page. `preselect` seeds the comparison with at most two ids that are on this page. */
 async load(ids:string[], preselect:string[]=[]) { this.reset(); const generation=this.generation; this.publish({ids,selected:preselect.filter(id=>ids.includes(id)).slice(0,2)}); if(!ids.length){this.publish({status:'ready'});return;}
 try { const result=await this.fetchStatus(ids); if(generation===this.generation) this.publish({status:'ready',reviews:Object.fromEntries(result.reviews.map(review=>[review.photoId,review]))}); }
 catch {if(generation===this.generation)this.publish({status:'error'});}
 }
 /** At most two photos. Changing the selection ends the running comparison so the view reloads originals. */
 toggle(id:string) { if(!this.state.ids.includes(id))return; const selected=this.state.selected.includes(id)?this.state.selected.filter(value=>value!==id):this.state.selected.length<2?[...this.state.selected,id]:this.state.selected; if(selected===this.state.selected)return; if(this.state.comparing)this.close(); this.publish({selected}); }
 close() {this.comparison++;this.abort?.abort();this.publish({comparing:false, originals:{}});}
 /** Loads signed originals for the one or two selected photos. */
 async compare() { if(!this.state.selected.length)return; this.abort?.abort();const abort=new AbortController();this.abort=abort;const request=++this.comparison;const generation=this.generation;this.publish({comparing:true,originals:{}});
 await Promise.all(this.state.selected.map(async id=>{try {const result=await this.fetchOriginal(id,abort.signal);if(request===this.comparison&&generation===this.generation)this.publish({originals:{...this.state.originals,[id]:{url:result.photoUrl}}});}catch {if(request===this.comparison&&generation===this.generation)this.publish({originals:{...this.state.originals,[id]:{error:true}}});}}));
 }
 async mark(id:string) {if(this.state.status!=='ready'||!this.state.ids.includes(id)||this.state.pending[id]||this.state.reviews[id])return;const generation=this.generation;const errors={...this.state.errors};delete errors[id];this.publish({pending:{...this.state.pending,[id]:true},errors});
 try {const {review}=await this.writeReview(id);if(generation===this.generation)this.publish({reviews:{...this.state.reviews,[id]:review}});}catch {if(generation===this.generation)this.publish({errors:{...this.state.errors,[id]:true}});}finally {if(generation===this.generation)this.publish({pending:{...this.state.pending,[id]:false}});}
 }
}
