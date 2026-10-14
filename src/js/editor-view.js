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
 * editor-view.js — the markdown source pane.
 *
 * A <textarea> over a coloured copy of its text (source-highlight.js): the
 * textarea does the editing, the copy underneath shows what the parser made
 * of it. The interface is small — value in and out, a change callback,
 * the colouring, and the cursor's line and column — and the autocomplete
 * popup (autocomplete.js) attaches to it.
 *
 * The textarea never scrolls itself: it is as tall as its text, and the
 * pane around it (`scroller`) scrolls both it and the copy as one.
 */

import { SourceHighlight } from "./source-highlight.js";
import { lineStartAt } from "./highlight/lines.js";

const INDENT = "  ";

export class EditorView {
  constructor(textarea, { highlight, scroller, onChange, onCursor } = {}) {
    this.el = textarea;
    this.scroller = scroller ?? textarea;
    this.hl = new SourceHighlight(highlight);
    this.onChange = onChange ?? (() => {});
    this.onCursor = onCursor ?? (() => {});
    // After Escape, the next Tab leaves the editor instead of indenting —
    // so keyboard users are never trapped in it.
    this.tabEscapes = false;

    textarea.addEventListener("input", (e) => this.changed(e));
    textarea.addEventListener("keydown", (e) => this.keydown(e));
    for (const type of ["keyup", "click", "select", "focus"]) {
      textarea.addEventListener(type, () => this.reportCursor());
    }
    // Should the browser ever scroll the textarea inside itself, it would
    // slide off the copy underneath: the pane does the scrolling.
    textarea.addEventListener("scroll", () => this.pin());
    // Nor does it scroll the pane to keep the caret in view, so that is done
    // here, from where the coloured copy draws the caret's character.
    document.addEventListener("selectionchange", () => {
      if (document.activeElement !== textarea) return;
      this.revealCaret();
      this.autocomplete?.caretMoved();
    });
  }

  revealCaret() {
    const { selectionStart, selectionEnd, selectionDirection } = this.el;
    if (this.hl.text !== this.value) return;
    const rect = this.hl.caretRect(selectionDirection === "backward" ? selectionStart : selectionEnd);
    if (!rect) return;
    const view = this.scroller.getBoundingClientRect();
    const margin = rect.height;
    if (rect.top < view.top + margin) this.scroller.scrollTop -= view.top + margin - rect.top;
    else if (rect.bottom > view.bottom - margin) this.scroller.scrollTop += rect.bottom - view.bottom + margin;
  }

  // The autocomplete popup (autocomplete.js), once there is one: it sees
  // every edit and gets first refusal of every key.
  attach(autocomplete) {
    this.autocomplete = autocomplete;
  }

  changed(e) {
    this.hl.edit(this.value);
    this.pin();
    this.autocomplete?.input(e);
    this.onChange(this.value);
  }

  pin() {
    if (this.el.scrollTop) this.el.scrollTop = 0;
    if (this.el.scrollLeft) this.el.scrollLeft = 0;
  }

  // Colour the text with a parse's segments (highlight/highlight.js). Only
  // applies if `text` is still what the editor holds.
  highlight(text, segments) {
    if (text === this.value) this.hl.update(text, segments);
  }

  get value() {
    return this.el.value;
  }

  // Replace the whole text (opening a file, say). Moves the cursor to the
  // top and does NOT fire onChange: the caller knows what it set.
  setValue(text) {
    this.el.value = text;
    this.hl.reset(this.el.value);
    this.el.setSelectionRange(0, 0);
    this.scroller.scrollTop = 0;
    this.reportCursor();
  }

  focus() {
    this.el.focus();
  }

  // 1-based line and column of the cursor.
  cursor() {
    const before = this.el.value.slice(0, this.el.selectionStart);
    const line = before.split("\n").length;
    const column = before.length - before.lastIndexOf("\n");
    return { line, column };
  }

  reportCursor() {
    this.onCursor(this.cursor());
  }

  keydown(e) {
    if (this.autocomplete?.keydown(e)) return;
    if (e.key === "Escape") {
      this.tabEscapes = true;
      return;
    }
    if (e.key !== "Tab" || e.ctrlKey || e.metaKey || e.altKey) {
      this.tabEscapes = false;
      return;
    }
    if (this.tabEscapes) {
      this.tabEscapes = false;
      return;
    }
    e.preventDefault();
    if (e.shiftKey) this.outdent();
    else this.indent();
  }

  // Tab: indent the selected lines, or insert an indent at the cursor.
  indent() {
    const { selectionStart: start, selectionEnd: end, value } = this.el;
    if (start === end) {
      this.insert(INDENT);
      return;
    }
    const lineStart = lineStartAt(value, start);
    const block = value.slice(lineStart, end);
    const indented = block.replace(/^/gm, INDENT);
    this.replaceRange(lineStart, end, indented);
    this.el.setSelectionRange(start + INDENT.length, end + (indented.length - block.length));
  }

  // Shift+Tab: remove up to one indent from each selected line.
  outdent() {
    const { selectionStart: start, selectionEnd: end, value } = this.el;
    const lineStart = lineStartAt(value, start);
    const block = value.slice(lineStart, end);
    const outdented = block.replace(/^ {1,2}/gm, "");
    if (outdented === block) return;
    const firstRemoved = block.length - block.replace(/^ {1,2}/, "").length;
    this.replaceRange(lineStart, end, outdented);
    this.el.setSelectionRange(Math.max(lineStart, start - firstRemoved), end - (block.length - outdented.length));
  }

  insert(text) {
    const { selectionStart: start, selectionEnd: end } = this.el;
    this.replaceRange(start, end, text);
    this.el.setSelectionRange(start + text.length, start + text.length);
  }

  // Replace a range as if typed, so the browser's undo still works where it
  // can (execCommand), falling back to setRangeText.
  replaceRange(from, to, text) {
    this.el.focus();
    this.el.setSelectionRange(from, to);
    const done = typeof document.execCommand === "function" && document.execCommand("insertText", false, text);
    if (!done) {
      this.el.setRangeText(text, from, to, "end");
      this.changed();
    }
  }
}
