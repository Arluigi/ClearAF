import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { read, sourceFiles } from "./letterpress-rules";

// Guards against a class name that looks like Tailwind but doesn't compile — the exact failure mode
// behind the calendar's `has-focus:` and `**:` bugs (both v4-only syntax under our pinned v3.4.17).
// Deep internals: tailwindcss ships no .d.ts for lib/lib/setupContextUtils or resolveConfig's target,
// so this goes through require() (typed `any`) rather than a typed `import`.
const require = createRequire(import.meta.url);
const { createContext } = require("tailwindcss/lib/lib/setupContextUtils");
const resolveConfig = require("tailwindcss/resolveConfig");

// Custom names that live outside corePlugins — a real @layer components/utilities class defined in
// globals.css (font-data, portal-page, selected-rule, selected-outline, editorial-title, …), or the
// group/peer marker classes (bare or named: group, group/calendar, peer/day, …). getClassOrder only
// special-cases the bare, unnamed `group`/`peer` form (Tailwind's own "parasite utility" list), so a
// named group/peer and any variant-stacked custom layer class need an explicit allowance here.
function customLayerNames(css: string): string[] {
  const names = new Set<string>();
  const re = /@layer\s+(?:components|utilities)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < css.length && depth > 0) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
      i++;
    }
    const body = css.slice(start, i - 1);
    for (const cm of body.matchAll(/\.([a-zA-Z][\w-]*)\s*\{/g)) names.add(cm[1]);
  }
  return [...names];
}

// Blank out `//` and `/* */` comments (but not lookalikes inside strings) so a code comment that
// happens to mention a class in backticks — like the ones documenting the calendar's v3/v4 fixes —
// never gets swept up as a real class-list string literal.
function stripComments(text: string): string {
  let out = "";
  let i = 0;
  let mode: "code" | "line" | "block" | "'" | '"' | "`" = "code";
  while (i < text.length) {
    const c = text[i];
    const two = text.slice(i, i + 2);
    if (mode === "code") {
      if (two === "//") { mode = "line"; out += "  "; i += 2; continue; }
      if (two === "/*") { mode = "block"; out += "  "; i += 2; continue; }
      if (c === "'" || c === '"' || c === "`") { mode = c as "'" | '"' | "`"; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (mode === "line") {
      if (c === "\n") { mode = "code"; out += "\n"; i++; continue; }
      out += " "; i++; continue;
    }
    if (mode === "block") {
      if (two === "*/") { mode = "code"; out += "  "; i += 2; continue; }
      out += c === "\n" ? "\n" : " "; i++; continue;
    }
    // inside a string/template: copy verbatim, respect backslash escapes, watch for the closing quote
    if (c === "\\") { out += text.slice(i, i + 2); i += 2; continue; }
    if (c === mode) { mode = "code"; out += c; i++; continue; }
    out += c; i++;
  }
  return out;
}

// Balanced-paren body of every call to `name(...)` in `text`.
function callBodies(text: string, name: string): string[] {
  const bodies: string[] = [];
  const re = new RegExp(`\\b${name}\\(`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < text.length && depth > 0) {
      if (text[i] === "(") depth++;
      else if (text[i] === ")") depth--;
      i++;
    }
    bodies.push(text.slice(start, i - 1));
  }
  return bodies;
}

// String-literal contents (single/double/backtick, template literals with `${}` skipped) from `body`.
function stringLiterals(body: string): string[] {
  // cva()'s `defaultVariants: { variant: "default" }` holds variant *names*, not classes.
  body = body.replace(/defaultVariants\s*:\s*\{[^}]*\}/g, "");
  const out: string[] = [];
  const re = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const s = m[1] ?? m[2] ?? m[3];
    if (s.includes("${")) continue; // template interpolation — can't resolve statically
    // Skip comparison operands, e.g. `captionLayout === "label" ? "…classes…" : "…"` — the literal is
    // a JS value being compared, not a class list.
    const before = body.slice(0, m.index).trimEnd();
    if (/(===|!==|==|!=)$/.test(before)) continue;
    out.push(s);
  }
  return out;
}

