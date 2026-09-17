import test from "node:test";
import assert from "node:assert/strict";
import {
  ConversationController,
  applyReference,
  type Conversation,
  type MessagePage,
  type MessageRecord,
} from "../src/lib/assigned-messaging";
const conversation: Conversation = {
  patientId: "p",
  clinicianId: "c",
  patientName: "Patient",
  clinicianName: "Clinician",
  lastMessage: null,
  unreadCount: 2,
};
const message = (id: string): MessageRecord => ({
  id,
  patientId: "p",
  clinicianId: "c",
  senderId: "p",
  senderType: "patient",
  recipientId: "c",
  recipientType: "dermatologist",
  content: id,
  sentAt: "2026-09-13T10:00:00.000Z",
  unreadForMe: true,
  reference: null,
  origin: "native",
});
test("lost send response freezes body and identity for explicit retry", async () => {
  const c = new ConversationController("p", "c", () => "fixed-id");
  c.edit(" Hello ");
  const calls: unknown[] = [];
  await c.send(async (id, body) => {
    calls.push([id, body]);
    throw Error("lost");
  });
  c.edit("changed");
  await c.send(async (id, body) => {
    calls.push([id, body]);
    return {
      ...message(id),
      senderId: "c",
      senderType: "dermatologist",
      recipientId: "p",
      recipientType: "patient",
      content: body.content,
      unreadForMe: false,
    };
  });
  assert.deepEqual(calls, [
    ["fixed-id", { content: "Hello", reference: null }],
    ["fixed-id", { content: "Hello", reference: null }],
  ]);
  assert.equal(c.snapshot().sendStatus, "sent");
});
test("cancel rejects late history and send results and clears draft", async () => {
  const c = new ConversationController("p", "c");
  let finish!: (value: MessagePage) => void;
  const loading = c.load(() => new Promise((r) => (finish = r)));
  c.cancel();
  finish({ conversation, messages: [message("a")], nextCursor: null });
  await loading;
  assert.equal(c.snapshot().messages.length, 0);
  assert.equal(c.snapshot().text, "");
});
test("refresh merges IDs while older paging keeps its cursor and exact visible acknowledgements", async () => {
  const c = new ConversationController("p", "c");
  await c.load(async () => ({
    conversation,
    messages: [message("b")],
    nextCursor: "older",
  }));
  await c.load(
    async () => ({ conversation, messages: [message("a")], nextCursor: null }),
    true,
  );
  await c.load(async () => ({
    conversation,
    messages: [message("b"), message("c")],
    nextCursor: "new",
  }));
  assert.equal(c.snapshot().messages.length, 3);
  assert.equal(c.snapshot().nextCursor, null);
  const ids: string[][] = [];
  await c.markVisible(["b", "not-loaded"], async (x) => {
    ids.push(x);
    return { acknowledgedIds: x, unreadCount: 1 };
  });
  assert.deepEqual(ids, [["b"]]);
  assert.equal(
    c.snapshot().messages.find((m) => m.id === "a")?.unreadForMe,
    true,
  );
});
test("wrong-pair response never enters history", async () => {
  const c = new ConversationController("p", "c");
  await c.load(async () => ({
    conversation: { ...conversation, clinicianId: "other" },
    messages: [message("x")],
    nextCursor: null,
  }));
  assert.equal(c.snapshot().messages.length, 0);
  assert.equal(c.snapshot().status, "error");
});

test("refresh without overlapping history resets older cursor to avoid skipped new messages", async () => {
  const c = new ConversationController("p", "c");
  await c.load(async () => ({
    conversation,
    messages: [message("old")],
    nextCursor: "old-cursor",
  }));
  await c.load(async () => ({
    conversation,
    messages: [message("new")],
    nextCursor: "new-cursor",
  }));
  assert.deepEqual(
    c.snapshot().messages.map((m) => m.id),
    ["new"],
  );
  assert.equal(c.snapshot().nextCursor, "new-cursor");
});

test("explicit new draft creates a fresh identity after editing failed content", async () => {
  let sequence = 0;
  const c = new ConversationController("p", "c", () => String(++sequence));
  const attempts: string[] = [];
  c.edit("first");
  await c.send(async (id) => {
    attempts.push(id);
    throw Error("lost");
  });
  c.newDraft();
  c.edit("second");
  await c.send(async (id, body) => {
    attempts.push(id);
    return { ...message(id), content: body.content };
  });
  assert.deepEqual(attempts, ["1", "2"]);
});

// ConversationView applies `initialReference` (the URL's referenceType/referenceId) in a separate effect from the
// message load, calling exactly this. A tab switch that drops those URL params (the reference prop goes from set
// to null) must not wipe the in-progress draft or the linked reference.
test("applyReference links a fresh reference but never clears the draft when the prop reverts to null", async () => {
  const c = new ConversationController("p", "c");
  await c.load(async () => ({ conversation, messages: [], nextCursor: null }));
  c.edit("Draft in progress");
  applyReference(c, { type: "photo", id: "x" });
  assert.deepEqual([c.snapshot().text, c.snapshot().reference], ["Draft in progress", { type: "photo", id: "x" }]);
  // Simulates the tab-switch: the reference prop reverts to null (URL params dropped), which must be a no-op.
  applyReference(c, null);
  assert.deepEqual([c.snapshot().text, c.snapshot().reference, c.snapshot().messages], ["Draft in progress", { type: "photo", id: "x" }, []]);
});

test("applyReference does not link while a send is frozen", async () => {
  const c = new ConversationController("p", "c");
  c.edit("Reply");
  const pending = c.send(() => new Promise<MessageRecord>(() => {})); // never resolves: stays frozen
  applyReference(c, { type: "routineRevision", id: "y" });
  assert.equal(c.snapshot().reference, null);
  void pending;
});
