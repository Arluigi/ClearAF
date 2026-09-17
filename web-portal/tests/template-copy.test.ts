import test from "node:test";
import assert from "node:assert/strict";
import { RoutineCareController } from "../src/lib/routine-care";
import { templateCopyAction } from "../src/lib/care-support";
test("template copies isolate steps, mark unsaved and never assign without Save", async () => {
  let saves = 0;
  const controller = new RoutineCareController({
    fetchSnapshot: async () => ({
      routines: [],
      completions: [],
      localDate: "2026-09-13",
    }),
    fetchHistory: async () => ({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    }),
    saveRevision: async () => {
      saves++;
      throw Error();
    },
  });
  await controller.load();
  const template = {
    name: "Template",
    isActive: true,
    steps: [{ title: "Step", instructions: "Text" }],
  };
  controller.copyTemplate("morning", template);
  template.steps[0].title = "Changed";
  assert.equal(
    controller.snapshot().slots.morning.draft.steps[0].title,
    "Step",
  );
  assert.equal(controller.snapshot().slots.morning.dirty, true);
  assert.equal(saves, 0);
  controller.copyTemplate("evening", { ...template, isActive: false });
  assert.equal(controller.snapshot().slots.evening.dirty, false);
});

test("templateCopyAction: a clean slot copies on the first click; a dirty slot arms, then copies on a second click to the same button", () => {
  // Clean slot: copies immediately, nothing armed afterward.
  assert.deepEqual(templateCopyAction(null, "t1:morning", false), { action: "copy", nextArmed: null });
  // Dirty slot, first click: arms that button, no copy yet.
  assert.deepEqual(templateCopyAction(null, "t1:morning", true), { action: "arm", nextArmed: "t1:morning" });
  // Same button, second click while still dirty: confirms and copies.
  assert.deepEqual(templateCopyAction("t1:morning", "t1:morning", true), { action: "copy", nextArmed: null });
  // A different button while one is armed: starts that button over at "arm", not "copy".
  assert.deepEqual(templateCopyAction("t1:morning", "t2:evening", true), { action: "arm", nextArmed: "t2:evening" });
  // The slot became clean while armed (e.g. a save landed): the next click just copies, no confirmation needed.
  assert.deepEqual(templateCopyAction("t1:morning", "t1:morning", false), { action: "copy", nextArmed: null });
});
