import * as React from "react";
import { threadTime, type Conversation } from "@/lib/assigned-messaging";
import { cn } from "@/lib/utils";

export function ThreadList({ conversations, selectedId, now }: { conversations: Conversation[]; selectedId: string | null; now: Date }) {
  return (
    <ul className="divide-y divide-rule border-y border-rule">
      {conversations.map((conversation) => {
        const selected = conversation.patientId === selectedId;
        const unread = conversation.unreadCount > 0;
        return (
          <li key={conversation.patientId}>
            <a
              href={"/messages?patient=" + encodeURIComponent(conversation.patientId)}
              aria-current={selected ? "true" : undefined}
              className={cn("block space-y-1 px-3 py-3 hover:bg-sunk", selected && "selected-rule", !selected && unread && "shadow-[inset_4px_0_0_rgb(var(--attention-mark))]")}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className={cn("truncate text-sm", unread ? "font-medium" : "font-[450]")}>{conversation.patientName || "Unnamed patient"}</span>
                {conversation.lastMessage && <span className="meta-mono flex-none">{threadTime(conversation.lastMessage.sentAt, now)}</span>}
              </span>
              <span className="line-clamp-2 block break-words text-xs text-ink-secondary">{conversation.lastMessage?.content || "No messages yet"}</span>
              {unread && <span className="eyebrow block text-attention-text">{conversation.unreadCount} unread</span>}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
