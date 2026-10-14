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

/*
 * spec-report.mjs — `make spec-report`: CommonMark conformance by spec
 * section, as a table. The test suite (test/spec.test.js) is what gates a
 * build; this is the at-a-glance view of it.
 *
 *     node scripts/spec-report.mjs [--failures]
 */

import { readFile } from "node:fs/promises";
import { createMarkHippo } from "../src/js/core/host.js";
import commonmark from "../src/js/plugins/commonmark/index.js";

const spec = JSON.parse(await readFile(new URL("../test/fixtures/commonmark/spec.json", import.meta.url), "utf8"));
const showFailures = process.argv.includes("--failures");
const mh = createMarkHippo({ plugins: [commonmark] });

const sections = new Map();
const failures = [];
for (const ex of spec) {
  let html;
  try {
    html = mh.render(mh.parse(ex.markdown));
  } catch (err) {
    html = `(threw: ${err.message})`;
  }
  const row = sections.get(ex.section) ?? { pass: 0, total: 0 };
  row.total++;
  if (html === ex.html) row.pass++;
  else failures.push({ ex, html });
  sections.set(ex.section, row);
}

const width = Math.max(...[...sections.keys()].map((s) => s.length));
let pass = 0;
console.log(`${"Section".padEnd(width)}   Pass   Total`);
console.log(`${"-".repeat(width)}   ----   -----`);
for (const [name, row] of sections) {
  pass += row.pass;
  const mark = row.pass === row.total ? " " : "✗";
  console.log(`${name.padEnd(width)} ${mark} ${String(row.pass).padStart(4)}   ${String(row.total).padStart(5)}`);
}
const pct = ((100 * pass) / spec.length).toFixed(1);
console.log(`\nCommonMark 0.31.2: ${pass}/${spec.length} examples pass (${pct}%)`);

if (showFailures) {
  for (const { ex, html } of failures) {
    console.log(`\n── Example ${ex.example} (${ex.section})`);
    console.log("markdown:", JSON.stringify(ex.markdown));
    console.log("expected:", JSON.stringify(ex.html));
    console.log("actual:  ", JSON.stringify(html));
  }
}
process.exitCode = failures.length ? 1 : 0;
