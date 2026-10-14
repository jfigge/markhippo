/*
 * Copyright 2026 Jason Figge
 *
 * This file is part of MarkHippo.
 *
 * MarkHippo is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * MarkHippo is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
 * more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with MarkHippo. If not, see <https://www.gnu.org/licenses/>.
 */

// incremental.test.js — reparse() must always answer exactly what a full
// parse of the new text would, and should take the fast path when it can.

import { test } from "node:test";
import assert from "node:assert/strict";
import { SPEC, commonMarkHippo, rng } from "./helpers.js";

const mh = commonMarkHippo();

// A long, varied document: every spec example, separated by blank lines.
const DOC = SPEC.map((e) => e.markdown).join("\n\n");

const SNIPPETS = [
  "\n", "\n\n", "```", "~~~\n", "- ", "1. ", "> ", "    ", "\t", "# ", "===\n", "---\n",
  "*", "_", "**", "`", "[x]", "]", "[x]: /y\n", "<div>", "-->", "<!--", "a", "word ", "  \n",
];

function fuzz(seed, steps) {
  const random = rng(seed);
  let text = DOC;
  let prev = mh.parse(text);
  const modes = {};
  for (let k = 0; k < steps; k++) {
    const at = random(text.length);
    const del = random(3) === 0 ? random(60) : 0;
    const next = text.slice(0, at) + SNIPPETS[random(SNIPPETS.length)] + text.slice(at + del);
    const stats = {};
    const inc = mh.reparse(prev, next, { minLines: 0, stats });
    modes[stats.mode] = (modes[stats.mode] ?? 0) + 1;
    assert.deepStrictEqual(inc, mh.parse(next), `seed ${seed}, step ${k}: edit at ${at}`);
    text = next;
    prev = inc;
  }
  return modes;
}

for (const seed of [1, 2, 3]) {
  test(`random edits equal a full parse (seed ${seed})`, () => {
    const modes = fuzz(seed, 300);
    // Most edits should not need the whole document reparsed.
    assert.ok(modes.incremental > 200, `incremental ${modes.incremental} of 300`);
  });
}

test("a local edit reparses only the blocks around it", () => {
  const blocks = Array.from({ length: 200 }, (_, i) => `Paragraph ${i} with *emphasis*.`);
  const text = blocks.join("\n\n") + "\n";
  const prev = mh.parse(text);
  const next = text.replace("Paragraph 100 with", "Paragraph 100, edited, with");
  const stats = {};
  const doc = mh.reparse(prev, next, { minLines: 0, stats });
  assert.equal(stats.mode, "incremental");
  assert.ok(stats.toLine - stats.fromLine < 10, `reparsed lines ${stats.fromLine}–${stats.toLine}`);
  assert.deepStrictEqual(doc, mh.parse(next));
  // Blocks before the region are reused as they were.
  assert.equal(doc.children[0], prev.children[0]);
});

test("opening a fence that swallows the rest falls back to a full parse", () => {
  const text = Array.from({ length: 50 }, (_, i) => `p${i}`).join("\n\n");
  const prev = mh.parse(text);
  const next = text.replace("p20", "```\np20");
  const stats = {};
  const doc = mh.reparse(prev, next, { minLines: 0, stats });
  assert.equal(stats.mode, "full");
  assert.deepStrictEqual(doc, mh.parse(next));
});

test("changing a link definition falls back to a full parse", () => {
  const text = "[a]\n\n" + Array.from({ length: 20 }, (_, i) => `p${i}`).join("\n\n") + "\n\n[a]: /one\n";
  const prev = mh.parse(text);
  const next = text.replace("/one", "/two");
  const stats = {};
  const doc = mh.reparse(prev, next, { minLines: 0, stats });
  assert.equal(stats.mode, "full");
  assert.equal(doc.children[0].children[0].destination, "/two");
});

test("small documents and no-op edits", () => {
  const prev = mh.parse("a\n\nb\n\nc\n\nd");
  const stats = {};
  mh.reparse(prev, "a\n\nb!\n\nc\n\nd", { stats });
  assert.deepEqual(stats, { mode: "full", reason: "small document" });
  const same = {};
  assert.equal(mh.reparse(prev, prev.source, { stats: same }), prev);
  assert.equal(same.mode, "unchanged");
});
