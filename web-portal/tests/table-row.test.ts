import test from "node:test";
import assert from "node:assert/strict";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import { read } from "./letterpress-rules";

// Regression for PR 4 final review fix 9: the row's attention/selected leading bar must be keyed off
// the <tr>'s own data attribute, with the child combinator only in front of `td:first-child`. Two
// stacked variants — `data-[x=y]:[&>td:first-child]:shadow-…` — and one combined arbitrary variant —
// `[&[data-x=y]>td:first-child]:shadow-…` — look similar in source but compile to different
// selectors, so this asserts against Tailwind's actual compiled CSS rather than the class string.
async function compiledCSSFor(className: string): Promise<string> {
  const result = await postcss([
    tailwindcss({
      content: [{ raw: `<div class="${className}"></div>`, extension: "html" }],
      corePlugins: { preflight: false },
    }),
  ]).process("@tailwind utilities;", { from: undefined });
  return result.css;
}

test("the row's attention and selected leading bars target td:first-child of a marked <tr>", async () => {
  const source = read("src/components/ui/table.tsx");
  const tokens = source.match(/\[&\[data-(?:attention|state)=(?:true|selected)\]>td:first-child\]:shadow-\[[^\]]+\]/g);
  assert.ok(tokens && tokens.length === 2, `expected two row leading-bar tokens in table.tsx, found: ${JSON.stringify(tokens)}`);

  for (const token of tokens!) {
    const css = await compiledCSSFor(token);
    // The data attribute must sit on the same compound selector as the class (the <tr>), directly
    // before the child combinator — not after it, which would require the attribute on the <td>.
    assert.match(css, /\[data-(?:attention|state)="?(?:true|selected)"?\]>td:first-child\s*\{/, `selector for ${token} does not key off the row:\n${css}`);
    assert.doesNotMatch(css, />td:first-child\[data-(?:attention|state)="?(?:true|selected)"?\]/, `selector for ${token} still keys off the cell:\n${css}`);
  }
});
