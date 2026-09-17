"use client";
import { Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { LoadState, Pages, useRead } from "@/components/care-support/shared";
import TemplateEditor from "@/components/care-support/TemplateEditor";
import { TemplateTable } from "@/components/care-support/TemplateTable";
import { Button } from "@/components/ui/button";
import { useClinicalAPI } from "@/lib/auth";

function Templates() {
  const api = useClinicalAPI();
  const params = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const fetch = useCallback(() => api.getTemplates(page), [api, page]);
  const result = useRead(fetch);
  const selected = params.get("id");
  const creating = params.has("new");
  const template = result.data?.data.find((t) => t.id === selected);
  // One filled action: New template, unless an editor with its own Save is open.
  const editorOpen = creating || Boolean(template);
  return (
    <DashboardLayout title="Templates">
      <div className="portal-page">
        <header className="flex flex-wrap items-end gap-3">
          <div className="flex-1 space-y-1">
            <p className="eyebrow">{result.data ? `Reusable routines · ${result.data.pagination.total}` : "Reusable routines"}</p>
            <h1 className="editorial-title text-[32px]">Templates</h1>
            <p className="max-w-prose text-sm text-ink-secondary">Copy a template into a patient draft, then review and save the assignment.</p>
          </div>
          <Button variant="ghost" size="sm" asChild><a href={"/templates?page=" + page}>Refresh</a></Button>
          <Button variant={editorOpen ? "outline" : "default"} asChild><a href="/templates?new=1">New template</a></Button>
        </header>
        <LoadState {...result} loading="Loading templates" />
        {result.data && (
          <>
            {result.data.data.length === 0 && !creating ? (
              <div className="space-y-2 py-6">
                <h2 className="editorial-title text-2xl">No templates yet</h2>
                <p className="text-sm text-ink-secondary">Write a reusable routine once, then copy it into patient drafts.</p>
              </div>
            ) : result.data.data.length > 0 ? (
              <TemplateTable templates={result.data.data} page={page} selectedId={template?.id ?? null} />
            ) : null}
            {result.data.pagination.totalPages > 1 && (
              <Pages page={page} totalPages={result.data.pagination.totalPages} onPage={(next) => { window.location.href = "/templates?page=" + next; }} />
            )}
            {creating ? (
              <TemplateEditor key="new" template={null} />
            ) : template ? (
              <TemplateEditor key={template.revisionId} template={template} />
            ) : selected ? (
              <p className="text-sm text-ink-secondary">This template is not on this page. Use the page controls to find it.</p>
            ) : null}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
export default function Page() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-ink-secondary">Opening templates</p>}>
      <Templates />
    </Suspense>
  );
}
