import test from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button, type ButtonProps } from "../src/components/ui/button";
import { Badge, type BadgeProps } from "../src/components/ui/badge";
import { ALIAS_CLASS, DIMMING_OPACITY, REMOVED_FOCUS, RETIRED_RADIUS, SHADOW_UTILITY, classesOf, has, read } from "./letterpress-rules";

const button = (props: ButtonProps = {}) => classesOf(renderToStaticMarkup(h(Button, props, "Save")));
const badge = (props: BadgeProps = {}) => classesOf(renderToStaticMarkup(h(Badge, props, "Archived")));

test("filled is ink with canvas text, radius 4, 36px, 13px medium label", () => {
  has(button(), "bg-ink", "text-canvas", "rounded", "min-h-9", "text-[13px]", "font-medium");
});

test("outlined is a 1px ink border at 32% with ink text", () => {
  for (const variant of ["outline", "secondary"] as const) has(button({ variant }), "border", "border-ink/[0.32]", "text-ink", "bg-transparent");
});

test("link is always underlined with a 3px offset", () => {
  const c = button({ variant: "link" });
  has(c, "underline", "underline-offset-[3px]", "text-ink");
  assert.ok(!c.has("hover:underline"));
});

test("destructive is outlined in error, never a filled hue", () => {
  const c = button({ variant: "destructive" });
  has(c, "border", "border-error", "text-error");
  assert.ok(!c.has("bg-error"));
});

test("portal sizes stay in the 32–36px band; lg is the 44px full-width action", () => {
  has(button({ size: "sm" }), "min-h-8");
  has(button({ size: "default" }), "min-h-9");
  has(button({ size: "lg" }), "min-h-11");
  has(button({ size: "icon" }), "h-9", "w-9");
});

test("disabled is sunk with ink.tertiary, not reduced opacity", () => {
  has(button(), "disabled:bg-sunk", "disabled:text-ink-tertiary");
  has(button({ variant: "outline" }), "disabled:border-transparent");
  has(button({ variant: "link" }), "disabled:bg-transparent");
});

test("badges are square mono chips; attention is wash plus attention text", () => {
  has(badge(), "rounded-none", "font-data", "text-[11px]", "uppercase", "tabular-nums", "border-ink/30");
  has(badge({ variant: "secondary" }), "bg-sunk", "text-ink-secondary");
  has(badge({ variant: "destructive" }), "border-error", "text-error");
  has(badge({ variant: "attention" }), "bg-attention-wash", "text-attention-text");
});

test("button and badge sources carry no aliases, retired radii, shadows, dimming or removed focus", () => {
  for (const file of ["button", "badge"]) {
    const source = read(`src/components/ui/${file}.tsx`);
    for (const pattern of [ALIAS_CLASS, RETIRED_RADIUS, SHADOW_UTILITY, DIMMING_OPACITY, REMOVED_FOCUS]) assert.doesNotMatch(source, pattern, `${file}: ${pattern}`);
  }
});
