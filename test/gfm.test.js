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

// gfm.test.js — the extension plugins: GitHub Flavored Markdown's tables,
// task lists, strikethrough, autolinks and tag filter, and footnotes,
// against cmark-gfm's examples (test/fixtures/gfm/examples.json, from
// `make gfm-fixtures`); then math and Mermaid, which GFM's suite does not
// cover, and how all of them meet the rest of the app.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMarkHippo } from "../src/js/core/host.js";
import commonmark from "../src/js/plugins/commonmark/index.js";
import code from "../src/js/plugins/code/index.js";
import tables from "../src/js/plugins/gfm/tables.js";
import taskLists from "../src/js/plugins/gfm/task-lists.js";
import strikethrough from "../src/js/plugins/gfm/strikethrough.js";
import autolinks from "../src/js/plugins/gfm/autolinks.js";
import tagFilter from "../src/js/plugins/gfm/tag-filter.js";
import footnotes from "../src/js/plugins/footnotes/index.js";
import math from "../src/js/plugins/math/index.js";
import mermaid from "../src/js/plugins/mermaid/index.js";
import { splitRow } from "../src/js/plugins/gfm/tables-parse.js";
import { rank } from "../src/js/complete/match.js";
import { SPEC, covered, find, findAll, rng } from "./helpers.js";

const EXTENSIONS = [tables, taskLists, strikethrough, autolinks, tagFilter, footnotes, math, mermaid];
const mh = createMarkHippo({ plugins: [commonmark, code, ...EXTENSIONS] });
const EXAMPLES = JSON.parse(readFileSync(new URL("./fixtures/gfm/examples.json", import.meta.url), "utf8"));

// The GFM spec writes a task checkbox as GitHub serves it, cmark-gfm's own
// tests as cmark-gfm writes it (which MarkHippo follows); compare them as
// the same element.
const normalizeInputs = (html) =>
  html.replace(/<input([^>]*?)\s*\/?>/g, (_, attrs) => `<input ${attrs.trim().split(/\s+/).sort().join(" ")}>`);

describe("GFM examples", () => {
  for (const ex of EXAMPLES) {
    test(`example ${ex.example} (${ex.source}: ${ex.extension})`, () => {
      const html = mh.render(mh.parse(ex.markdown));
      if (ex.html.trim() === "<IGNORE>") return; // only: does not throw
      assert.equal(normalizeInputs(html), normalizeInputs(ex.html));
    });
  }
});

test("every GFM example is in the suite", () => {
  assert.equal(EXAMPLES.length, 54);
});

test("with every extension on, CommonMark changes only where GFM means it to", () => {
  // GFM's own changes: bare URLs link, and disallowed tags are escaped.
  const changed = SPEC.filter((ex) => mh.render(mh.parse(ex.markdown)) !== ex.html).map((ex) => ex.section);
  assert.deepEqual([...new Set(changed)].sort(), ["Autolinks", "HTML blocks"]);
});

test("table rows split on unescaped pipes, with each cell's place in the line", () => {
  const cells = splitRow("| a \\| b | `c` |  |");
  assert.deepEqual(
    cells.map((c) => c.content.trim()),
    ["a | b", "`c`", ""],
  );
  const src = "| a \\| b | `c` |";
  const doc = mh.parse(src + "\n| - | - |\n| x | y |");
  const first = find(doc, "table_cell");
  assert.equal(covered(src, first), "a \\| b");
  // Inline positions inside a cell map past the removed backslash.
  const texts = findAll(first, "text");
  assert.equal(texts.map((t) => covered(src, t)).join(""), "a \\| b");
});

test("table positions: rows and cells cover their source, in containers too", () => {
  const src = "> | a | b |\n> |---|--:|\n> | 1 | 2 |\n";
  const doc = mh.parse(src);
  const table = find(doc, "table");
  assert.deepEqual(table.align, [null, "right"]);
  assert.equal(covered(src, table).startsWith("| a | b |"), true);
  const cells = findAll(doc, "table_cell").map((c) => covered(src, c));
  assert.deepEqual(cells, ["a", "b", "1", "2"]);
});

