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

// navigation.test.js — the parser's structure for getting around: heading
// ids, the outline, the scroll map between the panes, and suggestions of
// #links to headings.

import { test } from "node:test";
import assert from "node:assert/strict";
import { commonMarkHippo } from "./helpers.js";
import { outline, sectionAt } from "../src/js/nav/outline.js";
import { scrollMap } from "../src/js/nav/scroll-map.js";
import { plainText, slugger, slugify } from "../src/js/render/slug.js";
import { rank } from "../src/js/complete/match.js";

const mh = commonMarkHippo();

test("slugs: GitHub's scheme, unique per document", () => {
  assert.equal(slugify("Hello, World!"), "hello-world");
  assert.equal(slugify("Ünïcödé — Title?"), "ünïcödé--title");
  assert.equal(slugify("snake_case and-dash"), "snake_case-and-dash");
  const slug = slugger();
  assert.deepEqual(["A", "a", "A-1", "a", "!!!", "?"].map(slug), ["a", "a-1", "a-1-1", "a-2", "section", "section-1"]);
});

test("plain text: code and emphasis kept, markup gone, breaks as spaces", () => {
  assert.equal(plainText(mh.parse("# The *`parse()`* [call](u)").children[0]), "The parse() call");
  assert.equal(plainText(mh.parse("one\\\ntwo\nthree").children[0]), "one two three");
});

test("headingIds gives preview headings ids; off by default, so spec output is unchanged", () => {
  const src = "# Intro\n\n## Intro\n\n> # Quoted *head*";
  assert.equal(mh.render(mh.parse(src)).includes("id="), false);
  const html = mh.render(mh.parse(src), { headingIds: true });
  assert.match(html, /<h1 id="intro">Intro<\/h1>/);
  assert.match(html, /<h2 id="intro-1">Intro<\/h2>/);
  assert.match(html, /<h1 id="quoted-head">Quoted <em>head<\/em><\/h1>/);
  // Every render starts afresh.
  assert.equal(mh.render(mh.parse(src), { headingIds: true }), html);
});

test("the outline: headings anywhere, in order, with the preview's ids", () => {
  const src = "# One\n\ntext\n\n- ## In a list\n\nTwo\n===\n\n### Three `x`\n";
  const items = outline(mh.parse(src));
  assert.deepEqual(
    items.map(({ level, text, id, line }) => [level, text, id, line]),
    [
      [1, "One", "one", 1],
      [2, "In a list", "in-a-list", 5],
      [1, "Two", "two", 7],
      [3, "Three x", "three-x", 10],
    ],
  );
  const html = mh.render(mh.parse(src), { headingIds: true });
  for (const h of items) assert.ok(html.includes(`id="${h.id}"`), h.id);
});

test("sectionAt: the last heading at or above a line", () => {
  const items = [{ line: 3 }, { line: 10 }, { line: 20 }];
  assert.deepEqual([1, 3, 9, 10, 19, 20, 500].map((l) => sectionAt(items, l)), [-1, 0, 0, 1, 1, 2, 2]);
  assert.equal(sectionAt([], 5), -1);
});

test("scroll map: linear between anchors, ends tied, backwards anchors dropped", () => {
  const map = scrollMap(
    [
      [100, 300],
      [150, 250], // nested: goes back in the second view
      [200, 400],
    ],
    1000,
    2000,
  );
  assert.equal(map.forward(0), 0);
  assert.equal(map.forward(50), 150);
  assert.equal(map.forward(100), 300);
  assert.equal(map.forward(150), 350);
  assert.equal(map.forward(1000), 2000);
  assert.equal(map.forward(5000), 2000);
  assert.equal(map.backward(350), 150);
  assert.equal(map.backward(2000), 1000);
  // Nothing to scroll in one view: everything maps to its top.
  assert.equal(scrollMap([[10, 10]], 0, 500).forward(300), 0);
});

test("](# suggests the document's headings by id", () => {
  const text = "# Getting started\n\n## Install it\n\nSee [install](#ins";
  const found = mh.complete(mh.parse(text), text, text.length);
  assert.equal(found.context.kind, "link-anchor");
  const best = rank(found.items, found.context.query)[0];
  assert.equal(best.label, "install-it");
  assert.equal(best.insert, "install-it)");
  assert.equal(best.detail, "## Install it");
});

test("outline ids are the preview's, whatever the whitespace; image alt text is left out", () => {
  const src = "# a  b\n\n# a b\n\n# a\tb\n\n# ![logo](x.png) Title";
  const ids = outline(mh.parse(src)).map((h) => h.id);
  const html = mh.render(mh.parse(src), { headingIds: true });
  assert.deepEqual(ids, ["a--b", "a-b", "ab", "-title"]);
  for (const id of ids) assert.ok(html.includes(`id="${id}"`), id);
});

test("sourceLines can name its attribute", () => {
  assert.match(mh.render(mh.parse("# x"), { sourceLines: "data-line-abc" }), /<h1 data-line-abc="1">/);
  assert.match(mh.render(mh.parse("# x"), { sourceLines: true }), /<h1 data-line="1">/);
});
