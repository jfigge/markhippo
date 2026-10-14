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
