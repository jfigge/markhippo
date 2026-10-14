// export.test.js — the document out of the app: plain text and RTF from
// the renderer's HTML (read here by test/mini-dom.js, in the app by the
// browser), the standalone HTML page, and where pasted images go.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createMarkHippo } from "../src/js/core/host.js";
import commonmark from "../src/js/plugins/commonmark/index.js";
import tables from "../src/js/plugins/gfm/tables.js";
import taskLists from "../src/js/plugins/gfm/task-lists.js";
import strikethrough from "../src/js/plugins/gfm/strikethrough.js";
import autolinks from "../src/js/plugins/gfm/autolinks.js";
import footnotes from "../src/js/plugins/footnotes/index.js";
import math from "../src/js/plugins/math/index.js";
import mermaid from "../src/js/plugins/mermaid/index.js";
import { toText } from "../src/js/export/text.js";
import { escape, toRtf } from "../src/js/export/rtf.js";
import { base64Bytes, dataImage, linkIsItsText } from "../src/js/export/tree.js";
import { PAGE_CSP, htmlPage, pageCss } from "../src/js/export/page.js";
import { altFromName, nextImageLabel, placeImage, trailingDefinitions } from "../src/js/images/embed.js";
import { normalizeLabel } from "../src/js/parser/normalize.js";
import { parseHtml } from "./mini-dom.js";

const mh = createMarkHippo({ plugins: [commonmark, tables, taskLists, strikethrough, autolinks, footnotes, math, mermaid] });
const tree = (src) => parseHtml(mh.render(mh.parse(src), { headingIds: true }));

// A 2×1 PNG.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADklEQVR4nGP4z8AAQv8BD/kD/YURmXYAAAAASUVORK5CYII=";

const SAMPLE = `# The *title*

A paragraph with **bold**, _em_, \`code\`, ~~gone~~, a [link](https://example.com "t"), www.example.com and a hard\\
break.[^n]

## Lists

- one
- two
  1. nested
  2. again
- [x] done
- [ ] to do

3. three
4. four

> quoted *text*
>
> - in a list

\`\`\`js
const x = 1;
  indented();
\`\`\`

---

| Name | Count |
|:-----|------:|
| apples | 3 |
| kiwis | 12 |

Inline $e^{i\\pi}$ and

$$
\\int_0^1 x^2\\,dx
$$

![a picture](pic.png) café 😀 {braces} \\\\ back

\`\`\`mermaid
flowchart LR
  A --> B
\`\`\`

[^n]: The note, with a [link](https://n.example).
`;

test("plain text: laid out to read, every extension included", () => {
  assert.equal(
    toText(tree(SAMPLE)),
    `The title
=========

A paragraph with bold, em, code, gone, a link (https://example.com), www.example.com and a hard
break.[1]

Lists
-----

• one
• two
  1. nested
  2. again
• [x] done
• [ ] to do

3. three
4. four

> quoted text
>
> • in a list

    const x = 1;
      indented();

* * *

Name    Count
------  -----
apples      3
kiwis      12

Inline $e^{i\\pi}$ and

$$
\\int_0^1 x^2\\,dx
$$

[Image: a picture] café 😀 {braces} \\ back

    flowchart LR
      A --> B

* * *

[1] The note, with a link (https://n.example).
`,
  );
});

test("plain text: loose lists keep their blank lines; empty documents are empty", () => {
  assert.equal(toText(tree("- a\n\n  more\n- b\n")), "• a\n\n  more\n\n• b\n");
  assert.equal(toText(tree("")), "");
  assert.equal(toText(tree("<!-- only a comment -->")), "");
});

test("a link reads as its text when the text is its address", () => {
  assert.equal(linkIsItsText("www.example.com", "http://www.example.com"), true);
  assert.equal(linkIsItsText("me@example.com", "mailto:me@example.com"), true);
  assert.equal(linkIsItsText("https://x.org/café", "https://x.org/caf%C3%A9"), true);
  assert.equal(linkIsItsText("docs", "https://example.com/docs"), false);
  assert.equal(toText(tree("Mail <me@example.com> or [me](mailto:me@example.com).")), "Mail me@example.com or me (me@example.com).\n");
});

// RTF groups balance once escaped braces are set aside.
function balanced(rtf) {
  let depth = 0;
  for (let i = 0; i < rtf.length; i++) {
    if (rtf[i] === "\\") i++;
    else if (rtf[i] === "{") depth++;
    else if (rtf[i] === "}" && --depth < 0) return false;
  }
  return depth === 0;
}

