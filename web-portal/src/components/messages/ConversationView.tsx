/* eslint-disable @next/next/no-img-element -- Authorized ephemeral photo URLs bypass optimizer caches. */
"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useClinicalAPI } from "@/lib/auth";
import {
  ConversationController,
  applyReference,
  linkedLabel,
  type Conversation,
  type MessageRecord,
  type MessageReference,
  type ReferenceResult,
} from "@/lib/assigned-messaging";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useUnsaved } from "@/components/care-support/shared";
import { firstName } from "@/lib/workspace";
import { stamp } from "@/lib/worklist";
import type { PhotoSummary } from "@/types/api";
import { MessageTurn } from "./MessageTurn";
import PhotoReferencePicker from "./PhotoReferencePicker";

function VisibleTurn({
  message,
  patientFirstName,
  onVisible,
  onReference,
  refresh,
}: {
  message: MessageRecord;
  patientFirstName: string;
  onVisible: (id: string) => void;
  onReference: (message: MessageRecord) => void;
  refresh: number;
}) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!message.unreadForMe || !element.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && document.visibilityState === "visible") {
          onVisible(message.id);
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [message.id, message.unreadForMe, onVisible, refresh]);
  return (
    <div ref={element}>
      <MessageTurn message={message} patientFirstName={patientFirstName} onReference={onReference} />
    </div>
  );
}

