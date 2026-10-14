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
