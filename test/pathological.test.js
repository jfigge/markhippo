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

// pathological.test.js — inputs built to make a parser slow. Each must
// parse (and render) in well under a second; the bounds are generous so
// a slow machine does not fail them, while quadratic behaviour still does.

import { test } from "node:test";
import assert from "node:assert/strict";
import { commonMarkHippo } from "./helpers.js";

const mh = commonMarkHippo();

const CASES = {
  "unclosed link destinations": "[a](".repeat(25000),
  "unclosed image destinations": "![a](".repeat(20000),
  "nested parentheses in destinations": "[a](b(".repeat(16000),
  "links followed by openers": "[a](b) [".repeat(12500),
  "thousands of definitions": "[a]: /u\n".repeat(40000),
  "definition labels with no destination": "[a]:\n".repeat(40000),
  "nested quotes": ">".repeat(5000) + " x",
  "nested emphasis": "*a ".repeat(10000) + "b" + " a*".repeat(10000),
  "backtick runs": Array.from({ length: 2000 }, (_, i) => "`".repeat((i % 50) + 1) + "x").join(" "),
};

for (const [name, src] of Object.entries(CASES)) {
  test(`linear enough: ${name} (${Math.round(src.length / 1000)} KB)`, () => {
    const t0 = performance.now();
    mh.render(mh.parse(src));
    const ms = performance.now() - t0;
    assert.ok(ms < 1500, `${Math.round(ms)} ms`);
  });
}
