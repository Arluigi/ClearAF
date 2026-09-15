import test from "node:test";
import assert from "node:assert/strict";
import { IdempotentAction, decisionLabel, refundLabel } from "../src/lib/care-decisions";

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

test("decision labels and refund wording", () => {
  assert.equal(decisionLabel("refer_out"), "Referred out");
  assert.equal(decisionLabel("needs_in_person"), "Needs in-person care");
  assert.equal(decisionLabel("async_care"), "Online care");
  assert.equal(refundLabel("pending"), "Refund pending");
  assert.equal(refundLabel("issued"), "Refund issued");
  assert.equal(refundLabel("not_applicable"), null);
});
