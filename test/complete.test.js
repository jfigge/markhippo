/*
 * Copyright 2026 Jason Figge
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// complete.test.js — autocomplete: the context at the cursor, the
// suggestions plugins give for it, ranking, and the snippets they insert.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createMarkHippo } from "../src/js/core/host.js";
import commonmark from "../src/js/plugins/commonmark/index.js";
import code from "../src/js/plugins/code/index.js";
import { completionContext, continuation } from "../src/js/complete/context.js";
import { rank, score } from "../src/js/complete/match.js";
import { expandSnippet, wraps } from "../src/js/complete/snippet.js";

const mh = createMarkHippo({ plugins: [commonmark, code] });

// The context with the cursor at "|" in `src`.
function contextAt(src, options) {
  const offset = src.indexOf("|");
  const text = src.slice(0, offset) + src.slice(offset + 1);
  return completionContext(mh.parse(text), text, offset, options);
}

// The labels suggested at "|", best first.
function suggest(src, options) {
  const offset = src.indexOf("|");
  const text = src.slice(0, offset) + src.slice(offset + 1);
  const found = mh.complete(mh.parse(text), text, offset, options);
  return found && rank(found.items, found.context.query).map((i) => i.label);
}

test("a / at the start of a line asks for a block, inside any containers", () => {
  assert.deepEqual(contextAt("/|"), { kind: "block", from: 0, query: "", prefix: "" });
  assert.deepEqual(contextAt("para\n\n/hea|"), { kind: "block", from: 6, query: "hea", prefix: "" });
  assert.deepEqual(contextAt("> - /q|"), { kind: "block", from: 4, query: "q", prefix: ">   " });
  assert.deepEqual(contextAt("1. a\n   /|"), { kind: "block", from: 8, query: "", prefix: "   " });
});

test("a / starting a word mid-line asks for inline scaffolding", () => {
  assert.deepEqual(contextAt("some /li|"), { kind: "inline", from: 5, query: "li", prefix: "" });
  // Not in the middle of a word or a path.
  assert.equal(contextAt("and/or|"), null);
  assert.equal(contextAt("see https://x/y|"), null);
});

test("a fence's opening line asks for its language — and only that line", () => {
  assert.deepEqual(contextAt("```py|"), { kind: "fence-info", from: 3, query: "py", prefix: "" });
  assert.deepEqual(contextAt("> ~~~ |"), { kind: "fence-info", from: 6, query: "", prefix: "> " });
  assert.equal(contextAt("```js\n/|\n```"), null);
  assert.equal(contextAt("```js\nx\n```\n|", { explicit: true })?.kind, "block");
});

test("nothing is suggested in code, inline code or raw HTML", () => {
  assert.equal(contextAt("    /x|"), null);
  assert.equal(contextAt("a `b /c|`"), null);
  assert.equal(contextAt("<div>\n/x|\n</div>"), null);
  assert.equal(contextAt("    code|", { explicit: true }), null);
});

test("after ][ come the document's reference labels", () => {
  assert.deepEqual(contextAt("[a][Fo|"), { kind: "link-ref", from: 4, query: "Fo", prefix: "" });
  assert.deepEqual(suggest("[a][|\n\n[Foo  bar]: /x\n[baz]: /y\n[FOO BAR]: /z"), ["Foo bar", "baz"]);
});

test("an explicit request: blocks on an empty line, inline elsewhere", () => {
  assert.equal(contextAt("|", { explicit: true }).kind, "block");
  assert.equal(contextAt("> |", { explicit: true }).kind, "block");
  assert.equal(contextAt("text |", { explicit: true }).kind, "inline");
  assert.equal(contextAt("text |"), null);
});

test("CommonMark and the code plugin suggest for their contexts", () => {
  assert.deepEqual(suggest("/hea|").slice(0, 2), ["Heading 1", "Heading 2"]);
  assert.equal(suggest("/quo|")[0], "Quote");
  assert.equal(suggest("/hr|")[0], "Divider");
  assert.equal(suggest("x /bo|")[0], "Bold");
  assert.equal(suggest("```js|")[0], "javascript");
  assert.equal(suggest("```yml|")[0], "yaml");
  assert.deepEqual(suggest("/zzzz|"), []);
});

test("plugins add their own suggestions; a failing provider costs only its own", () => {
  const host = createMarkHippo({
    plugins: [
      commonmark,
      {
        id: "extras",
        setup(api) {
          api.completions({ context: "block", provide: () => [{ label: "Table", hint: "| a |" }, { nolabel: true }] });
          api.completions({ context: ["block", "inline"], provide: () => { throw new Error("boom"); } });
          api.completions({ context: "*", provide: (ctx) => [{ label: `Anywhere (${ctx.kind})` }] });
        },
      },
    ],
  });
  const found = host.complete(host.parse("/"), "/", 1);
  const labels = found.items.map((i) => i.label);
  assert.ok(labels.includes("Table"));
  assert.ok(labels.includes("Anywhere (block)"));
  assert.ok(labels.includes("Heading 1"));
});

test("ranking: exact, then prefix, word start, substring, initials", () => {
  const items = [{ label: "json" }, { label: "javascript", keywords: ["js"] }, { label: "Block quote" }, { label: "Bulleted list" }];
  assert.deepEqual(rank(items, "js").map((i) => i.label), ["javascript", "json"]);
  assert.deepEqual(rank(items, "quo").map((i) => i.label), ["Block quote"]);
  assert.deepEqual(rank(items, "bq").map((i) => i.label), ["Block quote"]);
  assert.equal(score("", items[0]), 0);
  assert.equal(score("xyz", items[0]), null);
  assert.equal(rank(items, "").length, 4);
});

test("snippets: placeholders, caret, $$, and the container prefix on new lines", () => {
  assert.deepEqual(expandSnippet("# ${Heading}"), { text: "# Heading", select: [2, 9] });
  assert.deepEqual(expandSnippet("```$0\n\n```", { prefix: "> " }), { text: "```\n> \n> ```", select: [3, 3] });
  assert.deepEqual(expandSnippet("costs $$5"), { text: "costs $5", select: [8, 8] });
  assert.deepEqual(expandSnippet("[${text}](${url})", { selection: "MarkHippo" }), {
    text: "[MarkHippo](url)",
    select: [12, 15],
  });
  assert.deepEqual(expandSnippet("**${bold}**", { selection: "x" }), { text: "**x**", select: [5, 5] });
});

test("list markers continue as spaces, quote markers stay", () => {
  assert.equal(continuation("> - "), ">   ");
  assert.equal(continuation("  10. > "), "      > ");
  assert.equal(continuation(""), "");
});

test("deeply nested lines stay fast (no regex backtracking)", () => {
  for (const lead of ["> ".repeat(40), "-  ".repeat(40), "1.  ".repeat(30)]) {
    const text = lead + "a /";
    const t0 = performance.now();
    completionContext(null, text, text.length, { explicit: true });
    assert.ok(performance.now() - t0 < 50, JSON.stringify(lead.slice(0, 6)));
  }
});

test("an unclosed fence still holds the empty line after it", () => {
  assert.equal(contextAt("```js\n|", { explicit: true }), null);
  assert.equal(contextAt("> ```\n> x\n> |", { explicit: true }), null);
});

test("a reference label over lines in a quote loses the quote markers", () => {
  assert.deepEqual(suggest("> [x][|\n>\n> [foo\n> bar]: /url"), ["foo bar"]);
});

test("only snippets with a placeholder can wrap a selection", () => {
  assert.ok(wraps("**${bold}**"));
  assert.ok(!wraps("```$0\n\n```"));
  assert.ok(!wraps(undefined));
});