test("RTF: a well-formed document of the formatting every reader shows", () => {
  const rtf = toRtf(tree(SAMPLE), { title: "The title" });
  assert.ok(rtf.startsWith("{\\rtf1\\ansi"));
  assert.ok(balanced(rtf));
  // ASCII throughout: the rest of Unicode is \uN.
  assert.match(rtf, /^[\x20-\x7e\n]*$/);
  assert.match(rtf, /\{\\info\{\\title The title\}\}/);
  assert.match(rtf, /\\outlinelevel0\\f0\\fs22\\cf1 \\b\\fs40 The \{\\i title\}\\par/);
  for (const piece of ["{\\b bold}", "{\\i em}", "{\\strike gone}", "{\\f1\\fs19 code}", "\\line break.{\\super 1}"]) assert.ok(rtf.includes(piece), piece);
  assert.match(rtf, /\{\\field\{\\\*\\fldinst\{HYPERLINK "https:\/\/example\.com"\}\}\{\\fldrslt\{\\ul\\cf2 link\}\}\}/);
  // Lists: markers on a hanging indent, nested a step further in.
  assert.match(rtf, /\\li360\\fi-360\\tx360\\f0\\fs22\\cf1 \\u8226\?\\tab one\\par/);
  assert.match(rtf, /\\li720\\fi-360\\tx720\\f0\\fs22\\cf1 1\.\\tab nested\\par/);
  assert.match(rtf, /\\u9745\? done/);
  assert.match(rtf, /3\.\\tab three/);
  // Quotes are indented, bordered, subtler.
  assert.match(rtf, /\\brdrl\\brdrs\\brdrw24\\brsp160\\brdrcf5\\li360\\f0\\fs22\\cf3 quoted \{\\i text\}/);
  // Code keeps its spaces and lines.
  assert.ok(rtf.includes("\\f1\\fs19 const x = 1;\\line   indented();\\par"));
  // A table: three rows of two cells, the head repeated on each page.
  assert.equal(rtf.match(/\\trowd/g).length, 3);
  assert.equal(rtf.match(/\\cell\n/g).length, 6);
  assert.equal(rtf.match(/\\trhdr/g).length, 1);
  assert.match(rtf, /\\qr\\f0\\fs22\\cf1 12\\cell/);
  // Math as TeX, specials escaped; Unicode, emoji as surrogates.
  assert.ok(rtf.includes("$e^\\{i\\\\pi\\}$"));
  assert.ok(rtf.includes("caf\\u233? \\u-10179?\\u-8704? \\{braces\\} \\\\ back"));
  // An image not embedded is its alt text.
  assert.ok(rtf.includes("[Image: a picture]"));
});

test("RTF: embedded PNG and JPEG images become pictures, scaled to the page", () => {
  const rtf = toRtf(tree(`![dot](${PNG})`));
  assert.match(rtf, /\{\\pict\\pngblip\\picw2\\pich1\\picwgoal30\\pichgoal15\n89504e47/);
  // A JPEG's size is in its frame header.
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0x0b, 0xb8, 0x13, 0x88, 3, 1, 0x22, 0, 0, 0xff, 0xd9]);
  const big = dataImage(`data:image/jpeg;base64,${jpeg.toString("base64")}`);
  assert.deepEqual([big.type, big.width, big.height], ["jpeg", 5000, 3000]);
  const wide = toRtf(tree(`![photo](data:image/jpeg;base64,${jpeg.toString("base64")})`));
  assert.match(wide, /\\jpegblip\\picw5000\\pich3000\\picwgoal9000\\pichgoal5400/);
  // Formats RTF cannot carry: the alt text.
  assert.ok(toRtf(tree("![anim](data:image/gif;base64,R0lGODlh)")).includes("[Image: anim]"));
});

test("base64 and escaping", () => {
  const bytes = Buffer.from("MarkHippo ♥ RTF, and some more bytes\u0000\u00ff");
  assert.deepEqual(Buffer.from(base64Bytes(bytes.toString("base64"))), bytes);
  assert.equal(escape("a{b}\\c\td\ne"), "a\\{b\\}\\\\c d e");
  assert.equal(escape("a\tb\nc", { keepSpaces: true }), "a\\tab b\\line c");
});

