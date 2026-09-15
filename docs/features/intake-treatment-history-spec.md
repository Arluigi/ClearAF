# Intake form — treatment history section

Part of the structured medical intake (separate from the patient-facing check-in builder). This section captures prior acne treatments so the provider can make a safe, informed async treatment plan.

## Structure: repeatable "prior treatment" card

Patients typically have 2-5 prior treatments. Use an "add another treatment" repeating card pattern — not a fixed number of rows.

Each card contains:

| Field | Input type | Notes |
|---|---|---|
| Treatment name | Searchable autocomplete + free text fallback | Preload common options: benzoyl peroxide, adapalene, tretinoin, clindamycin, doxycycline, spironolactone, oral contraceptives, isotretinoin, other |
| Dose / strength | Free text | e.g. "2.5% BPO", "100mg", "40mg" |
| Duration used | Select, not free text | Options: <1 month / 1-3 months / 3-6 months / 6+ months |
| Outcome | Select, not free text | Options: worked / partially worked / no effect / made it worse |
| Reason stopped | Select | Options: ran out / side effects / didn't work / cost / other |
| Side effects experienced | Free text, optional | |

Use selects for duration, outcome, and reason stopped — the provider needs to query/filter on these later, and free text makes that unreliable.

## Standing questions (outside the repeating list)

- **Ever prescribed isotretinoin (Accutane)?** Yes/No + approximate date. Give this its own field — don't bury it in the repeating list. It carries outsized medico-legal weight.
- **Currently pregnant, trying to conceive, or breastfeeding?** (Skip if already captured in the eligibility gate upstream.)
- **Known drug allergies** — free text.

## Provider-facing summary view

Don't make the provider expand every card to get the gist. Show a compact rollup at the top of the patient's chart, in the same visual language as the existing review-queue cards:

> "3 treatments tried · most recent: doxycycline, stopped for side effects"

Expandable into the full card list on click.

## Design notes

- Repeating card add/remove needs to feel lightweight — this is the part that most often gets clunky in intake forms.
- Selects over free text wherever the answer drives clinical logic (outcome, duration, reason stopped).
- Free text is fine for side effects and dose — these are read by a human, not filtered on.
- This section sits within the larger structured intake (history, current meds, allergies, pharmacy of choice) — see the flow gap checklist for how intake fits into the overall patient journey.
