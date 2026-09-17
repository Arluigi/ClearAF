"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { LoadState, useRead } from "@/components/care-support/shared";
import ConversationView from "@/components/messages/ConversationView";
import { ThreadList } from "@/components/messages/ThreadList";
import { Button } from "@/components/ui/button";
import { useAuth, useClinicalAPI } from "@/lib/auth";
import { inboxUnread, messageReference, type Conversation } from "@/lib/assigned-messaging";

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
  const receive = useCallback((conversation: Conversation) => setObserved(conversation), []);
  const referenceType = params.get("referenceType"),
    referenceId = params.get("referenceId");
  const reference = useMemo(() => messageReference(referenceType, referenceId), [referenceType, referenceId]);
  // The open thread's live counts replace its inbox row until the inbox is refreshed.
  const conversations = (result.data?.conversations ?? []).map((row) =>
    observed?.patientId === row.patientId && observed.clinicianId === user?.id ? observed : row,
  );
  return (
    <DashboardLayout title="Messages">
      <div className="portal-page">
        <header className="space-y-1">
          <p className="eyebrow">{result.data ? `${inboxUnread(conversations)} unread on this page` : "Assigned patients"}</p>
          <h1 className="editorial-title text-[32px]">Messages</h1>
          <p className="text-sm text-ink-secondary">Private conversations with your assigned patients.</p>
        </header>
        <div className="grid gap-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <aside className="space-y-3" aria-label="Assigned conversations">
            <div className="flex items-center justify-between gap-2">
              <p className="eyebrow">Threads</p>
              <Button variant="ghost" size="sm" onClick={() => { setObserved(null); result.retry(); }}>Refresh inbox</Button>
            </div>
            <LoadState {...result} loading="Loading conversations" />
            {result.data && (conversations.length
              ? <ThreadList conversations={conversations} selectedId={patientId} now={new Date()} />
              : <p className="text-sm text-ink-secondary">No assigned patients on this page.</p>)}
            <div className="flex flex-wrap gap-2">
              {cursor && <Button variant="outline" size="sm" onClick={() => setCursor(undefined)}>First page</Button>}
              {result.data?.nextCursor && <Button variant="outline" size="sm" onClick={() => setCursor(result.data!.nextCursor!)}>Next patients</Button>}
            </div>
          </aside>
          {patientId && user ? (
            <ConversationView
              key={patientId + "-" + user.id}
              patientId={patientId}
              clinicianId={user.id}
              initialReference={reference}
              onConversationChange={receive}
              recordHref={"/patients/" + encodeURIComponent(patientId)}
            />
          ) : (
            <div className="space-y-2 py-6">
              <h2 className="editorial-title text-2xl">Choose a conversation</h2>
              <p className="text-sm text-ink-secondary">Select an assigned patient to open their messages.</p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
export default function Page() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-ink-secondary">Opening messages</p>}>
      <Messages />
    </Suspense>
  );
}
