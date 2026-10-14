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

// highlight.test.js — the edit pane's colouring, from the AST: what each
// CommonMark construct is marked as, where code is coloured inside
// containers, and that segments are always well formed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createMarkHippo } from "../src/js/core/host.js";
import commonmark from "../src/js/plugins/commonmark/index.js";
import code from "../src/js/plugins/code/index.js";
import { flatten } from "../src/js/highlight/highlight.js";
import { Node } from "../src/js/parser/nodes.js";
import { SPEC } from "./helpers.js";

const mh = createMarkHippo({ plugins: [commonmark, code] });

// The segments of `src` as [text, className] pairs.
function colours(src) {
  return mh.highlight(mh.parse(src)).map(([from, to, cls]) => [src.slice(from, to), cls]);
}

// The class of the first segment whose text is exactly `text`.
function classOf(src, text) {
  const hit = colours(src).find(([t]) => t === text);
  return hit ? hit[1] : null;
}

test("headings: content, level and markers", () => {
  assert.deepEqual(colours("## Hi ##"), [
    ["## ", "mh-md-heading mh-md-h2 mh-md-marker"],
    ["Hi", "mh-md-heading mh-md-h2"],
    [" ##", "mh-md-heading mh-md-h2 mh-md-marker"],
  ]);
  assert.deepEqual(colours("Title\n==="), [
    ["Title", "mh-md-heading mh-md-h1"],
    ["\n===", "mh-md-heading mh-md-h1 mh-md-marker"],
  ]);
  assert.deepEqual(colours("#"), [["#", "mh-md-heading mh-md-h1 mh-md-marker"]]);
});

test("emphasis nests, its delimiters are markers", () => {
  assert.deepEqual(colours("**a *b***"), [
    ["**", "mh-md-strong mh-md-marker"],
    ["a ", "mh-md-strong"],
    ["*", "mh-md-strong mh-md-emph mh-md-marker"],
    ["b", "mh-md-strong mh-md-emph"],
    ["*", "mh-md-strong mh-md-emph mh-md-marker"],
    ["**", "mh-md-strong mh-md-marker"],
  ]);
});

test("links, images, autolinks and code spans", () => {
  assert.deepEqual(colours('[a](u "t")'), [
    ["[", "mh-md-link mh-md-marker"],
    ["a", "mh-md-link"],
    ['](u "t")', "mh-md-link mh-md-url"],
  ]);
  assert.equal(classOf("![alt](i.png)", "!["), "mh-md-image mh-md-marker");
  assert.equal(classOf("<https://x.y>", "<https://x.y>"), "mh-md-url");
  assert.deepEqual(colours("`` a ``"), [
    ["``", "mh-md-code mh-md-marker"],
    [" a ", "mh-md-code"],
    ["``", "mh-md-code mh-md-marker"],
  ]);
});

test("container markers are found on every line, past outer containers", () => {
  const src = "- a\n  > b\n  > c\n  lazy\n\n1. x\n   > > y\n   > > z";
  const quotes = colours(src).filter(([, c]) => c === "mh-md-quote");
  assert.equal(quotes.length, 6);
  const lists = colours(src).filter(([, c]) => c === "mh-md-list").map(([t]) => t);
  assert.deepEqual(lists, ["-", "1."]);
});

test("escapes and entities inside text; unknown entities stay plain", () => {
  assert.equal(classOf("a \\* b", "\\*"), "mh-md-escape");
  assert.equal(classOf("a &amp; b", "&amp;"), "mh-md-entity");
  assert.equal(classOf("a &#35; b", "&#35;"), "mh-md-entity");
  assert.equal(classOf("a &bogus; b", "&bogus;"), null);
});

test("definitions, raw HTML, breaks and thematic breaks", () => {
  assert.deepEqual(colours('[x]: /u "t"'), [
    ["[x]:", "mh-md-definition mh-md-label"],
    [" /u", "mh-md-definition mh-md-url"],
    [' "t"', "mh-md-definition mh-md-string"],
  ]);
  assert.equal(classOf("<div>\nhi\n</div>", "<div>\nhi\n</div>"), "mh-md-html");
  assert.equal(classOf("a <b>c</b>", "<b>"), "mh-md-html");
  assert.equal(classOf("a  \nb", "  \n"), "mh-md-break");
  assert.equal(classOf("***", "***"), "mh-md-hr");
});

