"use client";
import * as React from "react";
import { ClipboardList, Image as ImageIcon } from "lucide-react";
import { referenceLabel, turnEyebrow, type MessageRecord } from "@/lib/assigned-messaging";
import { cn } from "@/lib/utils";

// Spec §4.7: clinician words in the display serif behind a 2px ink rule; patient replies in a sunk block. No bubbles.
// Unread (received and not yet seen) is the one ochre signal: a 4px mark and the word "Unread".
export function MessageTurn({ message, patientFirstName, onReference }: { message: MessageRecord; patientFirstName: string; onReference: (message: MessageRecord) => void }) {
  const clinician = message.senderType === "dermatologist";
  const unread = message.unreadForMe;
  return (
    <article className={cn("max-w-2xl space-y-2", clinician ? "border-l-2 border-ink pl-4" : "bg-sunk px-4 py-3", unread && "shadow-[inset_4px_0_0_rgb(var(--attention-mark))]")}>
      <p className={cn("meta-mono", unread && "text-attention-text")}>
        {turnEyebrow(message, patientFirstName)}
        {unread ? " · Unread" : ""}
      </p>
      <p className={clinician ? "whitespace-pre-wrap break-words font-display text-lg font-light leading-relaxed" : "whitespace-pre-wrap break-words text-sm"}>
        {message.content}
      </p>
      {message.reference && (
        <button type="button" onClick={() => onReference(message)} className="flex w-full max-w-sm items-center gap-3 border border-rule-field bg-surface p-2 text-left hover:bg-rail">
          <span aria-hidden className="photo-mat flex h-10 w-8 flex-none items-center justify-center">
            {message.reference.type === "photo" ? <ImageIcon className="h-4 w-4" /> : <ClipboardList className="h-4 w-4" />}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium">{referenceLabel(message.reference)}</span>
            <span className="eyebrow block">Attached reference</span>
          </span>
        </button>
      )}
    </article>
  );
}
