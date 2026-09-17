"use client";
import { useCallback, useState } from "react";
import { useClinicalAPI } from "@/lib/auth";
import type { Template } from "@/lib/care-support";
import { Button } from "@/components/ui/button";
import { LoadState, Pages, useRead } from "./shared";
export default function TemplatePicker({
  disabled,
  onCopy,
}: {
  disabled: boolean;
  onCopy: (template: Template) => void;
}) {
  const api = useClinicalAPI();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState("");
  const fetch = useCallback(() => api.getTemplates(page), [api, page]);
  const result = useRead(fetch);
  const active = result.data?.data.filter((t) => t.isActive) ?? [];
  const template = active.find((t) => t.id === selected);
  return (
    <details className="space-y-3 border-b pb-4">
      <summary className="cursor-pointer">Copy a routine template</summary>
      <LoadState {...result} />
      {result.data && (
        <>
          <label className="block">
            Active template
            <select
              className="mt-2 block w-full rounded-none border border-rule-field bg-surface p-2"
              disabled={disabled}
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Choose a template</option>
              {active.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · Version {t.version}
                </option>
              ))}
            </select>
          </label>
          {!active.length && <p>No active templates on this page.</p>}
          <Pages
            page={page}
            totalPages={result.data.pagination.totalPages}
            onPage={(p) => {
              setSelected("");
              setPage(p);
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={disabled || !template}
            onClick={() => {
              if (template) onCopy(template);
            }}
          >
            Copy into draft
          </Button>
          <p className="text-sm text-ink-secondary">
            Replaces the current draft. Review and explicitly save the patient
            routine.
          </p>
        </>
      )}
    </details>
  );
}
