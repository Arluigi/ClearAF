import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
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

test("the alias layer is gone from globals.css and tailwind.config.js", async () => {
  const css = read("src/app/globals.css");
  assert.doesNotMatch(css, /--(?:background|foreground|card|popover|primary|secondary|muted|accent|destructive|ring|input)(?:-foreground)?\s*:/);
  // Read the config object itself rather than pattern-matching its source text: a regex tied to how
  // an alias key happens to be spelled (e.g. requiring it to reference its own bare CSS var) can miss
  // a key that's merely present with some other value. `accent`, `border` and `input` all slipped past
  // the old regex this way. theme.extend.colors is the actual surface Tailwind generates bg-*/text-*/…
  // utilities from, so checking its keys directly is authoritative.
  const configPath = join(process.cwd(), "tailwind.config.js");
  const config = (await import(pathToFileURL(configPath).href)).default;
  const RETIRED_ALIAS_KEYS = [
    "background", "foreground", "card", "popover", "primary", "secondary",
    "muted", "accent", "destructive", "border", "input", "ring",
  ];
  const colourKeys = Object.keys(config.theme?.extend?.colors ?? {});
  for (const key of RETIRED_ALIAS_KEYS) assert.ok(!colourKeys.includes(key), `retired alias key '${key}' present in theme.extend.colors`);
  const tailwind = read("tailwind.config.js");
  assert.match(tailwind, /borderRadius:\s*{\s*none:\s*'0px',\s*DEFAULT:\s*'var\(--radius\)',\s*sheet:\s*'26px',\s*full:\s*'9999px'\s*}/);
});

test("selection utilities exist for rows and cells", () => {
  const css = read("src/app/globals.css");
  assert.match(css, /\.selected-rule\s*{[^}]*box-shadow:\s*inset 2px 0 0 rgb\(var\(--ink\)\)/);
  assert.match(css, /\.selected-outline\s*{[^}]*outline:\s*2px solid rgb\(var\(--ink\)\)/);
});
