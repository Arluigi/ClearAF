/* eslint-disable @next/next/no-img-element -- Authorized ephemeral photo URLs bypass optimizer caches. */
"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useClinicalAPI } from "@/lib/auth";
import {
  ConversationController,
  type MessageRecord,
  type MessageReference,
  type ReferenceResult,
  type Conversation,
} from "@/lib/assigned-messaging";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUnsaved } from "@/components/care-support/shared";
function MessageRow({
  message,
  onVisible,
  onReference,
  refresh,
}: {
  message: MessageRecord;
  onVisible: (id: string) => void;
  onReference: (message: MessageRecord) => void;
  refresh: number;
}) {
  const element = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!message.unreadForMe || !element.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries.some((e) => e.isIntersecting) &&
          document.visibilityState === "visible"
        ) {
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
    <article
      ref={element}
      className={
        "max-w-2xl space-y-2 rounded-lg border p-4 " +
        (message.senderType === "dermatologist"
          ? "ml-auto bg-accent"
          : "mr-auto bg-card")
      }
    >
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>
          {message.senderType === "dermatologist" ? "Care team" : "Patient"}
        </span>
        <time dateTime={message.sentAt}>
          {new Date(message.sentAt).toLocaleString()}
        </time>
      </div>
      <p className="whitespace-pre-wrap break-words">{message.content}</p>
      {message.reference && (
        <Button
          variant="link"
          className="h-auto whitespace-normal p-0 text-left"
          onClick={() => onReference(message)}
        >
          {message.reference.available
            ? message.reference.label || "Open linked record"
            : message.reference.type === "photo"
              ? "Photo unavailable"
              : "Routine revision unavailable"}
        </Button>
      )}
    </article>
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
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogTitle>Linked record</DialogTitle>
        <DialogDescription>
          The original record is checked against your current patient
          assignment.
        </DialogDescription>
        {failed ? (
          <p role="alert">This record could not be opened.</p>
        ) : !result ? (
          <p role="status">Opening record…</p>
        ) : !result.reference.available ? (
          <p>This record is unavailable.</p>
        ) : (
          <div className="space-y-4">
            <h3 className="font-medium">{result.reference.label}</h3>
            {result.reference.occurredAt && (
              <p>{new Date(result.reference.occurredAt).toLocaleString()}</p>
            )}
            {image && (
              /* Authorized ephemeral URL must not enter the image optimizer cache. */ <img
                src={image}
                alt="Linked patient photo"
                onError={() => setFailed(true)}
                className="max-h-[55vh] w-full object-contain"
              />
            )}
            {result.routine && (
              <>
                <p>
                  {result.routine.timeOfDay} · Version {result.routine.version}
                </p>
                <ol className="list-decimal space-y-3 pl-5">
                  {result.routine.steps.map((step, i) => (
                    <li key={i}>
                      <p>{step.title}</p>
                      <p className="whitespace-pre-wrap">{step.instructions}</p>
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
}: {
  patientId: string;
  clinicianId: string;
  initialReference: MessageReference | null;
  onConversationChange: (conversation: Conversation) => void;
}) {
  const api = useClinicalAPI();
  const source = useMemo(
    () => ({
      api,
      controller: new ConversationController(patientId, clinicianId),
    }),
    [api, patientId, clinicianId],
  );
  const controller = source.controller;
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.snapshot,
    controller.snapshot,
  );
  const [selected, setSelected] = useState<MessageRecord | null>(null);
  const [refresh, setRefresh] = useState(0);
  useUnsaved(Boolean(state.text) || controller.frozen);
  useEffect(() => {
    if (state.conversation) onConversationChange(state.conversation);
  }, [state.conversation, onConversationChange]);
  const load = useCallback(
    (older = false) => {
      const cursor = older ? controller.snapshot().nextCursor : undefined;
      void controller.load(
        () =>
          api.getAssignedMessages(patientId, clinicianId, cursor || undefined),
        older,
      );
      if (!older) setRefresh((n) => n + 1);
    },
    [api, controller, patientId, clinicianId],
  );
  useEffect(() => {
    controller.link(initialReference);
    void controller.load(() => api.getAssignedMessages(patientId, clinicianId));
    return () => controller.cancel();
  }, [api, controller, patientId, clinicianId, initialReference]);
  const visible = useCallback(
    (id: string) => {
      void controller.markVisible([id], (ids) =>
        api.acknowledgeMessages(patientId, clinicianId, ids),
      );
    },
    [api, controller, patientId, clinicianId],
  );
  return (
    <section className="min-w-0 space-y-5" aria-label="Patient conversation">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-medium">
            {state.conversation?.patientName || "Patient conversation"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {state.conversation
              ? `${state.conversation.unreadCount} unread · `
              : ""}
            Refresh to check for new messages.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={state.status === "loading"}
          onClick={() => load()}
        >
          Refresh messages
        </Button>
      </header>
      {state.error && <p role="alert">{state.error}</p>}
      {state.readError && <p role="status">{state.readError}</p>}
      {state.status === "loading" && <p role="status">Loading messages…</p>}
      {state.nextCursor && (
        <Button
          variant="outline"
          disabled={state.status === "loading"}
          onClick={() => load(true)}
        >
          Load older messages
        </Button>
      )}
      <div className="space-y-4" aria-label="Message history">
        {state.status === "ready" && !state.messages.length && (
          <p>No messages yet. Start a conversation below.</p>
        )}
        {state.messages.map((message) => (
          <MessageRow
            key={message.id}
            message={message}
            onVisible={visible}
            onReference={setSelected}
            refresh={refresh}
          />
        ))}
      </div>
      <form
        className="space-y-3 border-t pt-4"
        onSubmit={(event) => {
          event.preventDefault();
          void controller.send((id, body) =>
            api.sendAssignedMessage(patientId, clinicianId, id, body),
          );
        }}
      >
        {state.reference && (
          <div className="flex items-center gap-3">
            <p>
              Feedback linked to{" "}
              {state.reference.type === "photo"
                ? "the selected photo"
                : "the selected routine revision"}
              .
            </p>
            <Button
              type="button"
              variant="ghost"
              disabled={controller.frozen}
              onClick={() => controller.link(null)}
            >
              Remove link
            </Button>
          </div>
        )}
        <label className="block">
          Message
          <textarea
            className="mt-2 block min-h-28 w-full rounded-md border bg-background p-3"
            maxLength={4000}
            value={state.text}
            disabled={controller.frozen}
            onChange={(event) => controller.edit(event.target.value)}
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Text only · {state.text.length}/4,000 characters. A sent message has
          been accepted by ClearAF.
        </p>
        {state.sendStatus === "sent" && <p role="status">Sent</p>}
        <Button
          type="submit"
          disabled={
            state.sendStatus === "sending" ||
            (!state.text.trim() && !controller.frozen) ||
            state.status === "error"
          }
        >
          {state.sendStatus === "sending"
            ? "Sending…"
            : state.sendStatus === "failed"
              ? "Retry same message"
              : "Send message"}
        </Button>
        {state.sendStatus === "failed" && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              A previous attempt may already have been sent. Refresh before
              composing another message.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => controller.newDraft()}
            >
              Edit as a new message
            </Button>
          </div>
        )}
      </form>
      {selected && (
        <ReferenceDetail
          message={selected}
          patientId={patientId}
          clinicianId={clinicianId}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}
