'use client';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { appendQuickReply, quickReplies, type QuickReplyContext } from '@/lib/quick-replies';

// Quiet, outlined controls (Letterpress §4.1: portal 32–36px) — never a second filled button. A tap fills the
// draft (appending on a new line when there's already text) and never sends; the clinician still presses Send.
export function QuickReplyChips({ context, text, disabled, onFill }: {
  context: QuickReplyContext; text: string; disabled?: boolean; onFill: (text: string) => void;
}) {
  const replies = quickReplies(context);
  if (!replies.length) return null;
  return <div role="group" aria-label="Quick replies" className="flex flex-wrap gap-2">
    {replies.map(reply => <Button key={reply.id} type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onFill(appendQuickReply(text, reply.text))}>
      {reply.text}
    </Button>)}
  </div>;
}