test("task markers: only at the start of an item's first paragraph", () => {
  const doc = mh.parse("- [x] done\n- text [ ] not\n\n[ ] not in a list\n");
  const markers = findAll(doc, "task_marker");
  assert.equal(markers.length, 1);
  assert.equal(markers[0].checked, true);
  assert.equal(markers[0].pos.start.offset, 2);
});

test("task checkboxes go live with taskAttribute, carrying their source offset", () => {
  const html = mh.render(mh.parse("- [ ] a\n- [x] b"), { taskAttribute: "data-task-z" });
  assert.match(html, /<input type="checkbox" data-task-z="2" aria-label="Done" \/> a/);
  assert.match(html, /<input type="checkbox" checked="" data-task-z="10" aria-label="Done" \/> b/);
});

test("autolinks are not made inside links, images or code", () => {
  const html = mh.render(mh.parse("[www.a.com](https://b.com) `www.c.com` ![www.d.com](x.png) www.e.com"));
  assert.equal(html.match(/<a /g).length, 2);
  assert.match(html, /<a href="http:\/\/www.e.com">www.e.com<\/a>/);
});

test("footnotes: references only where defined, numbered by first use", () => {
  const src = "B[^b] A[^a] B[^B] none[^x]\n\n[^a]: Note a.\n[^b]: Note b.\n";
  const html = mh.render(mh.parse(src));
  assert.match(html, /B<sup class="footnote-ref"><a href="#fn-b" id="fnref-b" data-footnote-ref>1<\/a><\/sup>/);
  assert.match(html, /A<sup class="footnote-ref"><a href="#fn-a" id="fnref-a" data-footnote-ref>2<\/a><\/sup>/);
  assert.match(html, /id="fnref-b-2"/);
  assert.match(html, /none\[\^x\]/);
  assert.ok(html.indexOf('<li id="fn-b">') < html.indexOf('<li id="fn-a">'));
});

// ── Fixes from reviewing phase 6 ──

