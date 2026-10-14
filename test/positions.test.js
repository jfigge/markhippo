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

// positions.test.js — source positions on AST nodes. Highlighting,
// autocomplete context, synced scroll, the outline and the minimap all read
// them, so they are pinned down here exactly.

import { test } from "node:test";
import assert from "node:assert/strict";
import { SPEC, commonMarkHippo, covered, find, findAll } from "./helpers.js";

const mh = commonMarkHippo();

const at = (line, column, offset) => ({ line, column, offset });

test("ATX heading and its inline content", () => {
  const src = "# Hello *world*\n";
  const doc = mh.parse(src);
  const h = find(doc, "heading");
  assert.deepEqual(h.pos, { start: at(1, 1, 0), end: at(1, 16, 15) });
  assert.equal(h.level, 1);
  assert.equal(h.setext, false);
  assert.equal(covered(src, find(h, "emph")), "*world*");
  assert.equal(covered(src, find(find(h, "emph"), "text")), "world");
  assert.deepEqual(find(h, "text").pos, { start: at(1, 3, 2), end: at(1, 9, 8) });
});

test("setext heading covers its underline", () => {
  const src = "Title\nline two\n===\n\nnext";
  const h = find(mh.parse(src), "heading");
  assert.equal(h.setext, true);
  assert.equal(covered(src, h), "Title\nline two\n===");
});

test("the document spans the whole source, and the line after a final newline", () => {
  const doc = mh.parse("a\n\nb\n");
  assert.deepEqual(doc.pos, { start: at(1, 1, 0), end: at(4, 1, 5) });
  assert.deepEqual(mh.parse("").pos, { start: at(1, 1, 0), end: at(1, 1, 0) });
});

test("nested list items", () => {
  const src = "- one\n  - two\n    three\n- four\n";
  const doc = mh.parse(src);
  const items = findAll(doc, "item");
  assert.deepEqual(
    items.map((i) => covered(src, i)),
    ["- one\n  - two\n    three", "- two\n    three", "- four"],
  );
  assert.deepEqual(items[1].pos.start, at(2, 3, 8));
  const inner = findAll(doc, "paragraph")[1];
  assert.equal(covered(src, inner), "two\n    three");
});

test("trailing blank lines are not part of a list item", () => {
  const src = "- a\n\n\n- b\n";
  const items = findAll(mh.parse(src), "item");
  assert.equal(covered(src, items[0]), "- a");
});

test("an empty list item ends at its marker", () => {
  const src = "-\n- b";
  const items = findAll(mh.parse(src), "item");
  assert.equal(covered(src, items[0]), "-");
});

test("paragraph inside a block quote maps inline nodes past the > markers", () => {
  const src = "> - item `code`\n>   more [link](/u)\n";
  const doc = mh.parse(src);
  const quote = find(doc, "block_quote");
  assert.equal(covered(src, quote), src.trimEnd());
  assert.equal(covered(src, find(doc, "code")), "`code`");
  const link = find(doc, "link");
  assert.equal(covered(src, link), "[link](/u)");
  assert.deepEqual(link.pos.start, at(2, 10, 25));
  assert.equal(covered(src, find(link, "text")), "link");
  // A soft break covers its line ending only, not the next line's markers.
  const brk = find(doc, "softbreak");
  assert.deepEqual(brk.pos, { start: at(1, 16, 15), end: at(2, 1, 16) });
});

test("lazy continuation lines map to their own source", () => {
  const src = "> foo\nbar *baz*";
  const doc = mh.parse(src);
  assert.equal(covered(src, find(doc, "emph")), "*baz*");
  assert.equal(covered(src, find(doc, "paragraph")), "foo\nbar *baz*");
});

test("hard and soft line breaks", () => {
  const src = "foo  \nbar\\\nbaz\nqux";
  const doc = mh.parse(src);
  const breaks = find(doc, "paragraph").children.filter((n) => n.type !== "text");
  assert.deepEqual(
    breaks.map((b) => [b.type, covered(src, b)]),
    [
      ["linebreak", "  \n"],
      ["linebreak", "\\\n"],
      ["softbreak", "\n"],
    ],
  );
  assert.equal(covered(src, find(doc, "text")), "foo");
});

test("emphasis, strong and the delimiters left over", () => {
  const src = "***a** b* **c";
  const doc = mh.parse(src);
  const em = find(doc, "emph");
  assert.equal(covered(src, em), "***a** b*");
  assert.equal(covered(src, find(em, "strong")), "**a**");
  const texts = find(doc, "paragraph").children.filter((n) => n.type === "text");
  assert.equal(covered(src, texts[texts.length - 1]), " **c");
});

test("images, autolinks, raw HTML and entities", () => {
  const src = "![alt *x*](/i.png) <https://a.b> <span> &amp; \\*";
  const doc = mh.parse(src);
  assert.equal(covered(src, find(doc, "image")), "![alt *x*](/i.png)");
  const links = findAll(doc, "link");
  assert.equal(covered(src, links[0]), "<https://a.b>");
  assert.equal(links[0].autolink, true);
  assert.equal(covered(src, find(links[0], "text")), "https://a.b");
  assert.equal(covered(src, find(doc, "html_inline")), "<span>");
});

test("reference links and definitions", () => {
  const src = "[foo][bar]\n\n[bar]: /url 'title'\n[baz]:\n  /two\n";
  const doc = mh.parse(src);
  assert.equal(covered(src, find(doc, "link")), "[foo][bar]");
  const defs = findAll(doc, "link_reference_definition");
  assert.deepEqual(
    defs.map((d) => [covered(src, d), d.label, d.destination, d.title]),
    [
      ["[bar]: /url 'title'", "BAR", "/url", "title"],
      ["[baz]:\n  /two", "BAZ", "/two", ""],
    ],
  );
  assert.deepEqual(Object.keys(doc.refs), ["BAR", "BAZ"]);
});

