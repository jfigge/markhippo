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
 * source-highlight.js — the coloured copy of the source that sits under
 * the editor's <textarea>.
 *
 * The textarea stays the real editor (typing, selection, undo, IME, spell
 * and accessibility all native); its text is transparent, and this <pre>
 * underneath shows the same text, coloured, laid out identically — same
 * font, same wrapping, same box. Each source line is one block <span>
 * ending in "\n", so an edit redraws — and relays out — only the lines it
 * touched.
 *
 * On every keystroke the old colours are carried across the edit
 * (edit()), so the text underneath never lags the caret; when the parser
 * catches up, update() makes the colours exact, again redrawing only the
 * lines whose colouring changed.
 */

import { lineOf, mapEdit, sameSegments, splitByLine } from "./highlight/lines.js";
import { escapeHtml } from "./render/html.js";

const REDRAW_ALL = 300;

export class SourceHighlight {
  constructor(pre) {
    this.pre = pre;
    this.text = "";
    this.lines = [[]];
    this.template = document.createElement("template");
  }

  // New text, coloured with `segments` (or plain).
  reset(text, segments = []) {
    this.text = text;
    this.lines = splitByLine(text, segments);
    const raw = text.split("\n");
    this.pre.innerHTML = raw.map((line, i) => `<span>${lineHtml(line, this.lines[i])}</span>`).join("");
  }

  // The text was edited: keep the colours on the characters they were on.
  edit(text) {
    if (text === this.text) return;
    const { first, removed, lines } = mapEdit(this.lines, this.text, text);
    this.text = text;
    this.lines = splice(this.lines, first, removed, lines);

    let at = first === 0 ? 0 : nthLineStart(text, first);
    let html = "";
    for (const segs of lines) {
      let end = text.indexOf("\n", at);
      if (end === -1) end = text.length;
      html += `<span>${lineHtml(text.slice(at, end), segs)}</span>`;
      at = end + 1;
    }
    const children = this.pre.children;
    const before = children[first + removed] ?? null;
    for (let i = 0; i < removed && children[first]; i++) children[first].remove();
    this.template.innerHTML = html;
    this.pre.insertBefore(this.template.content, before);
  }

  // A parse of `text` finished: its exact colouring.
  update(text, segments) {
    if (text !== this.text || this.pre.children.length !== this.lines.length) {
      this.reset(text, segments);
      return;
    }
    const lines = splitByLine(text, segments);
    const changed = [];
    for (let i = 0; i < lines.length; i++) {
      if (!sameSegments(lines[i], this.lines[i])) changed.push(i);
    }
    if (!changed.length) return;
    // Many lines at once (a file pasted in, a fence opened above them all):
    // one innerHTML is far cheaper than thousands.
    if (changed.length > REDRAW_ALL) {
      this.reset(text, segments);
      return;
    }
    const raw = text.split("\n");
    const children = this.pre.children;
    for (const i of changed) children[i].innerHTML = lineHtml(raw[i], lines[i]);
    this.lines = lines;
  }

  // Where the character at `offset` is drawn, in client coordinates — the
  // caret's position, which the textarea itself cannot report.
  caretRect(offset) {
    const line = this.pre.children[lineOf(this.text, offset)];
    if (!line) return null;
    let column = offset - (this.text.lastIndexOf("\n", offset - 1) + 1);
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (column < node.length) {
        const range = document.createRange();
        range.setStart(node, column);
        range.setEnd(node, column);
        const rects = range.getClientRects();
        if (rects.length) return rects[rects.length - 1];
        break;
      }
      column -= node.length;
    }
    return line.getBoundingClientRect();
  }
}

// One line's HTML, its "\n" included. The break gives an empty line its
// height, and a block ignores a final line break, so every line is exactly
// as tall as the textarea's — the last one included.
function lineHtml(line, segs) {
  let html = "";
  let at = 0;
  for (const [from, to, className] of segs) {
    if (from > at) html += escapeHtml(line.slice(at, from));
    html += `<span class="${className}">${escapeHtml(line.slice(from, to))}</span>`;
    at = to;
  }
  return html + escapeHtml(line.slice(at)) + "\n";
}

function nthLineStart(text, n) {
  let at = 0;
  for (let k = 0; k < n; k++) at = text.indexOf("\n", at) + 1;
  return at;
}

// Array splice without spreading a possibly huge array into arguments.
function splice(array, first, removed, items) {
  if (items.length < 10000) {
    array.splice(first, removed, ...items);
    return array;
  }
  return array.slice(0, first).concat(items, array.slice(first + removed));
}
