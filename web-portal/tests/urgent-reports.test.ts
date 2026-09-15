import test from "node:test";
import assert from "node:assert/strict";
import { categoryLabel, statusLabel } from "../src/lib/urgent-reports";

test("urgent labels are text, not colour alone", () => {
  assert.equal(categoryLabel("reaction_to_treatment"), "Reaction to a treatment");
  assert.equal(categoryLabel("rapid_worsening"), "Skin getting much worse quickly");
  assert.equal(categoryLabel("pain_or_infection"), "Pain, swelling or signs of infection");
  assert.equal(categoryLabel("other"), "Something else");
  assert.equal(statusLabel("open"), "Open");
  assert.equal(statusLabel("acknowledged"), "Seen");
  assert.equal(statusLabel("resolved"), "Resolved");
});
