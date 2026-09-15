import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { IdempotentAction, canMarkRefund, careStatusView, decisionBody, decisionLabel, refundLabel, showsPatientMessage } from "../src/lib/care-decisions";
import type { CareDecision } from "../src/lib/care-decisions";
import type { PaginatedResponse } from "../src/types/api";

test("lost response retries the identical id and body; success clears the attempt", async () => {
  const calls: unknown[] = [];
  let fail = true;
  const action = new IdempotentAction(
    async (id: string, body: { decision: string }) => {
      calls.push([id, body]);
      if (fail) throw new Error("lost");
      return { id, ...body };
    },
    () => "fixed",
  );
  await action.submit({ decision: "refer_out" });
  assert.equal(action.snapshot().status, "error");
  await action.submit({ decision: "needs_in_person" }); // ignored: the frozen attempt is retried
  fail = false;
  await action.submit({ decision: "needs_in_person" });
  assert.deepEqual(calls, [
    ["fixed", { decision: "refer_out" }],
    ["fixed", { decision: "refer_out" }],
    ["fixed", { decision: "refer_out" }],
  ]);
  assert.equal(action.snapshot().status, "saved");
  assert.equal(action.frozenBody, null);
});

test("validation rejection releases the attempt for a corrected draft", async () => {
  let n = 0;
  const action = new IdempotentAction(async () => {
    throw { status: 400 };
  }, () => String(++n));
  await action.submit({ x: 1 });
  assert.equal(action.frozenBody, null);
  assert.match(action.snapshot().error, /rejected/);
});

test("cancel ignores a late result", async () => {
  let resolve!: (v: unknown) => void;
  const action = new IdempotentAction(() => new Promise((r) => { resolve = r; }));
  const pending = action.submit({ x: 1 });
  action.cancel();
  resolve({});
  await pending;
  assert.equal(action.snapshot().status, "saving");
});

test("the current decision and its refund action stay visible while browsing older history pages", () => {
  const current: CareDecision = {
    id: "newest",
    patientId: "p",
    clinicianId: "c",
    clinicianName: "Dr. Lee",
    decision: "refer_out",
    patientMessage: null,
    photoId: null,
    refundStatus: "pending",
    refundUpdatedAt: null,
    createdAt: "2026-09-15T00:00:00.000Z",
  };
  const older: CareDecision = { ...current, id: "older", decision: "async_care", refundStatus: "not_applicable", createdAt: "2026-09-01T00:00:00.000Z" };
  const currentPage: PaginatedResponse<CareDecision> = { data: [current], pagination: { page: 1, limit: 20, total: 21, totalPages: 2 } };
  const historyPageTwo: PaginatedResponse<CareDecision> = { data: [older], pagination: { page: 2, limit: 20, total: 21, totalPages: 2 } };
  const view = careStatusView(currentPage, historyPageTwo, 2);
  assert.deepEqual(view.current, current);
  assert.equal(view.currentKind, "refer_out");
  assert.equal(view.canOfferRefund, true);
  assert.deepEqual(view.historyRows, [older]); // page 2 rows are shown as-is, not sliced
});

test("page 1 history excludes the current row", () => {
  const current: CareDecision = {
    id: "newest",
    patientId: "p",
    clinicianId: "c",
    clinicianName: "Dr. Lee",
    decision: "async_care",
    patientMessage: null,
    photoId: null,
    refundStatus: "not_applicable",
    refundUpdatedAt: null,
    createdAt: "2026-09-15T00:00:00.000Z",
  };
  const older: CareDecision = { ...current, id: "older", createdAt: "2026-09-01T00:00:00.000Z" };
  const page: PaginatedResponse<CareDecision> = { data: [current, older], pagination: { page: 1, limit: 20, total: 2, totalPages: 1 } };
  const view = careStatusView(page, page, 1);
  assert.deepEqual(view.historyRows, [older]);
  assert.equal(view.canOfferRefund, false);
});