test("definitions followed by paragraph text", () => {
  const src = "[a]: /u\ntext *here*";
  const doc = mh.parse(src);
  assert.equal(covered(src, find(doc, "link_reference_definition")), "[a]: /u");
  assert.equal(covered(src, find(doc, "emph")), "*here*");
  // The paragraph is what is left after its definitions, not on top of them.
  const para = find(doc, "paragraph");
  assert.equal(covered(src, para), "text *here*");
  assert.deepEqual(para.pos.start, at(2, 1, 8));

  const setext = "[a]: /u\nTitle\n===";
  assert.equal(covered(setext, find(mh.parse(setext), "heading")), "Title\n===");
});

test("fenced code blocks, closed and unclosed", () => {
  const closed = "```js\nx\n```\n";
  const block = find(mh.parse(closed), "code_block");
  assert.equal(covered(closed, block), "```js\nx\n```");
  assert.deepEqual([block.fenced, block.closed, block.info, block.fence, block.literal], [true, true, "js", "```", "x\n"]);

  const open = "> ```\n> a\n\nb\n";
  const unclosed = find(mh.parse(open), "code_block");
  assert.equal(unclosed.closed, false);
  assert.equal(covered(open, unclosed), "```\n> a");
});

test("indented code starts at its indentation and drops trailing blank lines", () => {
  const src = "    a\n    b\n\n\nc";
  const block = find(mh.parse(src), "code_block");
  assert.equal(covered(src, block), "    a\n    b");
  assert.equal(block.literal, "a\nb\n");
});

test("tabs: positions count characters, not columns", () => {
  const src = "-\tfoo\n\n\tbar\n";
  const doc = mh.parse(src);
  const paras = findAll(doc, "paragraph");
  assert.equal(covered(src, paras[0]), "foo");
  assert.deepEqual(paras[0].pos.start, at(1, 3, 2));
  assert.equal(covered(src, paras[1]), "bar");
  assert.equal(covered(src, find(paras[1], "text")), "bar");
});

test("a partly consumed tab: its leftover columns become spaces", () => {
  // The item's content starts at column 2, inside the first tab; the code
  // block's four columns of indentation end inside the second, whose two
  // leftover columns are content.
  const src = "- foo\n\n\t\tbar\n";
  const block = find(mh.parse(src), "code_block");
  assert.equal(block.literal, "  bar\n");
  assert.equal(covered(src, block), "\t\tbar");
});

test("CRLF and CR line endings", () => {
  for (const nl of ["\r\n", "\r"]) {
    const src = `# Title${nl}${nl}para *one*${nl}two${nl}`;
    const doc = mh.parse(src);
    const para = find(doc, "paragraph");
    assert.equal(covered(src, find(doc, "heading")), "# Title");
    assert.equal(covered(src, find(para, "emph")), "*one*");
    assert.deepEqual(para.pos.start, at(3, 1, 7 + 2 * nl.length));
    const brk = find(para, "softbreak");
    assert.equal(brk.pos.end.line, 4);
    assert.equal(brk.pos.end.column, 1);
    assert.equal(covered(src, find(para, "text")), "para ");
  }
});

test("every node lies inside its parent, and siblings do not overlap", () => {
  const src = [
    "# Title",
    "",
    "> quote with *emph* and `code`",
    "> - list",
    ">   1. nested **strong** [link](/x)",
    "",
    "    indented",
    "",
    "<div>",
    "html",
    "</div>",
    "",
    "Setext",
    "------",
    "",
    "[d]: /d",
  ].join("\n");
  const check = (node) => {
    let prevEnd = node.pos.start.offset;
    for (const child of node.children ?? []) {
      assert.ok(child.pos.start.offset >= node.pos.start.offset, `${child.type} starts inside ${node.type}`);
      assert.ok(child.pos.end.offset <= node.pos.end.offset, `${child.type} ends inside ${node.type}`);
      assert.ok(child.pos.start.offset >= prevEnd, `${child.type} starts after its previous sibling`);
      assert.ok(child.pos.start.offset <= child.pos.end.offset, `${child.type} is not inside out`);
      prevEnd = child.pos.end.offset;
      check(child);
    }
  };
  check(mh.parse(src));
});

test("in every spec example, children nest inside parents and follow their siblings", () => {
  for (const ex of SPEC) {
    const check = (node) => {
      let prevEnd = node.pos.start.offset;
      for (const child of node.children ?? []) {
        const where = `example ${ex.example}: ${child.type} in ${node.type}`;
        assert.ok(child.pos.start.offset >= prevEnd && child.pos.end.offset <= node.pos.end.offset, where);
        prevEnd = child.pos.end.offset;
        check(child);
      }
    };
    check(mh.parse(ex.markdown));
  }
});

test("definitions before a setext underline, in containers and with CRLF", () => {
  for (const [src, para] of [
    ["[foo]: /url\r\n===\r\n[foo]", "===\r\n[foo]"],
    ["> [foo]: /url\n> ===\n", "==="],
    ["- [foo]: /url\n  ===\n", "==="],
  ]) {
    assert.equal(covered(src, find(mh.parse(src), "paragraph")), para, JSON.stringify(src));
  }
});

test("a closing fence after a partly consumed tab ends with its line", () => {
  for (const src of [">```\n>\t```\n", "- ```\n \t```\n", ">```\r\n>\t```\r\n"]) {
    const code = find(mh.parse(src), "code_block");
    assert.ok(covered(src, code).endsWith("```"), JSON.stringify(covered(src, code)));
  }
});