const CLASS_TOKEN = /^[^\s"'`{}]+$/;

function classesFromFile(file: string): Set<string> {
  const text = stripComments(read(file));
  const strings: string[] = [];
  for (const m of text.matchAll(/className="([^"]*)"/g)) strings.push(m[1]);
  for (const body of callBodies(text, "cn")) strings.push(...stringLiterals(body));
  for (const body of callBodies(text, "cva")) strings.push(...stringLiterals(body));
  const tokens = new Set<string>();
  for (const s of strings) for (const tok of s.split(/\s+/).filter(Boolean)) if (CLASS_TOKEN.test(tok)) tokens.add(tok);
  return tokens;
}

// src/lib helpers (like `dayBar` in worklist.ts, the bug behind fix 1) build Tailwind class strings
// outside any cn()/cva() call, so there's no call-site to anchor the .tsx extraction on. Instead, every
// string literal in the file is a *candidate*, kept only when it looks like an actual Tailwind class
// list rather than prose, an identifier or a URL — the same trust a cn()/cva() call gets implicitly.
//
// "Looks like a class list" means: every whitespace-separated token is either one of a small set of
// bare utilities that have no hyphen (block, border, …), or has a `prefix-value`/`prefix/value` shape
// starting with a lowercase letter. Natural-language copy almost never satisfies this for an entire
// literal — English sentences start with a capital letter, and even all-lowercase phrases carry short
// filler words (a, of, to, is, no, …) that are neither hyphenated nor in the bare-utility set — but a
// *single* hyphenated or slashed token (a filter key like "needs-review", an action like
// "clear-search", a MIME type like "application/json") reads identically to a real one-word class, so
// a lone token only counts when it is literally in the bare-utility set; the shape regex only applies
// once there are 2+ tokens, i.e. an actual space-joined class list. This keeps the check to one simple,
// literal-shape rule (see spec: "any literal whose every whitespace-separated token matches a class
// pattern") rather than tracing which functions get used as classNames.
const BARE_CLASS_KEYWORDS = new Set([
  "block", "inline", "inline-block", "flex", "inline-flex", "grid", "inline-grid", "contents",
  "table", "hidden", "static", "fixed", "absolute", "relative", "sticky", "border", "rounded",
  "shadow", "truncate", "italic", "underline", "uppercase", "lowercase", "capitalize",
  "container", "sr-only", "group", "peer",
]);
const CLASS_SHAPE = /^-?[a-z][\w.]*[-/][\w.%[\]/-]+$/;
function looksLikeClassToken(token: string): boolean {
  const base = token.replace(/^(?:[\w-]+:|\[[^\]]*\]:)+/, ""); // strip variant prefixes (hover:, data-[x]:, …)
  return BARE_CLASS_KEYWORDS.has(base) || CLASS_SHAPE.test(base);
}
function isClassLikeLiteral(literal: string): boolean {
  const tokens = literal.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  if (tokens.length === 1) return BARE_CLASS_KEYWORDS.has(tokens[0]);
  return tokens.every(looksLikeClassToken);
}
function classesFromLibFile(file: string): Set<string> {
  const text = stripComments(read(file));
  const tokens = new Set<string>();
  for (const literal of stringLiterals(text)) {
    if (!isClassLikeLiteral(literal)) continue;
    for (const tok of literal.split(/\s+/).filter(Boolean)) tokens.add(tok);
  }
  return tokens;
}

test("every class-like token in src/**/*.tsx and src/lib/**/*.ts compiles under Tailwind 3.4 (or is an explicit non-Tailwind hook)", () => {
  const tsxFiles = sourceFiles("src").filter((f) => f.endsWith(".tsx"));
  assert.ok(tsxFiles.length > 40, `only ${tsxFiles.length} .tsx files found`);
  const libFiles = sourceFiles("src/lib").filter((f) => f.endsWith(".ts"));
  assert.ok(libFiles.length > 5, `only ${libFiles.length} src/lib .ts files found`);

  const allow = customLayerNames(read("src/app/globals.css"));
  const escaped = allow.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  // A custom layer class, optionally behind any variant chain (aria-pressed:, data-[state=…]:, …) —
  // or a bare/named group or peer marker (group, group/calendar, peer/day, …), which mark ancestry for
  // group-*/peer-* variants elsewhere and never generate a rule of their own except in that bare form.
  const allowPattern = new RegExp(
    `^(?:[\\w-]+(?::|-\\[[^\\]]*\\]:)+)*(?:${escaped.join("|")})$|^(?:group|peer)(?:/[\\w-]+)?$`,
  );

  const perFile = new Map<string, Set<string>>();
  const allTokens = new Set<string>();
  for (const file of tsxFiles) {
    const tokens = classesFromFile(file);
    perFile.set(file, tokens);
    for (const t of tokens) if (!allowPattern.test(t)) allTokens.add(t);
  }
  for (const file of libFiles) {
    const tokens = classesFromLibFile(file);
    if (tokens.size === 0) continue;
    perFile.set(file, tokens);
    for (const t of tokens) if (!allowPattern.test(t)) allTokens.add(t);
  }

  const config = resolveConfig(require(`${process.cwd()}/tailwind.config.js`));
  const context = createContext(config);
  const order: [string, unknown][] = context.getClassOrder([...allTokens]);
  const dead = order.filter(([, o]) => o === null).map(([c]) => c);

  const withOwners = dead.map((cls) => {
    const owners = [...perFile.entries()].filter(([, s]) => s.has(cls)).map(([f]) => f);
    return `${cls} <- ${owners.join(", ")}`;
  });
  assert.deepEqual(withOwners, []);
});
