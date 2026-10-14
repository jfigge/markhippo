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
 * scroll-sync.js — keeping the editor and the preview at the same place.
 *
 * Scrolling either pane scrolls the other to match, through the anchors of
 * nav/scroll-map.js: each preview element the renderer marked with its
 * source line (data-line) is paired with that line's top in the editor.
 * The anchors are measured lazily — after a render, an edit or a resize
 * they are only marked stale — so scrolling costs a binary search.
 *
 * A programmatic scroll fires a scroll event of its own; the position it
 * was set to is remembered, and the event that reports it is not synced
 * back (no feedback loop, no jitter).
 */

import { scrollMap } from "./nav/scroll-map.js";

export class ScrollSync {
  // `editor`: the EditorView; `preview`: the preview's scroller; `content`:
  // the rendered document; `onScroll`: called after either pane scrolls.
  constructor({ editor, preview, content, onScroll }) {
    this.editor = editor;
    this.preview = preview;
    this.content = content;
    this.onScroll = onScroll ?? (() => {});
    this.enabled = true;
    this.map = null;
    this.expect = new Map();
    editor.scroller.addEventListener("scroll", () => this.scrolled(editor.scroller, preview, "forward"), { passive: true });
    preview.addEventListener("scroll", () => this.scrolled(preview, editor.scroller, "backward"), { passive: true });
    new ResizeObserver(() => this.invalidate()).observe(editor.scroller);
    new ResizeObserver(() => this.invalidate()).observe(preview);
  }

  invalidate() {
    this.map = null;
  }

  setEnabled(on) {
    this.enabled = on;
    if (on) this.scrolled(this.editor.scroller, this.preview, "forward");
  }

  scrolled(from, to, direction) {
    const expected = this.expect.get(from);
    if (expected !== undefined) {
      this.expect.delete(from);
      if (Math.abs(from.scrollTop - expected) < 2) {
        this.onScroll();
        return;
      }
    }
    if (this.enabled) this.follow(from, to, direction);
    this.onScroll();
  }

  follow(from, to, direction) {
    const map = this.measure();
    const top = Math.round(map[direction](from.scrollTop));
    if (Math.abs(to.scrollTop - top) < 1) return;
    to.scrollTop = top;
    // What the browser actually settled on (clamped), not what was asked.
    this.expect.set(to, to.scrollTop);
  }

  // Scroll the preview to source `line` (the outline's jumps), as an
  // anchor-exact position rather than a mapped one.
  previewToLine(line) {
    const el = [...this.content.querySelectorAll("[data-line]")].find((e) => Number(e.dataset.line) >= line);
    if (!el) return;
    this.preview.scrollTop = this.offsetIn(el) - 8;
    this.expect.set(this.preview, this.preview.scrollTop);
  }

  measure() {
    if (this.map) return this.map;
    const pairs = [];
    for (const el of this.content.querySelectorAll("[data-line]")) {
      pairs.push([this.editor.lineTop(Number(el.dataset.line)), this.offsetIn(el)]);
    }
    const ed = this.editor.scroller;
    this.map = scrollMap(pairs, ed.scrollHeight - ed.clientHeight, this.preview.scrollHeight - this.preview.clientHeight);
    return this.map;
  }

  // An element's top in the preview's scrolled content.
  offsetIn(el) {
    return el.getBoundingClientRect().top - this.preview.getBoundingClientRect().top + this.preview.scrollTop;
  }
}