function ReferenceDetail({
  message,
  patientId,
  clinicianId,
  onClose,
}: {
  message: MessageRecord;
  patientId: string;
  clinicianId: string;
  onClose: () => void;
}) {
  const api = useClinicalAPI();
  const [result, setResult] = useState<ReferenceResult | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void api
      .getMessageReference(patientId, clinicianId, message.id)
      .then(async (value) => {
        if (!active) return;
        setResult(value);
        if (value.reference.available && value.reference.type === "photo") {
          const original = await api.getPhotoOriginal(value.reference.id);
          if (active) setImage(original.photoUrl);
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [api, patientId, clinicianId, message.id]);
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogTitle>Linked record</DialogTitle>
        <DialogDescription>The original record is checked against your current patient assignment.</DialogDescription>
        {failed ? (
          <p role="alert" className="text-sm text-error">This record could not be opened.</p>
        ) : !result ? (
          <p role="status" className="text-sm text-ink-secondary">Opening record</p>
        ) : !result.reference.available ? (
          <p className="text-sm">This record is unavailable.</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-[15px] font-medium">{result.reference.label}</h3>
              {result.reference.occurredAt && <p className="meta-mono">{stamp(result.reference.occurredAt)}</p>}
            </div>
            {image && (
              <div className="photo-mat">
                {/* Authorized ephemeral URL must not enter the image optimizer cache. */}
                <img src={image} alt="Linked patient photo" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="max-h-[55vh] w-full object-contain" />
              </div>
            )}
            {result.routine && (
              <>
                <p className="meta-mono">{result.routine.timeOfDay === "morning" ? "Morning" : "Evening"} routine · v{result.routine.version}</p>
                <ol className="divide-y divide-rule border-y border-rule">
                  {result.routine.steps.map((step, i) => (
                    <li key={i} className="py-2">
                      <p className="text-sm font-medium">{i + 1} · {step.title}</p>
                      {step.instructions && <p className="whitespace-pre-wrap text-sm text-ink-secondary">{step.instructions}</p>}
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function ConversationView({
  patientId,
  clinicianId,
  initialReference,
  onConversationChange,
  recordHref,
}: {
  patientId: string;
  clinicianId: string;
  initialReference: MessageReference | null;
  onConversationChange: (conversation: Conversation) => void;
  recordHref?: string;
}) {
  const api = useClinicalAPI();
  const source = useMemo(() => ({ api, controller: new ConversationController(patientId, clinicianId) }), [api, patientId, clinicianId]);
  const controller = source.controller;
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
  const [selected, setSelected] = useState<MessageRecord | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [picking, setPicking] = useState(false);
  const [linked, setLinked] = useState<PhotoSummary | null>(null);
  const composer = useId();
  useUnsaved(Boolean(state.text) || controller.frozen);
  useEffect(() => {
    if (state.conversation) onConversationChange(state.conversation);
  }, [state.conversation, onConversationChange]);
  const load = useCallback(
    (older = false) => {
      const cursor = older ? controller.snapshot().nextCursor : undefined;
      void controller.load(() => api.getAssignedMessages(patientId, clinicianId, cursor || undefined), older);
      if (!older) setRefresh((n) => n + 1);
    },
    [api, controller, patientId, clinicianId],
  );
  useEffect(() => {
    void controller.load(() => api.getAssignedMessages(patientId, clinicianId));
    return () => controller.cancel();
  }, [api, controller, patientId, clinicianId]);
  // A tab switch can drop the URL's reference param (it reverts to null); that must never wipe the draft or messages
  // loaded above, so this reference sync is a separate effect with its own, narrower dependencies.
  useEffect(() => {
    applyReference(controller, initialReference);
  }, [controller, initialReference]);
  const visible = useCallback(
    (id: string) => {
      void controller.markVisible([id], (ids) => api.acknowledgeMessages(patientId, clinicianId, ids));
    },
    [api, controller, patientId, clinicianId],
  );
  const first = firstName(state.conversation?.patientName);
  return (
    <section className="min-w-0 space-y-5" aria-label="Patient conversation">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-ink pb-3">
        <div className="space-y-1">
          <h2 className="text-[17px] font-medium">{state.conversation?.patientName || "Patient conversation"}</h2>
          <p className="meta-mono">{state.conversation ? `${state.conversation.unreadCount} unread · ` : ""}Refresh to check for new messages</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {recordHref && (
            <Button variant="outline" size="sm" asChild>
              <a href={recordHref}>Open record</a>
            </Button>
          )}
          <Button variant="outline" size="sm" disabled={state.status === "loading"} onClick={() => load()}>
            Refresh messages
          </Button>
        </div>
      </header>
      {state.error && <p role="alert" className="text-sm text-error">{state.error}</p>}
      {state.readError && <p role="status" className="text-sm text-ink-secondary">{state.readError}</p>}
      {state.status === "loading" && <p role="status" className="text-sm text-ink-secondary">Loading messages</p>}
      {state.nextCursor && (
        <Button variant="outline" size="sm" disabled={state.status === "loading"} onClick={() => load(true)}>
          Load older messages
        </Button>
      )}
      <div className="space-y-5" aria-label="Message history">
        {state.status === "ready" && !state.messages.length && (
          <div className="space-y-1 py-4">
            <h3 className="editorial-title text-2xl">No messages yet</h3>
            <p className="text-sm text-ink-secondary">Start the conversation below.</p>
          </div>
        )}
        {state.messages.map((message) => (
          <VisibleTurn key={message.id} message={message} patientFirstName={first} onVisible={visible} onReference={setSelected} refresh={refresh} />
        ))}
      </div>
      <form
        className="space-y-3 border-t-2 border-ink pt-4"
        onSubmit={(event) => {
          event.preventDefault();
          void controller.send((id, body) => api.sendAssignedMessage(patientId, clinicianId, id, body));
        }}
      >
        {state.reference && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="meta-mono">{linkedLabel(state.reference, linked?.id === state.reference.id ? linked.captureDate : null)}</p>
            <Button type="button" variant="link" size="sm" className="px-0" disabled={controller.frozen} onClick={() => { controller.link(null); setLinked(null); }}>
              Remove link
            </Button>
          </div>
        )}
        <Label htmlFor={composer} className="block">Message</Label>
        <Textarea
          id={composer}
          className="min-h-28"
          maxLength={4000}
          value={state.text}
          disabled={controller.frozen}
          placeholder={`Write to ${first || "the patient"}…`}
          onChange={(event) => controller.edit(event.target.value)}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            disabled={state.sendStatus === "sending" || (!state.text.trim() && !controller.frozen) || state.status === "error"}
          >
            {state.sendStatus === "sending" ? "Sending…" : state.sendStatus === "failed" ? "Retry same message" : "Send"}
          </Button>
          <Button type="button" variant="outline" disabled={controller.frozen} onClick={() => setPicking(true)}>Attach photo reference</Button>
          <span className="meta-mono ml-auto">{state.text.length} / 4000</span>
        </div>
        <p className="text-xs text-ink-secondary">Text only. A sent message has been accepted by ClearAF.</p>
        {state.sendStatus === "sent" && <p role="status" className="text-sm">Sent</p>}
        {state.sendStatus === "failed" && (
          <div className="space-y-2">
            <p className="text-sm text-ink-secondary">A previous attempt may already have been sent. Refresh before composing another message.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => controller.newDraft()}>Edit as a new message</Button>
          </div>
        )}
      </form>
      {selected && <ReferenceDetail message={selected} patientId={patientId} clinicianId={clinicianId} onClose={() => setSelected(null)} />}
      {picking && (
        <PhotoReferencePicker
          patientId={patientId}
          onClose={() => setPicking(false)}
          onChoose={(photo) => {
            controller.link({ type: "photo", id: photo.id });
            setLinked(photo);
            setPicking(false);
          }}
        />
      )}
    </section>
  );
}