test("bare links are found beside backslash escapes and entities, at their place in the source", () => {
  for (const src of ["See www.example.com \\& more", "Tom&#39;s site: https://x.com", "\\*a* https://y.org/z \\*b*"]) {
    const ast = mh.parse(src);
    const links = findAll(ast, "link");
    assert.equal(links.length, 1, src);
    assert.equal(covered(src, links[0]), links[0].destination.replace(/^http:\/\//, ""), src);
  }
  assert.equal(mh.render(mh.parse("Tom&#39;s site: https://x.com")), '<p>Tom\'s site: <a href="https://x.com">https://x.com</a></p>\n');
});

test("math and footnote references in an image's alt text are only text", () => {
  assert.equal(mh.render(mh.parse("![$x$](a.png)")), '<p><img src="a.png" alt="x" /></p>\n');
  assert.equal(mh.render(mh.parse("![see[^1]](a.png)\n\n[^1]: n")), '<p><img src="a.png" alt="see[^1]" /></p>\n');
});

test("footnotes are numbered in the order they render, notes citing notes included", () => {
  // A definition that comes first, citing a note, numbers nothing.
  const html = mh.render(mh.parse("[^a]: A, see [^b].\n\n[^b]: B.\n\nText [^a] then [^b]."));
  assert.match(html, /href="#fn-a" id="fnref-a" data-footnote-ref>1</);
  assert.match(html, /href="#fn-b" id="fnref-b" data-footnote-ref>2</);
  assert.ok(html.indexOf('<li id="fn-a">') < html.indexOf('<li id="fn-b">'));
  // A note cited again from a later note has a way back to each reference.
  const cycle = mh.render(mh.parse("Text [^a].\n\n[^a]: A cites [^b].\n\n[^b]: B cites [^a]."));
  assert.match(cycle, /id="fnref-a-2"/);
  assert.match(cycle, /href="#fnref-a-2" class="footnote-backref"/);
});

test("footnote definitions are definitions to incremental reparse", () => {
  const block = (i) => `## Section ${i}\n\nText with a note[^n${i % 5}].\n`;
  let text = "";
  for (let i = 0; i < 400; i++) text += block(i) + "\n";
  text += "\n[^n0]: zero\n\n[^n1]: one\n";
  const prev = mh.parse(text);
  // Adding a definition must reach references far away: a full parse.
  const added = text + "\n[^n2]: two\n";
  const stats = {};
  const next = mh.reparse(prev, added, { stats, minLines: 1 });
  assert.equal(stats.mode, "full");
  assert.deepEqual(next, mh.parse(added));
  // An unrelated edit is still incremental, and still right.
  const edited = text.replace("Section 200", "Section two hundred");
  const stats2 = {};
  assert.deepEqual(mh.reparse(prev, edited, { stats: stats2, minLines: 1 }), mh.parse(edited));
  assert.equal(stats2.mode, "incremental");
});

test("math: inline, display and blocks, as text until enhanced", () => {
  const html = mh.render(mh.parse("Euler: $e^{i\\pi}+1=0$, sum $$\\sum k$$, $5 and $6.\n\n$$\na<b\n$$\n\n```math\nx\n```"));
  assert.match(html, /<span class="math math-inline">e\^\{i\\pi\}\+1=0<\/span>/);
  assert.match(html, /<span class="math math-display">\\sum k<\/span>/);
  assert.match(html, /\$5 and \$6\./);
  assert.match(html, /<div class="math math-display">a&lt;b<\/div>/);
  assert.match(html, /<div class="math math-display">x<\/div>/);
});

test("mermaid fences render as their source, for the enhancer to draw", () => {
  const html = mh.render(mh.parse("```mermaid\ngraph TD\n  A --> B\n```"), { sourceLines: true });
  assert.equal(html, '<pre data-line="1" class="mh-mermaid"><code class="language-mermaid">graph TD\n  A --&gt; B\n</code></pre>\n');
});

test("each extension registers an enhancer only where the browser must finish", () => {
  assert.deepEqual(
    mh.registry.enhancers.map((e) => [e.plugin, e.selector]),
    [
      ["math", ".math"],
      ["mermaid", "pre.mh-mermaid"],
    ],
  );
});

test("the extensions suggest themselves", () => {
  const blocks = mh.complete(mh.parse("/"), "/", 1).items.map((i) => i.label);
  for (const label of ["Table", "Task list", "Footnote definition", "Math block", "Diagram"]) assert.ok(blocks.includes(label), label);
  const inline = mh.complete(mh.parse("x /"), "x /", 3).items.map((i) => i.label);
  for (const label of ["Strikethrough", "Footnote", "Math"]) assert.ok(inline.includes(label), label);
  const fence = mh.complete(mh.parse("```mer"), "```mer", 6);
  assert.equal(rank(fence.items, fence.context.query)[0].label, "mermaid");
});

test("highlighting stays well formed with every extension, on every example", () => {
  const sources = [...SPEC.map((e) => e.markdown), ...EXAMPLES.map((e) => e.markdown)];
  for (const src of sources) {
    let at = 0;
    for (const [from, to] of mh.highlight(mh.parse(src))) {
      assert.ok(from >= at && to > from && to <= src.length, JSON.stringify(src));
      at = to;
    }
  }
});

test("incremental reparse equals a full parse with every extension on", () => {
  const rand = rng(5);
  const pieces = ["| a | b |\n| - | - |\n", "- [ ] t\n", "~~s~~ ", "www.x.com ", "[^f] ", "\n[^f]: n\n", "$x$ ", "$$\n", "```mermaid\n", "\n\n", "x"];
  let text = EXAMPLES.map((e) => e.markdown).join("\n\n");
  let ast = mh.parse(text);
  for (let step = 0; step < 300; step++) {
    const at = rand(text.length + 1);
    const cut = rand(3) === 0 ? rand(8) : 0;
    text = text.slice(0, at) + (rand(4) ? pieces[rand(pieces.length)] : "") + text.slice(at + cut);
    ast = mh.reparse(ast, text, { minLines: 1 });
    assert.deepEqual(ast, mh.parse(text), `step ${step}`);
  }
});
