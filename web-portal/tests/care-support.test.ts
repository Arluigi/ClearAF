import test from "node:test";
import assert from "node:assert/strict";
import { RevisionEditor, LatestRead } from "../src/lib/care-support";
test("failed revision keeps exact retry identity and frozen draft", async () => {
  const calls: unknown[] = [];
  let fail = true;
  const editor = new RevisionEditor(
    { name: "A" },
    async (id, body) => {
      calls.push([id, body]);
      if (fail) throw Error();
      return { id, ...body };
    },
    () => "stable",
  );
  editor.edit({ name: "B" });
  await editor.save();
  editor.edit({ name: "C" });
  fail = false;
  await editor.save();
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(editor.snapshot().draft.name, "B");
});
test("cancelled reads never publish and new reads clear old data", async () => {
  let resolve!: (x: string) => void;
  const read = new LatestRead<string>();
  const pending = read.load(() => new Promise((r) => (resolve = r)));
  read.cancel();
  resolve("private");
  await pending;
  assert.equal(read.snapshot().data, null);
  await read.load(async () => "new");
  const next = read.load(() => new Promise((r) => (resolve = r)));
  assert.equal(read.snapshot().data, null);
  resolve("next");
  await next;
});
test("conflict rebase retains draft and requires explicit new save", async () => {
  let fail = true;
  const ids: string[] = [];
  const editor = new RevisionEditor(
    { name: "A" },
    async (id, body) => {
      ids.push(id);
      if (fail) throw { status: 409 };
      return { id, ...body };
    },
    () => String(ids.length),
  );
  editor.edit({ name: "Draft" });
  await editor.save();
  editor.rebase("latest");
  assert.equal(editor.snapshot().draft.name, "Draft");
  fail = false;
  await editor.save();
  assert.notEqual(ids[0], ids[1]);
});

test("rejected validation permits correcting the retained draft", async () => {
  const editor = new RevisionEditor({ name: "bad" }, async () => {
    throw { status: 400 };
  });
  editor.edit({ name: "invalid" });
  await editor.save();
  editor.edit({ name: "corrected" });
  assert.equal(editor.snapshot().draft.name, "corrected");
  assert.equal(editor.snapshot().pending, false);
});
test("cancelled revision completion cannot publish", async () => {
  let resolve!: (result: { id: string }) => void;
  const editor = new RevisionEditor(
    { name: "A" },
    () => new Promise((r) => (resolve = r)),
  );
  editor.edit({ name: "B" });
  const save = editor.save();
  editor.cancel();
  resolve({ id: "private" });
  await save;
  assert.equal(editor.snapshot().dirty, true);
});
