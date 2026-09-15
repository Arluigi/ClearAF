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

test("clearStaleErrors keeps the error when a resolve-with-note attempt did not take effect (note differs)", () => {
  const { clearStaleErrors } = require("../src/lib/urgent-reports");
  // Clinician A resolved the report with no note. Clinician B (stale tab) typed a note and hit
  // Confirm resolve; the server rejected it with 409 REPORT_RESOLVED because notes differ, so B's
  // note was never saved. The refetched row is resolved but with A's (null) note, not B's.
  const errors = { r1: true };
  const attempts = { r1: { type: "resolve", note: "Please call the clinic" } };
  const rows: UrgentReport[] = [
    { id: "r1", patientId: "p", category: "other", description: "Report", status: "resolved", createdAt: "2026-09-15T00:00:00.000Z", acknowledgedAt: null, resolvedAt: "2026-09-15T01:00:00.000Z", resolutionNote: null },
  ];
  const cleared = clearStaleErrors(errors, rows, attempts);
  assert.deepEqual(cleared, { r1: true });
});

test("clearStaleErrors clears the error when a resolve attempt's note matches the refetched row", () => {
  const { clearStaleErrors } = require("../src/lib/urgent-reports");
  const errors = { r1: true };
  const attempts = { r1: { type: "resolve", note: "Please call the clinic" } };
  const rows: UrgentReport[] = [
    { id: "r1", patientId: "p", category: "other", description: "Report", status: "resolved", createdAt: "2026-09-15T00:00:00.000Z", acknowledgedAt: null, resolvedAt: "2026-09-15T01:00:00.000Z", resolutionNote: "Please call the clinic" },
  ];
  const cleared = clearStaleErrors(errors, rows, attempts);
  assert.deepEqual(cleared, {});
});

test("clearStaleErrors clears the error when an acknowledge attempt becomes acknowledged or resolved", () => {
  const { clearStaleErrors } = require("../src/lib/urgent-reports");
  const errors = { r1: true, r2: true };
  const attempts = {
    r1: { type: "acknowledge" },
    r2: { type: "acknowledge" },
  };
  const rows: UrgentReport[] = [
    { id: "r1", patientId: "p", category: "other", description: "Report", status: "acknowledged", createdAt: "2026-09-15T00:00:00.000Z", acknowledgedAt: "2026-09-15T00:30:00.000Z", resolvedAt: null, resolutionNote: null },
    { id: "r2", patientId: "p", category: "other", description: "Report", status: "resolved", createdAt: "2026-09-15T00:00:00.000Z", acknowledgedAt: "2026-09-15T00:30:00.000Z", resolvedAt: "2026-09-15T01:00:00.000Z", resolutionNote: null },
  ];
  const cleared = clearStaleErrors(errors, rows, attempts);
  assert.deepEqual(cleared, {});
});

test("clearStaleErrors keeps the error for an unrelated report that is still open", () => {
  const { clearStaleErrors } = require("../src/lib/urgent-reports");
  const errors = { r1: true };
  const attempts = { r1: { type: "acknowledge" } };
  const rows: UrgentReport[] = [
    { id: "r1", patientId: "p", category: "other", description: "Still open", status: "open", createdAt: "2026-09-15T00:00:00.000Z", acknowledgedAt: null, resolvedAt: null, resolutionNote: null },
  ];
  const cleared = clearStaleErrors(errors, rows, attempts);
  assert.deepEqual(cleared, { r1: true });
});

test("normalizeNote trims and turns empty strings into null", () => {
  const { normalizeNote } = require("../src/lib/urgent-reports");
  assert.equal(normalizeNote("  Please call the clinic  "), "Please call the clinic");
  assert.equal(normalizeNote(""), null);
  assert.equal(normalizeNote("   "), null);
  assert.equal(normalizeNote(null), null);
  assert.equal(normalizeNote(undefined), null);
});
