import test from "node:test";
import assert from "node:assert/strict";
import "./env";
import { apiService, authStorage, supabase } from "../src/lib/api";
test("care support reads use bounded clinician endpoints and session-scoped facade", async () => {
  await new Promise<void>((resolve) => setImmediate(resolve));
  const getSession = supabase.auth.getSession;
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  const session = {
    access_token: "synthetic-token",
    user: { id: "account-a" },
  };
  authStorage.beginLogin();
  apiService.acceptSession(session);
  supabase.auth.getSession = async () =>
    ({ data: { session }, error: null }) as Awaited<
      ReturnType<typeof getSession>
    >;
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return new Response("{}", { status: 200 });
  };
  try {
    const api = apiService.scoped();
    await api.getTemplates(2);
    await api.getPatientCalendar("patient-a", "2026-09");
    await api.getPatientCalendarEvents("patient-a", "2026-09-13", 2);
    await api.getPatientForm("patient-a");
    await api.getPatientResponses("patient-a", 3);
    assert.deepEqual(
      requests.map((url) => new URL(url).pathname + new URL(url).search),
      [
        "/api/care-support/templates?page=2&limit=20",
        "/api/care-support/patients/patient-a/calendar?month=2026-09",
        "/api/care-support/patients/patient-a/calendar/events?localDate=2026-09-13&page=2&limit=20",
        "/api/care-support/patients/patient-a/form",
        "/api/care-support/patients/patient-a/responses?page=3&limit=20",
      ],
    );
    apiService.acceptSession({
      access_token: "other",
      user: { id: "account-b" },
    });
    assert.throws(() => api.getPatientResponses("patient-a"));
    assert.equal(requests.length, 5);
  } finally {
    supabase.auth.getSession = getSession;
    globalThis.fetch = originalFetch;
  }
});
