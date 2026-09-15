# Clear AF — design brief

Screens and flows to design, grouped by priority. Backend/legal work (e-prescribing, pharmacy integration, HIPAA infra, licensing) isn't included here — this is the design scope only.

---

## Priority 1 — blocks safe launch

### 1. Eligibility & consent (pre-payment)
- Short screener before signup completes: state of residence, age, pregnancy status
- "Not eligible" state — clear messaging for patients outside the license footprint or otherwise excluded, plus a next step (waitlist, refund info)
- Informed consent screen with an explicit "I understand and agree" action — not buried in ToS

### 2. Non-candidate / escalation flow
- Patient-facing: a clear message when the provider determines they're not a fit for async care — not a dead end
- Provider-facing: a "refer out" / "needs in-person" action alongside "mark reviewed" on the photo review screen
- A refund/credit state tied to this outcome

### 3. Urgent flag
- Patient-facing: a visible "something's wrong" action, separate from routine messaging, clearly not counted against the monthly message limit
- Provider-facing: urgent flags need to look and sort differently from routine messages/check-ins in the queue — should surface above the normal review cadence, not get buried until the next weekly pass

---

## Priority 2 — closes the loop to treatment

### 4. Structured medical intake
- History, current meds, allergies, pharmacy of choice — separate from the existing check-in form builder
- **Treatment history sub-section** (see attached spec: `intake-treatment-history-spec.md`):
  - Repeatable "prior treatment" card: name (autocomplete + free text), dose, duration (select), outcome (select), reason stopped (select), side effects (free text)
  - Standing fields: prior isotretinoin use (own field, not buried in the list), pregnancy/TTC/breastfeeding status, drug allergies
  - Provider-facing rollup summary ("3 treatments tried · most recent: doxycycline, stopped for side effects") in the same card language as the existing review queue

### 5. Order/shipment status
- Patient-facing tracker: ordered → sent to pharmacy → shipped → delivered
- A failure/delay state (so patients aren't messaging in to ask where their medication is)

---

## Priority 3 — later, but worth a placeholder now

### 6. 3-month follow-up
- A slightly more formal version of the existing photo-compare tool
- Some outcome marker: better / same / worse, or a simple severity scale

### 7. Renewal decision
- Shown to the patient at the end of a treatment cycle: continue / adjust plan / graduate off treatment

---

## Design notes that apply across all of the above
- Reuse existing visual patterns where you can — the review queue card style, the routine-assignment card style — rather than inventing new components for each screen
- Use selects/structured inputs wherever an answer drives clinical logic (outcome, duration, eligibility); free text only where a human reads it, not where it gets filtered on
- Repeating entries (treatment history) need a lightweight add/remove pattern — this is usually where intake forms get clunky
