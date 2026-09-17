import test from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Input } from "../src/components/ui/input";
import { Textarea } from "../src/components/ui/textarea";
import { Label } from "../src/components/ui/label";
import { Switch } from "../src/components/ui/switch";
import { ALIAS_CLASS, DIMMING_OPACITY, REMOVED_FOCUS, RETIRED_RADIUS, SHADOW_UTILITY, classesOf, has, read } from "./letterpress-rules";

const noop = () => {};

test("input is a 1.5px baseline rule, not a box", () => {
  const c = classesOf(renderToStaticMarkup(h(Input, { value: "", onChange: noop })));
  has(c, "rounded-none", "border-0", "border-b-[1.5px]", "border-rule-field", "bg-transparent", "px-0", "focus-visible:border-ink", "data-[empty=false]:border-ink", "placeholder:text-ink-tertiary");
  assert.ok(!c.has("border") && !c.has("shadow-sm"));
});

test("input derives emptiness from a controlled value only", () => {
  assert.match(renderToStaticMarkup(h(Input, { value: "", onChange: noop })), /data-empty="true"/);
  assert.match(renderToStaticMarkup(h(Input, { value: "Maya", onChange: noop })), /data-empty="false"/);
  assert.doesNotMatch(renderToStaticMarkup(h(Input, { defaultValue: "Maya" })), /data-empty/);
});

test("textarea is the bounded-editor field: square, bordered, on surface", () => {
  has(classesOf(renderToStaticMarkup(h(Textarea, {}))), "rounded-none", "border", "border-rule-field", "bg-surface", "focus-visible:border-ink");
});

test("label is the persistent mono label", () => {
  const c = classesOf(renderToStaticMarkup(h(Label, { htmlFor: "email" }, "Email")));
  has(c, "font-data", "text-[10px]", "font-medium", "uppercase", "tracking-[0.16em]", "text-ink-tertiary");
  assert.ok(!c.has("peer-disabled:opacity-70"));
});

test("switch signals state by position and fill, never hue", () => {
  const html = renderToStaticMarkup(h(Switch, { checked: true }));
  has(classesOf(html), "h-6", "w-11", "rounded-full", "border-[1.5px]", "data-[state=checked]:bg-ink", "data-[state=unchecked]:border-rule-field", "data-[state=unchecked]:bg-transparent");
  assert.match(html, /data-\[state=checked\]:bg-canvas/);
});

test("select trigger is a baseline field; highlighted items get a 2px ink outline", () => {
  const source = read("src/components/ui/select.tsx");
  for (const token of ["border-b-[1.5px]", "border-rule-field", "data-[highlighted]:bg-sunk", "data-[highlighted]:outline-2", "data-[highlighted]:outline-ink", "data-[state=checked]:font-medium"])
    assert.ok(source.includes(token), token);
  assert.doesNotMatch(source, /focus:bg-accent/);
});

test("field primitives carry no aliases, retired radii, shadows, dimming or removed focus", () => {
  for (const file of ["input", "textarea", "label", "select", "switch"]) {
    const source = read(`src/components/ui/${file}.tsx`);
    for (const pattern of [ALIAS_CLASS, RETIRED_RADIUS, SHADOW_UTILITY, DIMMING_OPACITY, REMOVED_FOCUS]) assert.doesNotMatch(source, pattern, `${file}: ${pattern}`);
  }
});
