"use client";
import { useCallback, useState } from "react";
import { useClinicalAPI } from "@/lib/auth";
import type { Template } from "@/lib/care-support";
import type { RoutineTimeOfDay } from "@/types/api";
import { LoadState, Pages, useRead } from "./shared";
import { TemplateList } from "./TemplateList";

export default function TemplatePicker({
  disabled,
  dirty,
  onCopy,
}: {
  disabled: Record<RoutineTimeOfDay, boolean>;
  dirty: Record<RoutineTimeOfDay, boolean>;
  onCopy: (slot: RoutineTimeOfDay, template: Template) => void;
}) {
  const api = useClinicalAPI();
  const [page, setPage] = useState(1);
  const fetch = useCallback(() => api.getTemplates(page), [api, page]);
  const result = useRead(fetch);
  return (
    <section aria-label="Your templates" className="space-y-2">
      <p className="eyebrow">Your templates</p>
      <LoadState {...result} loading="Loading templates" />
      {result.data && (
        <TemplateList templates={result.data.data.filter((t) => t.isActive)} disabled={disabled} dirty={dirty} onCopy={onCopy} />
      )}
      {result.data && result.data.pagination.totalPages > 1 && (
        <Pages page={page} totalPages={result.data.pagination.totalPages} onPage={setPage} />
      )}
      <p className="text-xs text-ink-secondary">Using a template replaces that draft. Review it, then save the routine.</p>
    </section>
  );
}