test("decision labels and refund wording", () => {
  assert.equal(decisionLabel("refer_out"), "Referred out");
  assert.equal(decisionLabel("needs_in_person"), "Needs in-person care");
  assert.equal(decisionLabel("async_care"), "Online care");
  assert.equal(refundLabel("pending"), "Refund pending");
  assert.equal(refundLabel("issued"), "Refund issued");
  assert.equal(refundLabel("not_applicable"), null);
});

const decision = (o: Partial<CareDecision>): CareDecision => ({
  id: "d",
  patientId: "p",
  clinicianId: "c",
  clinicianName: "Dr. Lee",
  decision: "refer_out",
  patientMessage: null,
  photoId: null,
  refundStatus: "pending",
  refundUpdatedAt: null,
  createdAt: "2026-09-15T00:00:00.000Z",
  ...o,
});

test("any decision with a pending refund offers Mark refund issued, including history rows", () => {
  // Refer out, then resume online care: the earlier refund is still pending on a history row.
  const resumed = decision({ id: "resumed", decision: "async_care", refundStatus: "not_applicable" });
  const referred = decision({ id: "referred", decision: "refer_out", refundStatus: "pending", createdAt: "2026-09-10T00:00:00.000Z" });
  const issued = decision({ id: "issued", decision: "needs_in_person", refundStatus: "issued", createdAt: "2026-09-05T00:00:00.000Z" });
  const online = decision({ id: "online", decision: "async_care", refundStatus: "not_applicable", createdAt: "2026-09-01T00:00:00.000Z" });
  const page: PaginatedResponse<CareDecision> = { data: [resumed, referred, issued, online], pagination: { page: 1, limit: 20, total: 4, totalPages: 1 } };
  const view = careStatusView(page, page, 1);
  assert.equal(view.canOfferRefund, false);
  assert.deepEqual(view.historyRows.filter(canMarkRefund).map((d) => d.id), ["referred"]);
  assert.equal(canMarkRefund(issued), false);
  assert.equal(canMarkRefund(online), false);
  assert.equal(canMarkRefund(referred), true);
  // After issuing, the refetched row no longer offers the action anywhere.
  const after = careStatusView(page, { ...page, data: [resumed, { ...referred, refundStatus: "issued" }, issued, online] }, 1);
  assert.deepEqual(after.historyRows.filter(canMarkRefund), []);
});

test("online care carries no patient message; other decisions send a non-blank message as typed", () => {
  assert.equal(showsPatientMessage("async_care"), false);
  assert.equal(showsPatientMessage("refer_out"), true);
  assert.equal(showsPatientMessage("needs_in_person"), true);
  assert.deepEqual(decisionBody("async_care", "Typed before switching", null), { decision: "async_care", patientMessage: null, photoId: null });
  assert.deepEqual(decisionBody("refer_out", "   ", "photo-1"), { decision: "refer_out", patientMessage: null, photoId: "photo-1" });
  assert.deepEqual(decisionBody("needs_in_person", "Book a visit", null), { decision: "needs_in_person", patientMessage: "Book a visit", photoId: null });
});

test("a save that settles after the dialog closed is reported so the card can refresh; its state is still ignored", async () => {
  let resolve!: (v: unknown) => void;
  const late = new IdempotentAction(() => new Promise((r) => { resolve = r; }));
  const pending = late.submit({ x: 1 });
  late.cancel();
  resolve({});
  assert.equal(await pending, "cancelled");
  assert.equal(late.snapshot().status, "saving");
  let reject!: (e: unknown) => void;
  const lost = new IdempotentAction(() => new Promise((_, r) => { reject = r; }));
  const failing = lost.submit({ x: 1 });
  lost.cancel();
  reject(new Error("lost"));
  assert.equal(await failing, "cancelled");
  assert.equal(await new IdempotentAction(async () => ({})).submit({ x: 1 }), "saved");
});

test("the dialog promises no notification and says where the patient sees the decision", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/components/patients/CareDecisionDialog.tsx"), "utf8");
  assert.doesNotMatch(source, /notif/i);
  assert.match(source, /The patient sees this on their Today screen\./);
});