test("the HTML page: self-contained, and nothing in it can run", () => {
  const page = htmlPage({ title: "A <b> & c", body: "<p>Hi</p><script>alert(1)</script>", css: "p{color:red}</style><script>x()</script>" });
  assert.ok(page.startsWith("<!DOCTYPE html>"));
  assert.ok(page.includes(`<meta http-equiv="Content-Security-Policy" content="${PAGE_CSP}">`));
  assert.match(PAGE_CSP, /default-src 'none'/);
  assert.doesNotMatch(PAGE_CSP, /script-src/);
  assert.ok(page.includes("<title>A &lt;b&gt; &amp; c</title>"));
  // The styles cannot end their element early.
  assert.equal(page.match(/<\/style>/g).length, 1);
  assert.ok(page.includes("<article class=\"mh-preview\">\n<p>Hi</p>"));
  const css = pageCss({ "--bg": "#ffffff", "--text": "#1f1f24", "bad name": "x", "--evil": "red; } body { display: none" });
  assert.match(css, /--bg: #ffffff;/);
  assert.doesNotMatch(css, /bad name|evil/);
});

// ── Images ───────────────────────────────────────────────────────────────────

const defines = (text, label) => Object.hasOwn(mh.parse(text).refs, normalizeLabel(`[${label}]`));

// The text once `placeImage`'s answer is applied, as the app applies it.
function apply(text, place) {
  const appended = text + place.append;
  return appended.slice(0, place.from) + place.insert + appended.slice(place.to);
}

test("images: labels, alt text, the definitions at the end", () => {
  assert.equal(nextImageLabel("no images"), "image-1");
  assert.equal(nextImageLabel("[image-3]: data:x\n[image-1]: data:y\n"), "image-4");
  assert.equal(altFromName("login-screen_2.png"), "login screen 2");
  assert.equal(altFromName("a [draft].jpeg"), "a \\[draft\\]");
  assert.equal(altFromName(""), "image");
  const text = "Prose.\n\n[image-1]: data:a\n[image-2]: data:b\n\n";
  assert.equal(trailingDefinitions(text), 8);
  assert.equal(trailingDefinitions("Prose.\n"), -1);
});

test("images go in as references, their data at the end, and render", () => {
  const first = placeImage("See this: ", 10, 10, { alt: "shot", url: PNG }, defines);
  const one = apply("See this: ", first);
  assert.equal(one, `See this: ![shot][image-1]\n\n[image-1]: ${PNG}\n`);
  assert.equal(one.slice(...first.select), "shot");
  assert.match(mh.render(mh.parse(one)), /<img src="data:image\/png;base64,[^"]+" alt="shot" \/>/);

  // The next joins the definitions, with no blank line between.
  const second = placeImage(one, 0, 0, { alt: "two", url: PNG }, defines);
  const two = apply(one, second);
  assert.equal(two, `![two][image-2]See this: ![shot][image-1]\n\n[image-1]: ${PNG}\n[image-2]: ${PNG}\n`);

  // At the caret in the definitions: before them, as a paragraph.
  const inside = placeImage(one, one.length, one.length, { alt: "late", url: PNG }, defines);
  const three = apply(one, inside);
  assert.equal(three, `See this: ![shot][image-1]\n\n![late][image-2]\n\n[image-1]: ${PNG}\n[image-2]: ${PNG}\n`);
  assert.equal(mh.render(mh.parse(three)).match(/<img /g).length, 2);

  // A selection is replaced.
  const sel = placeImage("a WORD b", 2, 6, { alt: "x", url: PNG }, defines);
  assert.ok(apply("a WORD b", sel).startsWith("a ![x][image-1] b\n\n"));

  // An empty document.
  assert.equal(apply("", placeImage("", 0, 0, { alt: "x", url: PNG }, defines)), `![x][image-1]\n\n[image-1]: ${PNG}\n`);
});

test("an image goes inline when a definition at the end would be swallowed", () => {
  const open = "Intro\n\n```\nunclosed fence\n";
  const place = placeImage(open, 5, 5, { alt: "x", url: PNG }, defines);
  assert.equal(place.append, "");
  const text = apply(open, place);
  assert.equal(text, `Intro![x](${PNG})\n\n\`\`\`\nunclosed fence\n`);
  assert.match(mh.render(mh.parse(text)), /<p>Intro<img src="data:image\/png/);
});
