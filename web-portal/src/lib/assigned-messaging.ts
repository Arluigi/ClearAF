import type { RoutineRevision } from "../types/api";
export type MessageReference = {
  type: "photo" | "routineRevision";
  id: string;
};
export type ReferenceView = MessageReference & {
  available: boolean;
  label: string | null;
  occurredAt: string | null;
};
export interface MessageRecord {
  id: string;
  patientId: string;
  clinicianId: string;
  senderId: string;
  senderType: "patient" | "dermatologist";
  recipientId: string;
  recipientType: "patient" | "dermatologist";
  content: string;
  sentAt: string;
  unreadForMe: boolean;
  reference: ReferenceView | null;
  origin: "native" | "legacy";
}
export interface Conversation {
  patientId: string;
  clinicianId: string;
  patientName: string | null;
  clinicianName: string;
  lastMessage: MessageRecord | null;
  unreadCount: number;
}
export interface MessagePage {
  conversation: Conversation;
  messages: MessageRecord[];
  nextCursor: string | null;
}
export interface ReferenceResult {
  reference: ReferenceView;
  routine?: RoutineRevision;
  photo?: { id: string; captureDate: string; createdAt: string };
}
export interface MessageBody {
  content: string;
  reference: MessageReference | null;
}
interface State {
  conversation: Conversation | null;
  messages: MessageRecord[];
  nextCursor: string | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string;
  text: string;
  reference: MessageReference | null;
  sendStatus: "draft" | "sending" | "failed" | "sent";
  readError: string;
}
export class ConversationController {
  private state: State = {
    conversation: null,
    messages: [],
    nextCursor: null,
    status: "idle",
    error: "",
    text: "",
    reference: null,
    sendStatus: "draft",
    readError: "",
  };
  private listeners = new Set<() => void>();
  private epoch = 0;
  private serial = 0;
  private initialized = false;
  private pending: { id: string; body: MessageBody } | null = null;
  private reading = new Set<string>();
  private readQueue: Promise<void> = Promise.resolve();
  constructor(
    readonly patientId: string,
    readonly clinicianId: string,
    private uuid: () => string = () => crypto.randomUUID(),
  ) {}
  snapshot = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private patch(next: Partial<State>) {
    this.state = { ...this.state, ...next };
    this.listeners.forEach((fn) => fn());
  }
  cancel() {
    this.epoch++;
    this.serial++;
    this.pending = null;
    this.reading.clear();
    this.initialized = false;
    this.patch({
      conversation: null,
      messages: [],
      nextCursor: null,
      status: "idle",
      error: "",
      text: "",
      reference: null,
      sendStatus: "draft",
      readError: "",
    });
  }
  edit(text: string) {
    if (this.pending || this.state.sendStatus === "sending") return;
    this.patch({ text: text.slice(0, 4000), sendStatus: "draft" });
  }
  link(reference: MessageReference | null) {
    if (this.pending) return;
    this.patch({ reference, sendStatus: "draft" });
  }
  newDraft() {
    if (this.state.sendStatus !== "failed") return;
    this.pending = null;
    this.patch({ sendStatus: "draft", error: "" });
  }
  get frozen() {
    return this.pending !== null;
  }
  private belongs(m: MessageRecord) {
    return m.patientId === this.patientId && m.clinicianId === this.clinicianId;
  }
  async load(fetch: () => Promise<MessagePage>, older = false) {
    const epoch = this.epoch,
      serial = ++this.serial;
    this.patch({ status: "loading", error: "" });
    try {
      const page = await fetch();
      if (epoch !== this.epoch || serial !== this.serial) return;
      if (
        page.conversation.patientId !== this.patientId ||
        page.conversation.clinicianId !== this.clinicianId ||
        !page.messages.every((m) => this.belongs(m))
      )
        throw Error("Invalid conversation");
      const contiguous =
        older ||
        page.messages.some((m) =>
          this.state.messages.some((old) => old.id === m.id),
        );
      const merged = new Map(
        (contiguous ? this.state.messages : []).map((m) => [m.id, m]),
      );
      page.messages.forEach((m) => merged.set(m.id, m));
      this.patch({
        conversation: page.conversation,
        messages: [...merged.values()].sort(
          (a, b) =>
            a.sentAt.localeCompare(b.sentAt) || a.id.localeCompare(b.id),
        ),
        nextCursor:
          older || !this.initialized || !contiguous
            ? page.nextCursor
            : this.state.nextCursor,
        status: "ready",
      });
      this.initialized = true;
    } catch {
      if (epoch === this.epoch && serial === this.serial)
        this.patch({
          conversation: null,
          messages: [],
          nextCursor: null,
          status: "error",
          error:
            "Conversation unavailable. Refresh to check your access and connection.",
        });
    }
  }
  async send(send: (id: string, body: MessageBody) => Promise<MessageRecord>) {
    if (this.state.sendStatus === "sending") return;
    const content = this.state.text.trim();
    if (!this.pending && !content) return;
    if (!this.pending)
      this.pending = {
        id: this.uuid(),
        body: {
          content,
          reference: this.state.reference ? { ...this.state.reference } : null,
        },
      };
    const attempt = this.pending,
      epoch = this.epoch;
    this.patch({ sendStatus: "sending", error: "" });
    try {
      const message = await send(attempt.id, attempt.body);
      if (epoch !== this.epoch) return;
      if (
        !this.belongs(message) ||
        message.id !== attempt.id ||
        message.content !== attempt.body.content
      )
        throw Error("Invalid send result");
      const records = this.state.messages.filter((m) => m.id !== message.id);
      records.push(message);
      records.sort(
        (a, b) => a.sentAt.localeCompare(b.sentAt) || a.id.localeCompare(b.id),
      );
      this.pending = null;
      this.patch({
        messages: records,
        conversation: this.state.conversation
          ? { ...this.state.conversation, lastMessage: message }
          : null,
        text: "",
        reference: null,
        sendStatus: "sent",
      });
    } catch {
      if (epoch === this.epoch)
        this.patch({
          sendStatus: "failed",
          error:
            "Message could not be confirmed. Retry the same message when connected. Its recipient and content remain unchanged.",
        });
    }
  }
  async markVisible(
    ids: string[],
    ack: (
      ids: string[],
    ) => Promise<{ acknowledgedIds: string[]; unreadCount: number }>,
  ) {
    const selected = ids
      .filter(
        (id) =>
          !this.reading.has(id) &&
          this.state.messages.some((m) => m.id === id && m.unreadForMe),
      )
      .slice(0, 50);
    if (!selected.length) return;
    selected.forEach((id) => this.reading.add(id));
    const epoch = this.epoch;
    const previous = this.readQueue;
    let release!: () => void;
    this.readQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      if (epoch !== this.epoch) return;
      const result = await ack(selected);
      if (epoch !== this.epoch) return;
      if (result.acknowledgedIds.some((id) => !selected.includes(id)))
        throw Error("Invalid read response");
      const accepted = new Set(result.acknowledgedIds);
      this.patch({
        messages: this.state.messages.map((m) =>
          accepted.has(m.id) ? { ...m, unreadForMe: false } : m,
        ),
        conversation: this.state.conversation
          ? { ...this.state.conversation, unreadCount: result.unreadCount }
          : null,
        readError: "",
      });
    } catch {
      if (epoch === this.epoch)
        this.patch({
          readError: "Read status could not be updated. Refresh to retry.",
        });
    } finally {
      release();
      if (epoch === this.epoch)
        selected.forEach((id) => this.reading.delete(id));
    }
  }
}

const REFERENCE_ID = /^[0-9a-f-]{36}$/i;
/** Only a photo or routine revision UUID from the URL can become a message reference. */
export function messageReference(type: string | null, id: string | null): MessageReference | null {
  return (type === "photo" || type === "routineRevision") && id && REFERENCE_ID.test(id) ? { type, id } : null;
}
