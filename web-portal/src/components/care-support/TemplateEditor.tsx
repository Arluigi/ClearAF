"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useClinicalAPI } from "@/lib/auth";
import { RevisionEditor, templateVersionNote, type Template, type TemplateDraft } from "@/lib/care-support";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SaveState, useUnsaved } from "./shared";

const problem = (draft: TemplateDraft) =>
  !draft.name.trim() || (draft.isActive && !draft.steps.length) || draft.steps.some((step) => !step.title.trim())
    ? "Enter a name and a title for every step. Active templates need at least one step."
    : "";

export default function TemplateEditor({ template }: { template: Template | null }) {
  const api = useClinicalAPI();
  const [id] = useState(() => template?.id ?? crypto.randomUUID());
  const [reloadError, setReloadError] = useState("");
  const editor = useMemo(
    () =>
      new RevisionEditor<TemplateDraft>(
        template ? { name: template.name, steps: template.steps, isActive: template.isActive } : { name: "", steps: [], isActive: true },
        (revision, body) => api.saveTemplate(id, revision, body),
        undefined,
        template?.revisionId ?? null,
      ),
    [api, id, template],
  );
  const state = useSyncExternalStore(editor.subscribe, editor.snapshot, editor.snapshot);
  useEffect(() => () => editor.cancel(), [editor]);
  useUnsaved(state.dirty || state.pending);
  const draft = state.draft;
  const version = state.savedVersion ?? template?.version ?? null;
  const exists = Boolean(template || state.savedVersion);
  const blocked = state.pending || state.status === "saving" || state.status === "conflict";
  // The saved (confirmed) active state, not the draft: while dirty is true the draft can hold an edit whose save
  // is still pending or already failed, and it must not flip Archive/Restore before the server confirms it.
  const [confirmedActive, setConfirmedActive] = useState(draft.isActive);
  if (!state.dirty && confirmedActive !== draft.isActive) setConfirmedActive(draft.isActive);
  const edit = (change: Partial<TemplateDraft>) => editor.edit({ ...draft, ...change });
  const move = (from: number, to: number) => {
    const steps = [...draft.steps];
    [steps[from], steps[to]] = [steps[to], steps[from]];
    edit({ steps });
  };
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
  // Archive and Restore are saves: the next version carries isActive false or true, with any edits.
  const saveAs = (isActive: boolean) => {
    const next = { ...draft, isActive };
    const message = problem(next);
    setReloadError(message);
    if (message) return;
    editor.edit(next);
    void editor.save();
  };
  return (
    <form
      aria-label="Template editor"
      className="space-y-5 border-t-2 border-ink pt-5"
      onSubmit={(event) => {
        event.preventDefault();
        const message = problem(draft);
        setReloadError(message);
        if (!message) void editor.save();
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-medium">{draft.name.trim() || template?.name || "New template"}</h2>
        <p className="meta-mono">{templateVersionNote(version, draft.isActive)}</p>
      </div>
      <p className="max-w-prose text-sm text-ink-secondary">Saving creates a new version. Patient routines already copied from this template keep their own versions.</p>
      <fieldset disabled={state.pending} className="space-y-4">
        <div className="max-w-md space-y-1.5">
          <Label htmlFor={`${id}-name`}>Template name</Label>
          <Input id={`${id}-name`} required maxLength={120} value={draft.name} onChange={(e) => edit({ name: e.target.value })} />
        </div>
        <p className="eyebrow">Steps · {draft.steps.length}</p>
        {draft.steps.length === 0 ? (
          <p className="text-sm text-ink-secondary">No steps yet. Add a step before saving an active template.</p>
        ) : (
          <ol className="divide-y divide-rule border-y border-rule">
            {draft.steps.map((step, index) => (
              <li key={index} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] gap-3 py-3">
                <span className="pt-6 font-data text-xs font-medium tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor={`${id}-step-${index}-title`}>Step title</Label>
                  <Input id={`${id}-step-${index}-title`} required maxLength={120} value={step.title} onChange={(e) => edit({ steps: draft.steps.map((s, i) => (i === index ? { ...s, title: e.target.value } : s)) })} />
                  <Label htmlFor={`${id}-step-${index}-instructions`} className="block pt-2">Instructions</Label>
                  <Textarea id={`${id}-step-${index}-instructions`} className="min-h-16" maxLength={2000} value={step.instructions} onChange={(e) => edit({ steps: draft.steps.map((s, i) => (i === index ? { ...s, instructions: e.target.value } : s)) })} />
                </div>
                <div className="flex flex-col gap-1">
                  <Button type="button" variant="ghost" size="icon" aria-label={`Move step ${index + 1} up`} disabled={!index} onClick={() => move(index, index - 1)}><ArrowUp aria-hidden /></Button>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Move step ${index + 1} down`} disabled={index === draft.steps.length - 1} onClick={() => move(index, index + 1)}><ArrowDown aria-hidden /></Button>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove step ${index + 1}`} onClick={() => edit({ steps: draft.steps.filter((_, i) => i !== index) })}><X aria-hidden /></Button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </fieldset>
      {reloadError && <p role="alert" className="text-sm text-error">{reloadError}</p>}
      <div className="flex flex-wrap items-end gap-3">
        <SaveState editor={editor} rebase={rebase} label={`Save as v${(version ?? 0) + 1}`} />
        <Button type="button" variant="outline" disabled={state.pending || draft.steps.length >= 20} onClick={() => edit({ steps: [...draft.steps, { title: "", instructions: "" }] })}><Plus aria-hidden />Add step</Button>
        {exists && (confirmedActive
          ? <Button type="button" variant="outline" disabled={blocked} onClick={() => saveAs(false)}>Archive</Button>
          : <Button type="button" variant="outline" disabled={blocked} onClick={() => saveAs(true)}>Restore</Button>)}
      </div>
      {exists && (
        <p className="text-xs text-ink-secondary">
          {confirmedActive
            ? `Archive saves v${(version ?? 0) + 1}, including any edits, as archived. Archived templates are not offered when copying into a patient routine.`
            : `Archived. Restore saves v${(version ?? 0) + 1} as active.`}
        </p>
      )}
    </form>
  );
}
