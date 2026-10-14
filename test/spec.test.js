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

// spec.test.js — the CommonMark 0.31.2 spec examples, compared byte for
// byte with the reference HTML. `make spec-report` prints the pass rate by
// section.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { KNOWN_FAILURES, SPEC, commonMarkHippo } from "./helpers.js";

const mh = commonMarkHippo();

const sections = new Map();
for (const ex of SPEC) {
  if (!sections.has(ex.section)) sections.set(ex.section, []);
  sections.get(ex.section).push(ex);
}

for (const [section, examples] of sections) {
  describe(section, () => {
    for (const ex of examples) {
      const known = KNOWN_FAILURES[ex.example];
      test(`example ${ex.example}`, { todo: known }, () => {
        assert.equal(mh.render(mh.parse(ex.markdown)), ex.html);
      });
    }
  });
}

test("every example is in the suite", () => {
  assert.equal(SPEC.length, 652);
});
