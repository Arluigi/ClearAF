"use client";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { useClinicalAPI } from "@/lib/auth";
import { answerSeries, choiceQuestions } from "@/lib/care-support";
import { firstName } from "@/lib/workspace";
import { AnswerPlot, AssignedFormSummary, CheckInResponseView, SubmissionTable } from "./CheckInViews";
import FormEditor from "./FormEditor";
import { LoadState, Pages, useRead } from "./shared";

export default function PatientCheckIns({ patientId, patientName, onReply }: { patientId: string; patientName: string; onReply: () => void }) {
  const api = useClinicalAPI();
  const formFetch = useCallback(() => api.getPatientForm(patientId), [api, patientId]);
  const form = useRead(formFetch);
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
          {form.data && <FormEditor patientId={patientId} form={form.data.form} onSaved={form.retry} />}
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
