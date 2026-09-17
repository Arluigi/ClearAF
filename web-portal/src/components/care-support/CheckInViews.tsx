"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { answerText, formSummary, type AnswerPoint, type CheckInResponse, type Form, type Question } from "@/lib/care-support";
import { cn } from "@/lib/utils";
import { day, stamp } from "@/lib/worklist";

export function CheckInResponseView({ response, patientFirstName, onReply }: { response: CheckInResponse; patientFirstName: string; onReply: () => void }) {
  return (
    <article aria-label="Check-in response" className="space-y-4">
      <header className="space-y-1 border-b-2 border-ink pb-2">
        <h3 className="text-[17px] font-medium">{response.form.title}</h3>
        <p className="meta-mono">Form v{response.form.version} · submitted {stamp(response.submittedAt)}</p>
      </header>
      <dl className="divide-y divide-rule">
        {response.form.questions.map((question, index) => {
          const text = answerText(question, response);
          const given = text !== "Not answered";
          return (
            <div key={question.id} className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-6">
              <dt className="text-sm text-ink-secondary">
                <span className="font-data text-xs tabular-nums text-ink-tertiary">{String(index + 1).padStart(2, "0")}</span> {question.prompt}
                {question.required && <span className="text-ink-tertiary"> (required)</span>}
              </dt>
              <dd className={cn("whitespace-pre-wrap break-words text-sm", given ? "font-medium" : "text-ink-secondary")}>
                {given && question.type === "text" ? `“${text}”` : text}
              </dd>
            </div>
          );
        })}
      </dl>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={onReply}>Reply to {patientFirstName || "the patient"}</Button>
        <span className="meta-mono">Received {stamp(response.receivedAt)}</span>
      </div>
    </article>
  );
}

export function SubmissionTable({ responses, openId, onOpen }: { responses: CheckInResponse[]; openId: string | null; onOpen: (id: string) => void }) {
  return (
    <section aria-label="Submissions on this page" className="space-y-2">
      <p className="eyebrow">Submissions on this page</p>
      <Table>
        <TableHeader>
          <TableRow><TableHead>Submitted</TableHead><TableHead>Form</TableHead><TableHead>First answer</TableHead><TableHead className="text-right">Response</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {responses.map((response) => {
            const shown = response.id === openId;
            const first: Question | undefined = response.form.questions[0];
            return (
              <TableRow key={response.id} data-state={shown ? "selected" : undefined}>
                <TableCell numeric>{stamp(response.submittedAt)}</TableCell>
                <TableCell>{response.form.title} · v{response.form.version}</TableCell>
                <TableCell className="max-w-[16rem] truncate text-ink-secondary">{first ? answerText(first, response) : "No questions"}</TableCell>
                <TableCell className="text-right">
                  <Button type="button" variant="link" size="sm" aria-pressed={shown} disabled={shown} onClick={() => onOpen(response.id)}>{shown ? "Showing" : "Open"}</Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
}

export function AnswerPlot({ question, questions, series, onQuestion }: { question: Question; questions: Question[]; series: AnswerPoint[]; onQuestion: (id: string) => void }) {
  return (
    <section aria-label="Answers over time" className="space-y-3 border-t border-rule pt-5">
      <p className="eyebrow">Answers over time</p>
      {questions.length > 1 ? (
        <select aria-label="Question to plot" value={question.id} onChange={(event) => onQuestion(event.target.value)} className="w-full rounded-none border-0 border-b-[1.5px] border-ink bg-transparent py-1 text-sm">
          {questions.map((q) => <option key={q.id} value={q.id}>{q.prompt}</option>)}
        </select>
      ) : (
        <p className="text-sm font-medium">{question.prompt}</p>
      )}
      {series.length === 0 ? (
        <p className="text-sm text-ink-secondary">No answers to this question on this page.</p>
      ) : (
        <>
          <div aria-hidden className="flex items-end gap-2 overflow-x-auto pb-1">
            {series.map((point) => (
              <div key={point.responseId} className="flex w-8 flex-none flex-col items-center gap-1">
                <div className="flex h-24 w-full flex-col-reverse border-b border-ink">
                  {point.options.map((option, index) => (
                    <div key={option + index} className="flex flex-1 items-center justify-center">
                      {point.index === index && <span className="block h-2.5 w-2.5 rounded-full bg-ink" />}
                    </div>
                  ))}
                </div>
                <span className="font-data text-[11px] tabular-nums text-ink-tertiary">{day(point.submittedAt)}</span>
              </div>
            ))}
          </div>
          <table className="w-full text-sm">
            <caption className="sr-only">Answers as given, oldest first</caption>
            <tbody>
              {series.map((point) => (
                <tr key={point.responseId} className="border-b border-rule last:border-0">
                  <td className="py-1 pr-2 font-data text-xs tabular-nums">{day(point.submittedAt)}</td>
                  <td className="py-1">{point.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-ink-secondary">Each answer is plotted as given, oldest first, with the first option at the bottom. Not a computed score.</p>
        </>
      )}
    </section>
  );
}

export function AssignedFormSummary({ status, form, editing, onEdit, onRetry }: { status: "loading" | "ready" | "error"; form: Form | null; editing: boolean; onEdit: () => void; onRetry: () => void }) {
  return (
    <section aria-label="Assigned form" className="space-y-2 border-t border-rule pt-5">
      <p className="eyebrow">Assigned form</p>
      {status === "loading" && <p role="status" className="text-sm text-ink-secondary">Loading the assigned form</p>}
      {status === "error" && (
        <div role="alert" className="space-y-2">
          <p className="text-sm">The assigned form could not be loaded.</p>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>Retry</Button>
        </div>
      )}
      {status === "ready" && (form ? (
        <>
          <p className="flex items-baseline gap-2 text-[15px] font-medium">{form.title}<span className="meta-mono">V{form.version}</span>{!form.isActive && <span className="text-xs font-normal text-ink-secondary">archived</span>}</p>
          <p className="text-sm text-ink-secondary">{formSummary(form)}</p>
        </>
      ) : (
        <p className="text-sm text-ink-secondary">No check-in form assigned.</p>
      ))}
      {status === "ready" && !editing && <Button type="button" variant="outline" size="sm" onClick={onEdit}>{form ? "Edit form" : "Write a form"}</Button>}
    </section>
  );
}
