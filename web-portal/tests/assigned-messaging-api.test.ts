import test from "node:test";
import assert from "node:assert/strict";
import "./env";
import { apiService, authStorage, supabase } from "../src/lib/api";
test("messaging uses exact pair/IDs, bounded cursor requests and generation-bound transport", async () => {
  await new Promise<void>((r) => setImmediate(r));
  const original = supabase.auth.getSession,
    fetch = globalThis.fetch;
  const calls: { url: string; body: unknown; method: string }[] = [];
  const session = { access_token: "synthetic", user: { id: "account-a" } };
  authStorage.beginLogin();
  apiService.acceptSession(session);
  supabase.auth.getSession = async () =>
    ({ data: { session }, error: null }) as Awaited<
      ReturnType<typeof original>
    >;
  globalThis.fetch = async (input, init) => {
    calls.push({
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) : null,
      method: init?.method || "GET",
    });
    return new Response(JSON.stringify({ message: { id: "message" } }), {
      status: 200,
    });
  };
  try {
    const api = apiService.scoped();
    await api.getMessageInbox("cursor");
    await api.getAssignedMessages("p", "c", "before");
    await api.sendAssignedMessage("p", "c", "m", {
      content: "Neutral text",
      reference: { type: "routineRevision", id: "r" },
    });
    await api.acknowledgeMessages("p", "c", ["received"]);
    await api.getMessageReference("p", "c", "m");
    assert.deepEqual(
      calls.map((c) => new URL(c.url).pathname + new URL(c.url).search),
      [
        "/api/assigned-messages/inbox?limit=20&cursor=cursor",
        "/api/assigned-messages/patients/p/clinicians/c?limit=30&before=before",
        "/api/assigned-messages/patients/p/clinicians/c/messages/m",
        "/api/assigned-messages/patients/p/clinicians/c/read",
        "/api/assigned-messages/patients/p/clinicians/c/messages/m/reference",
      ],
    );
    assert.deepEqual(calls[3].body, { messageIds: ["received"] });
    assert.equal(calls[2].method, "PUT");
    apiService.acceptSession({
      access_token: "other",
      user: { id: "account-b" },
    });
    assert.throws(() => api.getMessageInbox());
    assert.equal(calls.length, 5);
  } finally {
    supabase.auth.getSession = original;
    globalThis.fetch = fetch;
  }
});
