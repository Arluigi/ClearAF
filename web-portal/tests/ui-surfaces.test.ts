import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../src/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "../src/components/ui/tabs";
import { Card } from "../src/components/ui/card";
import { Alert } from "../src/components/ui/alert";
import { ALIAS_CLASS, DIMMING_OPACITY, HUE_CLASS, REMOVED_FOCUS, RETIRED_RADIUS, SHADOW_UTILITY, allClasses, classesOf, has, read } from "./letterpress-rules";

const table = renderToStaticMarkup(
  h(Table, null,
    h(TableHeader, null, h(TableRow, null, h(TableHead, null, "Patient"), h(TableHead, null, "Adherence"))),
    h(TableBody, null, h(TableRow, null, h(TableCell, null, "Maya"), h(TableCell, { numeric: true }, "79%")))),
);

test("table: 2px ink rule under the head, 1px rules between rows, no zebra", () => {
  const c = allClasses(table);
  has(c, "[&_tr]:border-b-2", "[&_tr]:border-ink", "border-b", "border-rule");
  for (const name of c) assert.doesNotMatch(name, /^(?:even|odd):/, name);
});

test("table head is the mono eyebrow; numeric cells are mono tabular figures", () => {
  const c = allClasses(table);
  has(c, "font-data", "text-[10px]", "uppercase", "tracking-[0.16em]", "text-ink-tertiary", "tabular-nums", "text-xs");
  assert.doesNotMatch(table, /numeric=/);
});

test("table rows mark selection and attention without relying on tone", () => {
  const source = read("src/components/ui/table.tsx");
  // The data attribute and the child combinator must be in the SAME arbitrary variant so the
  // attribute stays keyed to the <tr>; see tests/table-row.test.ts for the compiled-selector proof.
  assert.ok(source.includes("[&[data-state=selected]>td:first-child]:shadow-[inset_2px_0_0_rgb(var(--ink))]"));
  assert.ok(source.includes("[&[data-attention=true]>td:first-child]:shadow-[inset_4px_0_0_rgb(var(--attention-mark))]"));
});

const tabs = (variant?: "segmented" | "underline") =>
  renderToStaticMarkup(h(Tabs, { defaultValue: "a" }, h(TabsList, { variant }, h(TabsTrigger, { value: "a" }, "Needs review"), h(TabsTrigger, { value: "b" }, "Flagged"))));

test("segmented tabs: square sunk track, surface thumb with the spec shadow and an ink hairline", () => {
  const html = tabs();
  has(allClasses(html), "bg-sunk", "rounded-none", "data-[state=active]:bg-surface", "data-[state=active]:font-medium", "data-[state=active]:shadow-[0_1px_2px_rgba(18,19,18,.14),inset_0_0_0_1px_rgb(var(--ink)/0.5)]", "min-h-8");
});

test("underline tabs: 2px ink rule under the list, active tab adds its own 2px ink rule", () => {
  has(allClasses(tabs("underline")), "border-b-2", "border-ink", "data-[state=active]:border-ink", "data-[state=active]:font-medium");
  assert.ok(!allClasses(tabs("underline")).has("bg-sunk"));
});

test("card and alert are square with no shadow", () => {
  has(classesOf(renderToStaticMarkup(h(Card, null, "x"))), "rounded-none", "bg-surface", "text-ink");
  has(classesOf(renderToStaticMarkup(h(Alert, null, "x"))), "rounded-none", "border-l-2", "border-ink");
  has(classesOf(renderToStaticMarkup(h(Alert, { variant: "destructive" }, "x"))), "border-error", "text-error");
});

test("menus: square hairline popover, highlighted items get a 2px ink outline", () => {
  const source = read("src/components/ui/dropdown-menu.tsx");
  for (const token of ["rounded-none border border-ink/30 bg-surface", "data-[highlighted]:outline-2", "data-[highlighted]:outline-ink", "data-[highlighted]:bg-sunk"]) assert.ok(source.includes(token), token);
});

test("dialog is square, bordered in ink, over a paper scrim", () => {
  const source = read("src/components/ui/dialog.tsx");
  for (const token of ["bg-canvas/80", "rounded-none border border-ink bg-surface"]) assert.ok(source.includes(token), token);
});

test("avatar fallback is an ink disc with mono initials; calendar cells are square with an outlined today", () => {
  assert.ok(read("src/components/ui/avatar.tsx").includes("rounded-full bg-ink font-data text-[11px] font-medium text-canvas"));
  const calendar = read("src/components/ui/calendar.tsx");
  for (const token of ["outline-[1.5px]", "data-[selected-single=true]:bg-ink", "text-ink-future"]) assert.ok(calendar.includes(token), token);
});

test("surface primitives carry no aliases, retired radii, shadows, hues, dimming or removed focus", () => {
  for (const file of ["table", "tabs", "card", "alert", "dialog", "dropdown-menu", "avatar", "calendar"]) {
    const source = read(`src/components/ui/${file}.tsx`);
    for (const pattern of [ALIAS_CLASS, RETIRED_RADIUS, SHADOW_UTILITY, HUE_CLASS, DIMMING_OPACITY, REMOVED_FOCUS]) assert.doesNotMatch(source, pattern, `${file}: ${pattern}`);
  }
});

test("the unused chart primitive and recharts are gone", () => {
  assert.equal(existsSync("src/components/ui/chart.tsx"), false);
  assert.doesNotMatch(read("package.json"), /"recharts"/);
});
