"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useClinicalAPI } from "@/lib/auth";
import { RevisionEditor, type Form, type FormDraft } from "@/lib/care-support";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SaveState, useUnsaved } from "./shared";
import QuestionFields from "./QuestionFields";
export default function FormEditor({
  patientId,
  form,
}: {
  patientId: string;
  form: Form | null;
}) {
  const api = useClinicalAPI();
  const [error, setError] = useState("");
  const editor = useMemo(
    () =>
      new RevisionEditor<FormDraft>(
        form
          ? {
              title: form.title,
              isActive: form.isActive,
              questions: form.questions,
            }
          : { title: "", isActive: true, questions: [] },
        (id, body) => api.savePatientForm(patientId, id, body),
        undefined,
        form?.id ?? null,
      ),
    [api, patientId, form],
  );
  const state = useSyncExternalStore(
    editor.subscribe,
    editor.snapshot,
    editor.snapshot,
  );
  useEffect(() => () => editor.cancel(), [editor]);
  useUnsaved(state.dirty || state.pending);
  const draft = state.draft;
  const edit = (change: Partial<FormDraft>) =>
    editor.edit({ ...draft, ...change });
  return (
    <form
      className="space-y-4 rounded-none border bg-surface p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        if (
          !draft.title.trim() ||
          (draft.isActive && !draft.questions.length) ||
          draft.questions.some(
            (q) => !q.prompt.trim() || q.options.some((o) => !o.label.trim()),
          )
        ) {
          setError(
            "Enter a title and complete all question fields. An active form needs at least one question.",
          );
          return;
        }
        void editor.save();
      }}
    >
      <h3 className="text-lg font-medium">
        Check-in form{" "}
        {(state.savedVersion ?? form?.version)
          ? `· Version ${state.savedVersion ?? form?.version}`
          : "· Not assigned"}
      </h3>
      <p className="text-sm text-ink-secondary">
        Write your own questions. Saving creates a new form version; earlier
        responses keep their original questions.
      </p>
      <fieldset disabled={state.pending} className="space-y-4">
        <label className="block">
          Form title
          <Input
            required
            maxLength={120}
            value={draft.title}
            onChange={(e) => edit({ title: e.target.value })}
          />
        </label>
        <label className="flex gap-2">
          <input
            type="checkbox"
            checked={draft.isActive}
            onChange={(e) => edit({ isActive: e.target.checked })}
          />
          Active form (clear and save to archive)
        </label>
        {draft.questions.map((question, index) => (
          <QuestionFields
            key={question.id}
            question={question}
            index={index}
            count={draft.questions.length}
            onChange={(q) =>
              edit({
                questions: draft.questions.map((item) =>
                  item.id === q.id ? q : item,
                ),
              })
            }
            onRemove={() =>
              edit({
                questions: draft.questions.filter((q) => q.id !== question.id),
              })
            }
            onMove={(to) => {
              const questions = [...draft.questions];
              [questions[index], questions[to]] = [
                questions[to],
                questions[index],
              ];
              edit({ questions });
            }}
          />
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={draft.questions.length >= 10}
          onClick={() =>
            edit({
              questions: [
                ...draft.questions,
                {
                  id: crypto.randomUUID(),
                  prompt: "",
                  type: "text",
                  required: false,
                  options: [],
                },
              ],
            })
          }
        >
          Add question
        </Button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      <SaveState
        editor={editor}
        rebase={async () => {
          try {
            const latest = await api.getPatientForm(patientId);
            editor.rebase(latest.form?.id ?? null);
          } catch {
            setError(
              "Latest form could not be loaded. Your draft is retained.",
            );
          }
        }}
      />
    </form>
  );
}
