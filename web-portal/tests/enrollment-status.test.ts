import test from "node:test";
import assert from "node:assert/strict";
import { enrollmentLines } from "../src/lib/enrollment";
import type { EnrollmentSummary } from "../src/lib/enrollment";
const s = (o: Partial<EnrollmentSummary>): EnrollmentSummary => ({
  status: "enrolled",
  screening: { eligible: true, reasons: [], flags: [], stateCode: "IL", submittedAt: "2026-09-15T00:00:00.000Z" },
  screeningCount: 1,
  consent: { version: 1, acceptedAt: "2026-09-15T00:00:00.000Z" },
  ...o,
});
test("summaries become factual labels", () => {
  const acceptedOn = new Date("2026-09-15T00:00:00.000Z").toLocaleDateString(undefined, { dateStyle: "medium" });
  assert.deepEqual(
    enrollmentLines(s({})).map((l) => l.text),
    ["Eligible (IL)", `Consent v1 accepted ${acceptedOn}`],
  );
  assert.deepEqual(
    enrollmentLines(s({ status: "screening_required", screening: null, consent: { version: 1, acceptedAt: null } })).map((l) => l.text),
    ["Eligibility not screened", "Consent v1 not accepted"],
  );
  const inel = enrollmentLines(
    s({ status: "ineligible", screening: { eligible: false, reasons: ["state", "age"], flags: [], stateCode: "NON_US", submittedAt: "2026-09-15T00:00:00.000Z" } }),
  );
  assert.equal(inel[0].text, "Not eligible: outside licensed states, under minimum age");
  assert.equal(inel[0].tone, "alert");
  assert.ok(
    enrollmentLines(
      s({ screening: { eligible: true, reasons: [], flags: ["trying_to_conceive"], stateCode: "IL", submittedAt: "2026-09-15T00:00:00.000Z" } }),
    ).some((l) => l.text === "Reported trying to conceive"),
  );
});

test('launch consent receipt mapping does not substitute a missing document with another acceptance',async()=>{
 const {consentReceipts}=await import('../src/lib/workspace');
 const receipts=consentReceipts([{key:'telehealth',version:2,versionLabel:'0.9-draft',title:'DRAFT telehealth',body:'DRAFT',sha256:'synthetic-hash',effectiveAt:'2026-11-01T12:00:00Z',acceptedAt:'2026-11-09T12:00:00Z'}]);
 assert.deepEqual(receipts.map(receipt=>receipt.accepted),[true,false,false,false]);assert.match(receipts[0].text,/0.9-draft/);assert.match(receipts[3].text,/Missing consent/);
});
