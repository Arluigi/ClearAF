"use client";
import { useCallback, useState } from "react";
import { useClinicalAPI } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { useRead, LoadState, Pages } from "./shared";
import FormEditor from "./FormEditor";
function Responses({ patientId }: { patientId: string }) {
  const api = useClinicalAPI();
  const [page, setPage] = useState(1);
  const fetch = useCallback(
    () => api.getPatientResponses(patientId, page),
    [api, patientId, page],
  );
  const result = useRead(fetch);
  return (
    <div className="space-y-4">
      <h3 className="font-medium">Submitted check-ins</h3>
      <Button variant="outline" onClick={result.retry}>
        Refresh responses
      </Button>
      <LoadState {...result} />
      {result.data && (
        <>
          {!result.data.data.length && (
            <p>No submitted check-ins on this page.</p>
          )}
          {result.data.data.map((response) => (
            <article
              className="space-y-3 rounded-none border p-5"
              key={response.id}
            >
              <h4 className="font-medium">
                {response.form.title} · Version {response.form.version}
              </h4>
              <p className="text-sm text-ink-secondary">
                Submitted {new Date(response.submittedAt).toLocaleString()} ·
                Received {new Date(response.receivedAt).toLocaleString()}
              </p>
              <dl className="space-y-3">
                {response.form.questions.map((question) => {
                  const answer = response.answers.find(
                    (a) => a.questionId === question.id,
                  );
                  return (
                    <div key={question.id}>
                      <dt className="font-medium">
                        {question.prompt}
                        {question.required ? " (required)" : ""}
                      </dt>
                      <dd className="whitespace-pre-wrap break-words">
                        {answer?.text ??
                          question.options.find(
                            (o) => o.id === answer?.optionId,
                          )?.label ??
                          "Not answered"}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </article>
          ))}
          <Pages
            page={page}
            totalPages={result.data.pagination.totalPages}
            onPage={setPage}
          />
        </>
      )}
    </div>
  );
}
export default function PatientCheckIns({ patientId }: { patientId: string }) {
  const api = useClinicalAPI();
  const fetch = useCallback(
    () => api.getPatientForm(patientId),
    [api, patientId],
  );
  const result = useRead(fetch);
  return (
    <section className="space-y-6 border-t pt-6" aria-label="Patient check-ins">
      <h2 className="text-xl font-medium">Check-ins</h2>
      <LoadState {...result} />
      {result.data && (
        <FormEditor patientId={patientId} form={result.data.form} />
      )}
      <Responses patientId={patientId} />
    </section>
  );
}
