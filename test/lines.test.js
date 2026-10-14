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

// lines.test.js — the edit pane's per-line model: splitting segments into
// lines, and carrying them across edits between parses.

import { test } from "node:test";
import assert from "node:assert/strict";
import { diffText, lineOf, mapEdit, splitByLine } from "../src/js/highlight/lines.js";
import { createMarkHippo } from "../src/js/core/host.js";
import commonmark from "../src/js/plugins/commonmark/index.js";
import code from "../src/js/plugins/code/index.js";
import { rng } from "./helpers.js";

const mh = createMarkHippo({ plugins: [commonmark, code] });
const linesOf = (text) => splitByLine(text, mh.highlight(mh.parse(text)));

// Apply a mapEdit result to `lines`.
function apply(lines, old, text) {
  const { first, removed, lines: fresh } = mapEdit(lines, old, text);
  const out = lines.slice();
  out.splice(first, removed, ...fresh);
  return out;
}

// The coloured text of each line, for readable expectations.
const show = (text, lines) =>
  text.split("\n").map((line, i) => lines[i].map(([f, t, c]) => [line.slice(f, t), c.replace(/mh-md-/g, "")]));

test("splitByLine cuts segments at line ends and makes them line-relative", () => {
  const text = "ab\ncd\n";
  const lines = splitByLine(text, [[1, 5, "x"]]);
  assert.deepEqual(lines, [[[1, 2, "x"]], [[0, 2, "x"]], []]);
  assert.deepEqual(splitByLine("", []), [[]]);
});

test("diffText and lineOf", () => {
  assert.deepEqual(diffText("hello", "help"), { from: 3, oldTo: 5, newTo: 4 });
  assert.deepEqual(diffText("aaa", "aaaa"), { from: 3, oldTo: 3, newTo: 4 });
  assert.equal(lineOf("a\nb\nc", 0), 0);
  assert.equal(lineOf("a\nb\nc", 2), 1);
  assert.equal(lineOf("a\nb\nc", 3), 1);
  assert.equal(lineOf("a\nb\nc", 4), 2);
});

test("typing at the end of a heading keeps it a heading", () => {
  const old = "# Hi\n\ntext";
  const text = "# Hit\n\ntext";
  assert.deepEqual(show(text, apply(linesOf(old), old, text))[0], [
    ["# ", "heading h1 marker"],
    ["Hit", "heading h1"],
  ]);
});

test("typing inside a coloured stretch widens it; deleting it narrows it", () => {
  const old = "a **bold** b";
  const typed = "a **bo-ld** b";
  assert.deepEqual(show(typed, apply(linesOf(old), old, typed))[0][1], ["bo-ld", "strong"]);
  const deleted = "a **bd** b";
  assert.deepEqual(show(deleted, apply(linesOf(old), old, deleted))[0][1], ["bd", "strong"]);
});

test("a new line splits a line's colours; joining lines joins them", () => {
  const old = "# Heading";
  const text = "# Hea\nding";
  const lines = apply(linesOf(old), old, text);
  assert.equal(lines.length, 2);
  assert.deepEqual(show(text, lines), [
    [
      ["# ", "heading h1 marker"],
      ["Hea", "heading h1"],
    ],
    [["ding", "heading h1"]],
  ]);
  const back = apply(lines, text, old);
  assert.deepEqual(show(old, back)[0].map(([t]) => t).join(""), "# Heading");
});

test("lines after an edit keep their colours untouched", () => {
  const old = "para\n\n# One\n\n# Two";
  const text = "para, longer\nand more\n\n# One\n\n# Two";
  const before = linesOf(old);
  const after = apply(before, old, text);
  assert.deepEqual(after.slice(-3), before.slice(-3));
});

test("random edits always give one well-formed entry per line", () => {
  const rand = rng(7);
  const pieces = ["#", " ", "*", "`", "\n", "a", "b", "```", ">", "-", "[x](y)", "\n\n"];
  let text = "# Title\n\nSome *text* and `code`.\n\n```js\nlet x = 1\n```\n";
  let lines = linesOf(text);
  for (let step = 0; step < 2000; step++) {
    const at = rand(text.length + 1);
    const cut = rand(4) === 0 ? rand(6) : 0;
    const insert = rand(3) === 0 ? "" : pieces[rand(pieces.length)];
    const next = text.slice(0, at) + insert + text.slice(Math.min(text.length, at + cut));
    lines = apply(lines, text, next);
    text = next;
    const raw = text.split("\n");
    assert.equal(lines.length, raw.length, `step ${step}`);
    lines.forEach((segs, i) => {
      let end = 0;
      for (const [f, t] of segs) {
        assert.ok(f >= end && t > f && t <= raw[i].length, `step ${step}, line ${i}`);
        end = t;
      }
    });
    // Now and then the parser catches up.
    if (rand(10) === 0) lines = linesOf(text);
  }
});
