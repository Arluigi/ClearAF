import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Class and value patterns retired by Letterpress 1.0. Shared by the primitive tests and the portal sweep.
export const ALIAS_CLASS =
  /(?<![\w-])(?:bg|text|border|ring|ring-offset|outline|fill|stroke|divide|placeholder|decoration|shadow|from|via|to)-(?:background|foreground|card|popover|primary|secondary|muted|accent|destructive|input|ring|border)(?:-foreground)?(?![\w-])/;
export const RETIRED_RADIUS = /(?<![\w-])rounded-(?:[trblse]{1,2}-)?(?:sm|md|lg|xl|2xl|3xl)(?![\w-])/;
export const SHADOW_UTILITY = /(?<![\w-])shadow(?:-(?:xs|sm|md|lg|xl|2xl|inner))?(?![\w[-])/;
export const HUE_CLASS =
  /(?<![\w-])(?:bg|text|border|ring|fill|stroke|outline|divide|decoration|from|via|to|accent|caret|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d{2,3})?(?![\w-])/;
export const HEX_COLOUR = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/;
export const DIMMING_OPACITY = /(?<![\w-])opacity-(?:50|60|70|80)(?![\w-])/;
export const REMOVED_FOCUS = /(?<![\w-])focus(?:-visible)?:(?:outline-none|ring-\d)(?![\w-])/;

const decode = (value: string) => value.replaceAll("&amp;", "&").replaceAll("&gt;", ">").replaceAll("&lt;", "<");
const split = (value: string) => decode(value).split(/\s+/).filter(Boolean);

export const classesOf = (html: string): Set<string> => new Set(split(html.match(/class="([^"]*)"/)?.[1] ?? ""));
export const allClasses = (html: string): Set<string> =>
  new Set([...html.matchAll(/class="([^"]*)"/g)].flatMap((match) => split(match[1])));

export function has(set: Set<string>, ...names: string[]): void {
  for (const name of names) assert.ok(set.has(name), `missing ${name} in: ${[...set].join(" ")}`);
}

export const read = (path: string): string => readFileSync(path, "utf8");

export function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(entry.name) ? [path] : [];
  });
}

export function offences(pattern: RegExp, files: string[]): string[] {
  return files.flatMap((file) =>
    read(file)
      .split("\n")
      .flatMap((text, index) => (pattern.test(text) ? [`${file}:${index + 1}: ${text.trim().slice(0, 160)}`] : [])),
  );
}
