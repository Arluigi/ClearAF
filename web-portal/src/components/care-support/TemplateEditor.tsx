"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useClinicalAPI } from "@/lib/auth";
import {
  RevisionEditor,
  type Template,
  type TemplateDraft,
} from "@/lib/care-support";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SaveState, useUnsaved } from "./shared";
export default function TemplateEditor({
  template,
}: {
  template: Template | null;
}) {
  const api = useClinicalAPI();
  const [id] = useState(() => template?.id ?? crypto.randomUUID());
  const [reloadError, setReloadError] = useState("");
  const editor = useMemo(
    () =>
      new RevisionEditor<TemplateDraft>(
        template
          ? {
              name: template.name,
              steps: template.steps,
              isActive: template.isActive,
            }
          : { name: "", steps: [], isActive: true },
        (revision, body) => api.saveTemplate(id, revision, body),
        undefined,
        template?.revisionId ?? null,
      ),
    [api, id, template],
  );
  const state = useSyncExternalStore(
    editor.subscribe,
    editor.snapshot,
    editor.snapshot,
  );
  useEffect(() => () => editor.cancel(), [editor]);
  useUnsaved(state.dirty || state.pending);
  const draft = state.draft;
  const edit = (change: Partial<TemplateDraft>) =>
    editor.edit({ ...draft, ...change });
  const rebase = async () => {
    setReloadError("");
    try {
      let page = 1;
      let found: Template | undefined;
      while (true) {
        const result = await api.getTemplates(page);
        found = result.data.find((item) => item.id === id);
        if (found || page >= result.pagination.totalPages) break;
        page++;
      }
      editor.rebase(found?.revisionId ?? null);
    } catch {
      setReloadError("Latest version could not be loaded. Draft retained.");
    }
  };
  return (
    <form
      className="space-y-5 rounded-none border bg-surface p-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (
          !draft.name.trim() ||
          (draft.isActive && !draft.steps.length) ||
          draft.steps.some((step) => !step.title.trim())
        ) {
          setReloadError(
            "Enter a name and step titles. Active templates require a step.",
          );
          return;
        }
        setReloadError("");
        void editor.save();
      }}
    >
      <h2 className="text-xl font-medium">
        {template || state.savedVersion ? "Edit template" : "New template"}
      </h2>
      <p className="text-sm text-ink-secondary">
        Changes create an immutable version. Patient routines already copied
        from this template keep their own versions.
      </p>
      <fieldset disabled={state.pending} className="space-y-4">
        <label className="block space-y-2">
          Template name
          <Input
            required
            maxLength={120}
            value={draft.name}
            onChange={(e) => edit({ name: e.target.value })}
          />
        </label>
        <label className="flex gap-2">
          <input
            type="checkbox"
            checked={draft.isActive}
            onChange={(e) => edit({ isActive: e.target.checked })}
          />
          Active template (clear and save to archive)
        </label>
        {draft.steps.map((step, index) => (
          <div className="space-y-3 border-t pt-4" key={index}>
            <h3>Step {index + 1}</h3>
            <label className="block">
              Title
              <Input
                required
                maxLength={120}
                value={step.title}
                onChange={(e) =>
                  edit({
                    steps: draft.steps.map((s, i) =>
                      i === index ? { ...s, title: e.target.value } : s,
                    ),
                  })
                }
              />
            </label>
            <label className="block">
              Instructions
              <Textarea
                maxLength={2000}
                value={step.instructions}
                onChange={(e) =>
                  edit({
                    steps: draft.steps.map((s, i) =>
                      i === index ? { ...s, instructions: e.target.value } : s,
                    ),
                  })
                }
              />
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!index}
                onClick={() => {
                  const steps = [...draft.steps];
                  [steps[index - 1], steps[index]] = [
                    steps[index],
                    steps[index - 1],
                  ];
                  edit({ steps });
                }}
              >
                Move up
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={index === draft.steps.length - 1}
                onClick={() => {
                  const steps = [...draft.steps];
                  [steps[index + 1], steps[index]] = [
                    steps[index],
                    steps[index + 1],
                  ];
                  edit({ steps });
                }}
              >
                Move down
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  edit({ steps: draft.steps.filter((_, i) => i !== index) })
                }
              >
                Remove step
              </Button>
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={draft.steps.length >= 20}
          onClick={() =>
            edit({ steps: [...draft.steps, { title: "", instructions: "" }] })
          }
        >
          Add step
        </Button>
        {draft.isActive && !draft.steps.length && (
          <p>Add a step before saving an active template.</p>
        )}
      </fieldset>
      {reloadError && <p role="alert">{reloadError}</p>}
      <SaveState editor={editor} rebase={rebase} />
    </form>
  );
}
