"use client";
import * as React from "react";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { LatestRead, RevisionEditor } from "@/lib/care-support";
import { Button } from "@/components/ui/button";
export function useRead<T>(fetch: () => Promise<T>) {
  const source = useMemo(() => ({ read: new LatestRead<T>(), fetch }), [fetch]);
  const read = source.read;
  const state = useSyncExternalStore(
    read.subscribe,
    read.snapshot,
    read.snapshot,
  );
  useEffect(() => {
    void read.load(fetch);
    return () => read.cancel();
  }, [read, fetch]);
  return { ...state, retry: () => void read.load(fetch) };
}
export function LoadState({
  status,
  error,
  retry,
  loading = "Loading",
}: {
  status: string;
  error: string;
  retry: () => void;
  loading?: string;
}) {
  return status === "loading" ? (
    <p role="status" className="text-sm text-ink-secondary">
      {loading}
    </p>
  ) : status === "error" ? (
    <div role="alert" className="space-y-2">
      <p className="text-sm">{error}</p>
      <Button variant="outline" size="sm" onClick={retry}>
        Retry
      </Button>
    </div>
  ) : null;
}
export function Pages({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  return (
    <nav
      aria-label="Record pages"
      className="flex flex-wrap items-center gap-3"
    >
      <Button
        variant="outline"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        Previous
      </Button>
      <span>
        Page {page} of {Math.max(1, totalPages)}
      </span>
      <Button
        variant="outline"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
      >
        Next
      </Button>
    </nav>
  );
}
export function useUnsaved(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}
export function SaveState<D extends object>({
  editor,
  rebase,
  label = "Save new version",
}: {
  editor: RevisionEditor<D>;
  rebase: () => Promise<void>;
  label?: string;
}) {
  const state = useSyncExternalStore(
    editor.subscribe,
    editor.snapshot,
    editor.snapshot,
  );
  return (
    <div className="space-y-3">
      <p role="status" className="text-sm text-ink-secondary">
        {state.dirty
          ? "Unsaved changes"
          : state.savedVersion
            ? `Version ${state.savedVersion} saved`
            : "No unsaved changes"}
      </p>
      {state.error && <p role="alert">{state.error}</p>}
      {state.status === "conflict" ? (
        <Button type="button" variant="outline" onClick={() => void rebase()}>
          Load latest version; keep draft
        </Button>
      ) : (
        <Button
          type="submit"
          disabled={!state.dirty || state.status === "saving"}
        >
          {state.status === "saving"
            ? "Saving…"
            : state.pending
              ? "Retry same save"
              : label}
        </Button>
      )}
    </div>
  );
}
