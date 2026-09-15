import test from "node:test";
import assert from "node:assert/strict";
import { categoryLabel, runReportAction, statusLabel } from "../src/lib/urgent-reports";
import type { UrgentReport } from "../src/lib/urgent-reports";

test("a failed acknowledge or resolve flags the row and refetches so it shows its current state", async () => {
  const events: string[] = [];
  const hooks = {
    saved: (r: UrgentReport) => events.push("saved:" + r.id),
    failed: () => events.push("failed"),
    refetch: () => events.push("refetch"),
  };
  // e.g. 409 REPORT_RESOLVED because another clinician resolved it first
  const conflict = Object.assign(new Error("REPORT_RESOLVED"), { status: 409, code: "REPORT_RESOLVED" });
  assert.equal(await runReportAction(async () => { throw conflict; }, hooks), false);
  assert.deepEqual(events, ["failed", "refetch"]);
  events.length = 0;
  const row: UrgentReport = {
    id: "r1", patientId: "p", category: "other", description: "Synthetic", status: "acknowledged",
    createdAt: "2026-09-15T00:00:00.000Z", acknowledgedAt: "2026-09-15T01:00:00.000Z", resolvedAt: null, resolutionNote: null,
  };
  assert.equal(await runReportAction(async () => row, hooks), true);
  assert.deepEqual(events, ["saved:r1"]);
});

test("urgent labels are text, not colour alone", () => {
  assert.equal(categoryLabel("reaction_to_treatment"), "Reaction to a treatment");
  assert.equal(categoryLabel("rapid_worsening"), "Skin getting much worse quickly");
  assert.equal(categoryLabel("pain_or_infection"), "Pain, swelling or signs of infection");
  assert.equal(categoryLabel("other"), "Something else");
  assert.equal(statusLabel("open"), "Open");
  assert.equal(statusLabel("acknowledged"), "Seen");
  assert.equal(statusLabel("resolved"), "Resolved");
});
