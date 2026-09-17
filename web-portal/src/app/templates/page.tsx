"use client";
import { useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useClinicalAPI } from "@/lib/auth";
import { useRead, LoadState, Pages } from "@/components/care-support/shared";
import TemplateEditor from "@/components/care-support/TemplateEditor";
function Templates() {
  const api = useClinicalAPI();
  const params = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const fetch = useCallback(() => api.getTemplates(page), [api, page]);
  const result = useRead(fetch);
  const selected = params.get("id");
  const template = result.data?.data.find((t) => t.id === selected);
  return (
    <DashboardLayout title="Templates">
      <div className="portal-page">
        <header>
          <h1 className="editorial-title text-4xl">Routine templates</h1>
          <p className="text-ink-secondary">
            Your reusable routines. Copy a template into a patient draft, then
            review and save the assignment.
          </p>
        </header>
        <a className="underline" href="/templates?new=1">
          Create template
        </a>
        <a className="underline" href={"/templates?page=" + page}>
          Refresh template list
        </a>
        <LoadState {...result} />
        {result.data && (
          <>
            <div className="space-y-3">
              {!result.data.data.length && <p>No templates yet.</p>}
              {result.data.data.map((t) => (
                <article
                  className="flex justify-between gap-3 border-t py-4"
                  key={t.id}
                >
                  <a
                    className="underline"
                    href={
                      "/templates?page=" +
                      page +
                      "&id=" +
                      encodeURIComponent(t.id)
                    }
                  >
                    {t.name}
                  </a>
                  <span>
                    Version {t.version} · {t.isActive ? "Active" : "Archived"}
                  </span>
                </article>
              ))}
            </div>
            <Pages
              page={page}
              totalPages={result.data.pagination.totalPages}
              onPage={(next) => {
                window.location.href = "/templates?page=" + next;
              }}
            />
            {params.has("new") ? (
              <TemplateEditor key="new" template={null} />
            ) : template ? (
              <TemplateEditor key={template.revisionId} template={template} />
            ) : selected ? (
              <p>
                Template is not on this page. Use the page controls to find it.
              </p>
            ) : null}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
export default function Page() {
  return (
    <Suspense fallback={<p>Opening templates…</p>}>
      <Templates />
    </Suspense>
  );
}
