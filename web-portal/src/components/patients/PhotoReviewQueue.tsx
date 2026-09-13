'use client';
import { useEffect, useState } from 'react';
import { useClinicalAPI } from '@/lib/auth';
import { sessionBoundary } from '@/lib/api';
import { Button } from '@/components/ui/button';
import type { ReviewQueueItem } from '@/lib/photo-review';
import type { PaginatedResponse } from '@/types/api';
export default function PhotoReviewQueue({ context }: { context: string }) {
 const api=useClinicalAPI();
 const [page,setPage]=useState(1);
 const [revision,setRevision]=useState(0);
 const [result,setResult]=useState<PaginatedResponse<ReviewQueueItem>|null>(null);
 const [error,setError]=useState(false);
 useEffect(()=>{let active=true;setResult(null);setError(false);void api.getPhotoReviewQueue(page).then(value=>{if(active)setResult(value);}).catch(()=>{if(active)setError(true);});const unsubscribe=sessionBoundary.subscribe(()=>{active=false;setResult(null);setError(false);});return()=>{active=false;unsubscribe();};},[api,page,revision]);
 return <section aria-label="Photo review queue" className="space-y-4"><div><h2 className="text-lg font-semibold">Photos awaiting review</h2><p className="text-sm text-muted-foreground">All assigned patients with unreviewed uploads, oldest upload first.</p></div><Button variant="outline" size="sm" onClick={()=>setRevision(value=>value+1)}>Refresh review queue</Button>
 {error ? <div role="alert"><p>Review queue unavailable.</p><Button variant="outline" onClick={()=>setRevision(value=>value+1)}>Retry review queue</Button></div> : !result ? <p role="status">Loading review queue…</p> : <>{result.data.length===0 ? <p>No photos awaiting review on this page.</p> : <ul className="divide-y rounded-xl bg-card">{result.data.map(item=><li key={item.patientId} className="p-4 flex flex-wrap justify-between items-center gap-3"><div><p className="font-medium">{item.name || 'Unnamed patient'}</p><p className="text-sm">{item.unreviewedCount} unreviewed · Oldest upload: {new Date(item.oldestUploadAt).toLocaleString()}</p><p className="text-sm text-muted-foreground">Latest upload: {new Date(item.latestUploadAt).toLocaleString()}</p></div><Button variant="outline" asChild><a href={`/patients/${encodeURIComponent(item.patientId)}?${context}`} aria-label={`Review photos for ${item.name || 'patient'}`}>Review photos</a></Button></li>)}</ul>}<nav aria-label="Review queue pages" className="flex flex-wrap justify-between items-center gap-3"><Button variant="outline" disabled={page<=1} onClick={()=>setPage(page-1)}>Previous queue page</Button><p className="text-sm" role="status">Page {result.pagination.page} of {Math.max(1,result.pagination.totalPages)} · {result.pagination.total} patients</p><Button variant="outline" disabled={page>=result.pagination.totalPages} onClick={()=>setPage(page+1)}>Next queue page</Button></nav></>}
 </section>;
}
