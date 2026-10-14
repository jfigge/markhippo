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
