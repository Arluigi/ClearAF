import test from "node:test";
import assert from "node:assert/strict";
import { RoutineCareController } from "../src/lib/routine-care";
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
