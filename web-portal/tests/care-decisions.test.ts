import test from "node:test";
import assert from "node:assert/strict";
import { IdempotentAction, careStatusView, decisionLabel, refundLabel } from "../src/lib/care-decisions";
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
