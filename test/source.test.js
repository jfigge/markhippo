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

// source.test.js — line splitting and offset ↔ position mapping.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Locator, splitLines } from "../src/js/parser/source.js";

test("splitLines handles LF, CRLF, CR and a missing final newline", () => {
  assert.deepEqual(splitLines("a\nb\r\nc\rd"), { lines: ["a", "b", "c", "d"], starts: [0, 2, 5, 7] });
  assert.deepEqual(splitLines("a\n"), { lines: ["a"], starts: [0, 2] });
  assert.deepEqual(splitLines(""), { lines: [], starts: [] });
  assert.deepEqual(splitLines("\n\n"), { lines: ["", ""], starts: [0, 1, 2] });
});

test("Locator maps offsets to positions and back", () => {
  const text = "ab\r\ncd\n";
  const loc = new Locator(text);
  assert.deepEqual(loc.point(0), { line: 1, column: 1, offset: 0 });
  assert.deepEqual(loc.point(2), { line: 1, column: 3, offset: 2 });
  assert.deepEqual(loc.point(4), { line: 2, column: 1, offset: 4 });
  assert.deepEqual(loc.point(7), { line: 3, column: 1, offset: 7 });
  assert.deepEqual(loc.at(2, 2), { line: 2, column: 2, offset: 5 });
  assert.equal(loc.lineStart(3), 7);
});

test("NUL becomes U+FFFD without moving anything", async () => {
  const { commonMarkHippo } = await import("./helpers.js");
  const mh = commonMarkHippo();
  const doc = mh.parse("a\0b");
  assert.equal(doc.source, "a�b");
  assert.equal(mh.render(doc), "<p>a�b</p>\n");
});
