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

// plugins.test.js — the plugin seams, exercised the way a third party would:
// a new container block, a new inline delimiter, a fenced-code renderer and
// an autocomplete provider, all on top of CommonMark.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createMarkHippo } from "../src/js/core/host.js";
import commonmark from "../src/js/plugins/commonmark/index.js";
import { covered, find } from "./helpers.js";

const reOpen = /^:::[ \t]*([A-Za-z]+)?[ \t]*$/;
const reClose = /^:::[ \t]*$/;

// ::: note … ::: — an admonition: a container block, like a block quote.
const admonitions = {
  id: "admonitions",
  setup(api) {
    api.blockRule({
      type: "admonition",
      priority: 900,
      triggers: ":",
      start(parser) {
        if (parser.indented) return 0;
        const m = parser.currentLine.slice(parser.nextNonspace).match(reOpen);
        if (!m || !m[1]) return 0;
        parser.closeUnmatchedBlocks();
        const block = parser.addChild("admonition", parser.nextNonspace);
        block.kind = m[1].toLowerCase();
        parser.advanceOffset(parser.currentLine.length - parser.offset, false);
        return 1;
      },
      continue(parser, block) {
        if (!parser.indented && reClose.test(parser.currentLine.slice(parser.nextNonspace))) {
          parser.lastLineLength = parser.currentLine.length;
          parser.finalize(block, parser.lineNumber);
          return 2;
        }
        return 0;
      },
      finalize() {},
      canContain: (type, parser) => !parser.rule(type).onlyInside,
      acceptsLines: false,
    });
    api.renderer("admonition", (node, r) => {
      r.cr();
      r.tag("aside", [["class", r.esc(node.kind)]]);
      r.cr();
      r.children(node);
      r.cr();
      r.tag("/aside");
      r.cr();
    });
  },
};

// ==highlight== — a delimiter that only pairs runs of exactly two.
const highlight = {
  id: "highlight",
  setup(api) {
    api.delimiter({
      char: "=",
      matches: (opener, closer) => opener.origdelims === 2 && closer.origdelims === 2,
      use: () => 2,
      nodeType: () => "mark",
    });
    api.renderer("mark", (node, r) => {
      r.tag("mark");
      r.children(node);
      r.tag("/mark");
    });
  },
};

// ```shout — a fenced-code renderer chosen by info string.
const shout = {
  id: "shout",
  setup(api) {
    api.fenceRenderer("shout", (node, r) => {
      r.cr();
      r.tag("p", [["class", "shout"]]);
      r.out(node.literal.trim().toUpperCase());
      r.tag("/p");
      r.cr();
    });
    api.completions({ context: "fence-info", provide: () => [{ label: "shout" }] });
  },
};

const mh = createMarkHippo({ plugins: [commonmark, admonitions, highlight, shout] });

test("a plugin block: a container that holds CommonMark", () => {
  const src = "::: Note\nSome *text*.\n\n- a list\n:::\n\nafter";
  const doc = mh.parse(src);
  const box = find(doc, "admonition");
  assert.equal(box.kind, "note");
  assert.equal(covered(src, box), "::: Note\nSome *text*.\n\n- a list\n:::");
  assert.equal(
    mh.render(doc),
    '<aside class="note">\n<p>Some <em>text</em>.</p>\n<ul>\n<li>a list</li>\n</ul>\n</aside>\n<p>after</p>\n',
  );
});

test("a plugin delimiter, alongside emphasis", () => {
  const src = "a ==b *c*== d =e= f";
  const doc = mh.parse(src);
  assert.equal(covered(src, find(doc, "mark")), "==b *c*==");
  assert.equal(mh.render(doc), "<p>a <mark>b <em>c</em></mark> d =e= f</p>\n");
});

test("a fence renderer, chosen by info string", () => {
  assert.equal(mh.render(mh.parse("```shout\nhello\n```")), '<p class="shout">HELLO</p>\n');
  // Other languages still render as code.
  assert.equal(mh.render(mh.parse("```js\nx\n```")), '<pre><code class="language-js">x\n</code></pre>\n');
});

test("completion providers are collected, and a plugin's suggestions are offered", () => {
  const providers = mh.registry.completionProviders.filter((p) => p.plugin === "shout");
  assert.equal(providers.length, 1);
  assert.deepEqual(providers[0].provide(), [{ label: "shout" }]);
  const found = mh.complete(mh.parse("```"), "```", 3);
  assert.ok(found.items.some((i) => i.label === "shout"));
});

test("with no plugins, everything is plain paragraphs and text", () => {
  const bare = createMarkHippo();
  const src = "# not a heading\n*not emphasis*\n\n> not a quote";
  const doc = bare.parse(src);
  assert.deepEqual(
    doc.children.map((c) => c.type),
    ["paragraph", "paragraph"],
  );
  assert.equal(bare.render(doc), "<p># not a heading\n*not emphasis*</p>\n<p>&gt; not a quote</p>\n");
});

test("CommonMark is installed only through the public plugin API", () => {
  const recorded = [];
  const spy = new Proxy(
    {},
    {
      get: (_, name) => (...args) => recorded.push([name, args[0]?.type ?? args[0]?.name ?? args[0]?.char ?? args[0]]),
    },
  );
  commonmark.setup(spy);
  const kinds = new Set(recorded.map(([name]) => name));
  assert.deepEqual([...kinds].sort(), ["blockRule", "completions", "delimiter", "highlighter", "inlineRule", "renderer"]);
  const blocks = recorded.filter(([n]) => n === "blockRule").map(([, t]) => t);
  assert.deepEqual(blocks.sort(), ["block_quote", "code_block", "heading", "html_block", "item", "list", "paragraph", "thematic_break"]);
});

test("plugin errors are reported, not swallowed", () => {
  assert.throws(() => createMarkHippo({ plugins: [{ setup() {} }] }), /needs an id/);
  assert.throws(() => createMarkHippo({ plugins: [commonmark, commonmark] }), /already installed/);
  assert.throws(
    () => createMarkHippo({ plugins: [{ id: "bad", setup: (api) => api.blockRule({ type: "x" }) }] }),
    /missing "continue"/,
  );
});

test("a plugin's name, version, description and required flag are kept for the plugin list", () => {
  const host = createMarkHippo({ plugins: [commonmark, { id: "x", setup() {} }] });
  const [cm, x] = host.plugins;
  assert.equal(cm.name, "CommonMark");
  assert.equal(cm.version, "0.31.2");
  assert.equal(cm.required, true);
  assert.ok(cm.description.length > 0);
  assert.deepEqual(x, { id: "x", name: "x", version: null, description: "", required: false });
});
