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

test("clearStaleErrors removes error flags for reports that no longer need action", () => {
  const { clearStaleErrors } = require("../src/lib/urgent-reports");
  const errors = { r1: true, r2: true, r3: false };
  const rows: UrgentReport[] = [
    { id: "r1", patientId: "p", category: "other", description: "Open report", status: "open", createdAt: "2026-09-15T00:00:00.000Z", acknowledgedAt: null, resolvedAt: null, resolutionNote: null },
    { id: "r2", patientId: "p", category: "other", description: "Resolved report", status: "resolved", createdAt: "2026-09-15T00:00:00.000Z", acknowledgedAt: null, resolvedAt: "2026-09-15T01:00:00.000Z", resolutionNote: null },
    { id: "r3", patientId: "p", category: "other", description: "Acknowledged report", status: "acknowledged", createdAt: "2026-09-15T00:00:00.000Z", acknowledgedAt: "2026-09-15T00:30:00.000Z", resolvedAt: null, resolutionNote: null },
  ];
  const cleared = clearStaleErrors(errors, rows);
  // r1 is still open (needs action), so error stays. r2 is resolved (doesn't need action), so error is cleared. r3 has no error.
  assert.deepEqual(cleared, { r1: true });
});
