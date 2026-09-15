import test from "node:test";
import assert from "node:assert/strict";
import "./env";
import { apiService, authStorage, supabase } from "../src/lib/api";
test("safety endpoints use exact paths, decision/report unwrapping and generation-bound transport", async () => {
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
    const method = init?.method || "GET";
    calls.push({
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) : null,
      method,
    });
    const payload =
      method === "PUT" ? { decision: { id: "d" } } : method === "POST" ? { report: { id: "r" } } : {};
    return new Response(JSON.stringify(payload), { status: 200 });
  };
  try {
    const api = apiService.scoped();
    await api.getEnrollmentSummary("p");
    await api.getCareDecisions("p", 2);
    await api.recordCareDecision("p", "d", { decision: "refer_out", patientMessage: null, photoId: "ph" });
    await api.markRefundIssued("p", "d");
    await api.getUrgentQueue(3);
    await api.getPatientUrgentReports("p");
    await api.acknowledgeUrgentReport("r");
    await api.resolveUrgentReport("r", "Note");
    assert.deepEqual(
      calls.map((c) => c.method + " " + new URL(c.url).pathname + new URL(c.url).search),
      [
        "GET /api/enrollment/patients/p",
        "GET /api/care-decisions/patients/p?page=2&limit=20",
        "PUT /api/care-decisions/patients/p/decisions/d",
        "PUT /api/care-decisions/patients/p/decisions/d/refund",
        "GET /api/urgent-reports/queue?page=3&limit=20",
        "GET /api/urgent-reports/patients/p?page=1&limit=20",
        "POST /api/urgent-reports/r/acknowledge",
        "POST /api/urgent-reports/r/resolve",
      ],
    );
    assert.deepEqual(calls[2].body, { decision: "refer_out", patientMessage: null, photoId: "ph" });
    assert.deepEqual(calls[3].body, { refundStatus: "issued" });
    assert.deepEqual(calls[6].body, {});
    assert.deepEqual(calls[7].body, { resolutionNote: "Note" });
    apiService.acceptSession({
      access_token: "other",
      user: { id: "account-b" },
    });
    assert.throws(() => api.getEnrollmentSummary("p"));
    assert.equal(calls.length, 8);
  } finally {
    supabase.auth.getSession = original;
    globalThis.fetch = fetch;
  }
});
