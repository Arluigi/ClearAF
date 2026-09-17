"use client";
import { Suspense, useCallback, useMemo, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth, useClinicalAPI } from "@/lib/auth";
import { useRead, LoadState } from "@/components/care-support/shared";
import ConversationView from "@/components/messages/ConversationView";
import { Button } from "@/components/ui/button";
import type { Conversation, MessageReference } from "@/lib/assigned-messaging";
function Messages() {
  const api = useClinicalAPI();
  const { user } = useAuth();
  const params = useSearchParams();
  const [cursor, setCursor] = useState<string | undefined>();
  const fetch = useCallback(() => api.getMessageInbox(cursor), [api, cursor]);
  const result = useRead(fetch);
  const patientId = params.get("patient");
  const [observed, setObserved] = useState<Conversation | null>(null);
  useEffect(() => setObserved(null), [api]);
  const receive = useCallback(
    (conversation: Conversation) => setObserved(conversation),
    [],
  );
  const type = params.get("referenceType"),
    id = params.get("referenceId");
  const reference = useMemo<MessageReference | null>(
    () =>
      (type === "photo" || type === "routineRevision") &&
      id &&
      /^[0-9a-f-]{36}$/i.test(id)
        ? { type, id }
        : null,
    [type, id],
  );
  return (
    <DashboardLayout title="Messages">
      <div className="portal-page">
        <header>
          <h1 className="editorial-title text-4xl">Messages</h1>
          <p className="text-ink-secondary">
            Private conversations with your assigned patients.
          </p>
        </header>
        <div className="grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="space-y-4" aria-label="Assigned conversations">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-medium">Assigned patients</h2>
              <Button
                variant="ghost"
                onClick={() => {
                  setObserved(null);
                  result.retry();
                }}
              >
                Refresh inbox
              </Button>
            </div>
            <LoadState {...result} />
            {result.data?.conversations.map((row) => {
              const c =
                observed?.patientId === row.patientId &&
                observed.clinicianId === user?.id
                  ? observed
                  : row;
              return (
                <a
                  key={c.patientId}
                  href={"/messages?patient=" + encodeURIComponent(c.patientId)}
                  aria-current={patientId === c.patientId ? "true" : undefined}
                  className={
                    "block space-y-1 rounded-none border p-3 " +
                    (patientId === c.patientId ? "selected-rule" : "")
                  }
                >
                  <p className="font-medium">
                    {c.patientName || "Unnamed patient"}
                  </p>
                  <p className="text-xs text-ink-secondary">
                    {c.unreadCount} unread
                  </p>
                  <p className="line-clamp-2 break-words text-sm">
                    {c.lastMessage?.content || "No messages yet"}
                  </p>
                </a>
              );
            })}
            {result.data && !result.data.conversations.length && (
              <p>No assigned patients on this page.</p>
            )}
            <div className="flex flex-wrap gap-2">
              {cursor && (
                <Button variant="outline" onClick={() => setCursor(undefined)}>
                  First page
                </Button>
              )}
              {result.data?.nextCursor && (
                <Button
                  variant="outline"
                  onClick={() => setCursor(result.data!.nextCursor!)}
                >
                  Next patients
                </Button>
              )}
            </div>
          </aside>
          {patientId && user ? (
            <ConversationView
              key={patientId + "-" + user.id}
              patientId={patientId}
              clinicianId={user.id}
              initialReference={reference}
              onConversationChange={receive}
            />
          ) : (
            <p>Select an assigned patient to open their conversation.</p>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
export default function Page() {
  return (
    <Suspense fallback={<p>Opening messages…</p>}>
      <Messages />
    </Suspense>
  );
}
