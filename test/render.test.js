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

// render.test.js — renderer options: raw HTML, safe URLs, source lines.

import { test } from "node:test";
import assert from "node:assert/strict";
import { commonMarkHippo } from "./helpers.js";
import { escapeHtml, potentiallyUnsafe } from "../src/js/render/html.js";

const mh = commonMarkHippo();
const render = (src, options) => mh.render(mh.parse(src), options);

test("raw HTML is emitted by default and omitted with html: false", () => {
  const src = "<div>\nblock\n</div>\n\ninline <b>bold</b>";
  assert.equal(render(src), "<div>\nblock\n</div>\n<p>inline <b>bold</b></p>\n");
  assert.equal(
    render(src, { html: false }),
    "<!-- raw HTML omitted -->\n<p>inline <!-- raw HTML omitted -->bold<!-- raw HTML omitted --></p>\n",
  );
});

test("safe: true neutralises script-bearing URLs but keeps image data URLs", () => {
  const src = "[a](javascript:alert(1)) [b](VBScript:x) [c](file:///etc) ![d](data:image/png;base64,AA) [e](data:text/html,x) [f](https://ok)";
  const html = render(src, { safe: true });
  assert.match(html, /<a href="">a<\/a>/);
  assert.match(html, /<a href="">b<\/a>/);
  assert.match(html, /<a href="">c<\/a>/);
  assert.match(html, /<img src="data:image\/png;base64,AA" alt="d" \/>/);
  assert.match(html, /<a href="">e<\/a>/);
  assert.match(html, /<a href="https:\/\/ok">f<\/a>/);
  // Off by default: the spec renders what it is given.
  assert.match(render("[a](javascript:x)"), /href="javascript:x"/);
});

test("sourceLines: true marks block elements with their source line", () => {
  const src = "# Title\n\npara\n\n- a\n- b\n\n```js\nx\n```\n\n> q\n\n***";
  const html = render(src, { sourceLines: true });
  assert.equal(
    html,
    [
      '<h1 data-line="1">Title</h1>',
      '<p data-line="3">para</p>',
      '<ul data-line="5">',
      '<li data-line="5">a</li>',
      '<li data-line="6">b</li>',
      "</ul>",
      '<pre data-line="8"><code class="language-js">x',
      "</code></pre>",
      '<blockquote data-line="12">',
      '<p data-line="12">q</p>',
      "</blockquote>",
      '<hr data-line="14" />',
      "",
    ].join("\n"),
  );
});

test("helpers", () => {
  assert.equal(escapeHtml(`<a href="x">&</a>`), "&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
  assert.equal(potentiallyUnsafe("javascript:x"), true);
  assert.equal(potentiallyUnsafe("data:image/gif;base64,AA"), false);
  assert.equal(potentiallyUnsafe("/relative"), false);
});

test("safe: unsafe schemes are judged as a browser reads them, and only as schemes", () => {
  const mh = commonMarkHippo();
  const html = (src) => mh.render(mh.parse(src), { safe: true });
  // In raw HTML's attributes (checked by the preview) a browser drops tabs
  // and line breaks, and leading spaces and controls.
  assert.ok(potentiallyUnsafe("java\tscript:alert(1)"));
  assert.ok(potentiallyUnsafe(" \x01JavaScript:alert(1)"));
  assert.ok(potentiallyUnsafe("vbscript:x"));
  assert.ok(!potentiallyUnsafe("data:image/png;base64,AAAA"));
  // A link destination is percent-encoded first, which defuses it anyway.
  assert.equal(html("[x](java&#9;script:alert(1))"), '<p><a href="java%09script:alert(1)">x</a></p>\n');
  assert.equal(html("[x](https://example.com/?next=data:x)"), '<p><a href="https://example.com/?next=data:x">x</a></p>\n');
  assert.equal(html("[x](https://example.com/file:x)"), '<p><a href="https://example.com/file:x">x</a></p>\n');
});
