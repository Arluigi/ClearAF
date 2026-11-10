"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useClinicalAPI } from "@/lib/auth";
import { answerSeries, choiceQuestions } from "@/lib/care-support";
import { firstName } from "@/lib/workspace";
import { AnswerPlot, AssignedFormSummary, CheckInResponseView, LaunchCheckInView, SubmissionTable } from "./CheckInViews";
import { readLaunchChart } from '@/lib/care-decisions';
import { LaunchPhotoSet, LaunchReviewDialog } from '@/components/patients/CareDecisionDialog';
import FormEditor from "./FormEditor";
import { LoadState, Pages, useRead } from "./shared";

function LegacyPatientCheckIns({ patientId, patientName, onReply }: { patientId: string; patientName: string; onReply: () => void }) {
  const api = useClinicalAPI();
  const formFetch = useCallback(() => api.getPatientForm(patientId), [api, patientId]);
  const form = useRead(formFetch);
  // useRead clears data to null while a retry is in flight; onSaved's retry (below) would otherwise unmount
  // FormEditor mid-save and the "Version N saved" confirmation would never be seen. Keep the last loaded form
  // visible through that reload so the editor (and its own confirmation) stays mounted.
  const lastForm = useRef<typeof form.data>(null);
  useEffect(() => {
    if (form.data) lastForm.current = form.data;
  }, [form.data]);
  const formData = form.data ?? lastForm.current;
  const [page, setPage] = useState(1);
  const responsesFetch = useCallback(() => api.getPatientResponses(patientId, page), [api, patientId, page]);
  const responses = useRead(responsesFetch);
  const [openId, setOpenId] = useState<string | null>(null);
  const [questionId, setQuestionId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const rows = responses.data?.data ?? [];
  const shown = rows.find((row) => row.id === openId) ?? rows[0] ?? null;
  const questions = shown ? choiceQuestions(shown.form) : [];
  const plotted = questions.find((question) => question.id === questionId) ?? questions[0] ?? null;
  const name = firstName(patientName);
  return (
    <section aria-label="Patient check-ins" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0 space-y-6">
        {/* The editor stays mounted while hidden so a draft survives switching back to responses. */}
        <div hidden={!editing} className="space-y-3">
          <Button type="button" variant="link" size="sm" className="px-0" onClick={() => setEditing(false)}>Back to responses</Button>
          <LoadState {...form} loading="Loading the assigned form" />
          {formData && <FormEditor patientId={patientId} form={formData.form} onSaved={form.retry} />}
        </div>
        <div hidden={editing} className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="eyebrow">Submitted responses</p>
            <Button type="button" variant="outline" size="sm" onClick={responses.retry}>Refresh</Button>
          </div>
          <LoadState {...responses} loading="Loading check-ins" />
          {responses.data && rows.length === 0 && (
            <div className="space-y-2 py-4">
              <h3 className="editorial-title text-2xl">No check-ins yet</h3>
              <p className="text-sm text-ink-secondary">Responses appear here after {name || "the patient"} submits the assigned form.</p>
            </div>
          )}
          {shown && <CheckInResponseView response={shown} patientFirstName={name} onReply={onReply} />}
          {rows.length > 1 && <SubmissionTable responses={rows} openId={shown?.id ?? null} onOpen={setOpenId} />}
          {responses.data && responses.data.pagination.totalPages > 1 && (
            <Pages page={page} totalPages={responses.data.pagination.totalPages} onPage={(next) => { setOpenId(null); setPage(next); }} />
          )}
        </div>
      </div>
      <aside aria-label="Check-in summary" className="space-y-8">
        {plotted && <AnswerPlot question={plotted} questions={questions} series={answerSeries(rows, plotted.id)} onQuestion={setQuestionId} />}
        <AssignedFormSummary status={form.status} form={form.data?.form ?? null} editing={editing} onEdit={() => setEditing(true)} onRetry={form.retry} />
      </aside>
    </section>
  );
}

export default function PatientCheckIns(props:{patientId:string;patientName:string;onReply:()=>void;targetId?:string|null}) {
  const api=useClinicalAPI();const [page,setPage]=useState(1);const [selected,setSelected]=useState<string|null>(props.targetId??null);const [reviewing,setReviewing]=useState(false);
  const fetch=useCallback(()=>readLaunchChart(()=>api.launch().chart(props.patientId,page)),[api,props.patientId,page]);const chart=useRead(fetch);
  useEffect(()=>{setSelected(props.targetId??null);setPage(1);setReviewing(false);},[props.targetId]);
  useEffect(()=>{if(props.targetId&&selected===props.targetId&&chart.data&&!chart.data.checkIns.data.some(row=>row.id===props.targetId)&&page<chart.data.checkIns.pagination.totalPages)setPage(page+1);},[props.targetId,selected,chart.data,page]);
  if(chart.status==='ready'&&chart.data===null)return <LegacyPatientCheckIns {...props}/>;
  const rows=chart.data?.checkIns.data??[];const current=rows.find(row=>row.id===selected)??(!selected?rows[0]:null);
  return <section aria-label="Patient launch check-ins" className="space-y-4"><div className="flex flex-wrap gap-3"><h2 className="editorial-title text-2xl">Check-in reviews</h2><Button variant="outline" onClick={chart.retry}>Refresh check-ins</Button></div><LoadState {...chart} loading="Loading launch check-ins"/>
    {chart.data&&<>{!rows.length&&<p>No check-ins on this page.</p>}<ul className="flex flex-wrap gap-3">{rows.map(row=><li key={row.id}><Button variant="outline" aria-pressed={row.id===current?.id} onClick={()=>{setSelected(row.id);setReviewing(false);}}>{row.kind} · {row.status.replaceAll('_',' ')} · {row.submittedAt??row.dueAt}</Button></li>)}</ul>
      {selected&&!current&&<p role="alert">This check-in is not on this page or is unavailable. Browse prior pages or refresh the worklist.</p>}
      {current&&<LaunchCheckInView checkIn={current} photos={<LaunchPhotoSet key={current.id} patientId={props.patientId} photoSet={current.photoSet}/>} actions={<div className="flex flex-wrap gap-3"><Button variant="outline" disabled={current.status!=='submitted'} onClick={()=>setReviewing(true)}>Review check-in</Button><Button variant="outline" onClick={props.onReply}>Reply to patient</Button><LaunchReviewDialog patientId={props.patientId} enrollment={chart.data.enrollment} checkIn={current} open={reviewing} onClose={()=>setReviewing(false)} onChanged={chart.retry}/></div>}/>}
      <Pages page={page} totalPages={chart.data.checkIns.pagination.totalPages} onPage={next=>{setPage(next);setSelected(null);setReviewing(false);}}/>
    </>}
  </section>;
}
