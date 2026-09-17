import test from "node:test";
import assert from "node:assert/strict";
import { ALIAS_CLASS, DIMMING_OPACITY, HEX_COLOUR, HUE_CLASS, REMOVED_FOCUS, RETIRED_RADIUS, SHADOW_UTILITY, offences, read, sourceFiles } from "./letterpress-rules";

const SOURCES = sourceFiles("src");
const PRIMITIVES = sourceFiles("src/components/ui");

test("the sweep reads the portal source tree", () => {
  assert.ok(SOURCES.length > 40, `only ${SOURCES.length} files found`);
});

test("no shadcn alias classes remain anywhere in the portal", () => {
  assert.deepEqual(offences(ALIAS_CLASS, SOURCES), []);
});

test("no radius between 4 and 26", () => {
  assert.deepEqual(offences(RETIRED_RADIUS, SOURCES), []);
});

test("no hue utilities or hex colours; ochre and error come from tokens", () => {
  assert.deepEqual(offences(HUE_CLASS, SOURCES), []);
  assert.deepEqual(offences(HEX_COLOUR, SOURCES), []);
});

test("content carries no shadow utilities", () => {
  assert.deepEqual(offences(SHADOW_UTILITY, SOURCES), []);
});

test("primitives keep the visible focus outline and never dim to show state", () => {
  assert.deepEqual(offences(REMOVED_FOCUS, PRIMITIVES), []);
  assert.deepEqual(offences(DIMMING_OPACITY, PRIMITIVES), []);
});

test("the alias layer is gone from globals.css and tailwind.config.js", () => {
  const css = read("src/app/globals.css");
  const tailwind = read("tailwind.config.js");
  assert.doesNotMatch(css, /--(?:background|foreground|card|popover|primary|secondary|muted|accent|destructive|ring|input)(?:-foreground)?\s*:/);
  // Matches a shadcn alias key only when it points at its own bare CSS var (how every alias was
  // originally declared, e.g. `secondary: 'rgb(var(--secondary)...)'`), not a Letterpress sub-key
  // that happens to share a word, e.g. `ink: { secondary: 'rgb(var(--ink-secondary)...)' }`.
  assert.doesNotMatch(
    tailwind,
    /(?<![\w-])(background|foreground|card|popover|primary|secondary|muted|accent|destructive|input|ring|border):\s*(?:\{\s*DEFAULT:\s*)?'rgb\(var\(--\1\)/,
  );
  assert.match(tailwind, /borderRadius:\s*{\s*none:\s*'0px',\s*DEFAULT:\s*'var\(--radius\)',\s*sheet:\s*'26px',\s*full:\s*'9999px'\s*}/);
});

test("selection utilities exist for rows and cells", () => {
  const css = read("src/app/globals.css");
  assert.match(css, /\.selected-rule\s*{[^}]*box-shadow:\s*inset 2px 0 0 rgb\(var\(--ink\)\)/);
  assert.match(css, /\.selected-outline\s*{[^}]*outline:\s*2px solid rgb\(var\(--ink\)\)/);
});