test("a fenced block: fences, info, and code coloured in its language", () => {
  const src = "```js title\nlet x = 1\n```";
  assert.equal(classOf(src, "```"), "mh-md-codeblock mh-md-fence");
  assert.equal(classOf(src, "js title"), "mh-md-codeblock mh-md-fence mh-md-info");
  assert.equal(classOf(src, "let"), "mh-md-codeblock mh-tk-keyword");
  assert.equal(classOf(src, "1"), "mh-md-codeblock mh-tk-number");
});

test("an unclosed fence turns the rest of the document into code", () => {
  const src = "```\ncode\n\n# not a heading\n\n*not emphasis*";
  const segs = colours(src);
  assert.ok(segs.every(([, c]) => c.startsWith("mh-md-codeblock")));
  assert.equal(segs.map(([t]) => t).join(""), src);
});

test("code inside containers is coloured at the right source offsets", () => {
  const src = "> - ```py\n>   def f():\n>       return 1\n>   ```";
  assert.equal(classOf(src, "def"), "mh-md-codeblock mh-tk-keyword");
  assert.equal(classOf(src, "f"), "mh-md-codeblock mh-tk-function");
  assert.equal(classOf(src, "return"), "mh-md-codeblock mh-tk-keyword");
  // The quote markers on the code lines are still quote markers.
  assert.equal(colours(src).filter(([t, c]) => t === ">" && c.includes("mh-md-quote")).length, 4);
});

test("indented code is code; without a language it is just code", () => {
  assert.deepEqual(colours("    let x"), [["    let x", "mh-md-codeblock"]]);
  assert.deepEqual(colours("```nosuchlang\nlet x\n```").map(([, c]) => c), [
    "mh-md-codeblock mh-md-fence",
    "mh-md-codeblock mh-md-fence mh-md-info",
    "mh-md-codeblock",
    "mh-md-codeblock mh-md-fence",
  ]);
});

test("a plugin colours its own node types through api.highlighter", () => {
  const callouts = {
    id: "callouts",
    setup(api) {
      api.inlineRule({
        name: "callout",
        triggers: "@",
        parse(state) {
          const m = /^@[a-z]+/.exec(state.subject.slice(state.pos));
          if (!m) return false;
          state.add(new Node("mention", { name: m[0] }), state.pos, state.pos + m[0].length);
          state.pos += m[0].length;
          return true;
        },
      });
      api.highlighter("mention", (node, h) => h.mark(node.pos.start.offset, node.pos.end.offset, "x-mention"));
    },
  };
  const host = createMarkHippo({ plugins: [commonmark, callouts] });
  const src = "hi *@ann*";
  const segs = host.highlight(host.parse(src)).map(([f, t, c]) => [src.slice(f, t), c]);
  assert.deepEqual(segs.find(([t]) => t === "@ann"), ["@ann", "mh-md-emph mh-x-mention"]);
});

test("flatten: nested marks keep their outer-first order, adjacent equal ones merge", () => {
  const out = flatten([
    [0, 10, "a"],
    [2, 4, "b"],
    [4, 6, "b"],
    [8, 12, "c"],
  ]);
  assert.deepEqual(out, [
    [0, 2, "mh-a"],
    [2, 6, "mh-a mh-b"],
    [6, 8, "mh-a"],
    [8, 10, "mh-a mh-c"],
    [10, 12, "mh-c"],
  ]);
});

test("every spec example highlights to ordered, in-bounds, non-overlapping segments", () => {
  for (const ex of SPEC) {
    const src = ex.markdown;
    const segs = mh.highlight(mh.parse(src));
    let at = 0;
    for (const [from, to, cls] of segs) {
      assert.ok(from >= at && to > from && to <= src.length, `example ${ex.example}: [${from}, ${to})`);
      assert.match(cls, /^mh-[a-z0-9-]+(?: mh-[a-z0-9-]+)*$/);
      at = to;
    }
  }
});
