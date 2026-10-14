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
 * preview-view.js — the rendered document.
 *
 * The HTML comes from MarkHippo's own renderer (with `safe` URLs) and the
 * page's Content-Security-Policy stops any script or inline handler in the
 * document's raw HTML from running. Links in the document open in a new tab
 * — never in this one, where they would replace the editor — except
 * in-document #anchors, which scroll the preview.
 */

export class PreviewView {
  constructor(el, scroller) {
    this.el = el;
    this.scroller = scroller ?? el;
    el.addEventListener("click", (e) => this.click(e));
  }

  update(html) {
    // Keep the reader where they were: replacing the content resets nothing
    // the browser would preserve on its own.
    const top = this.scroller.scrollTop;
    this.el.innerHTML = html;
    this.scroller.scrollTop = top;
  }

  click(e) {
    const a = e.target.closest("a[href]");
    if (!a || !this.el.contains(a)) return;
    const href = a.getAttribute("href");
    e.preventDefault();
    if (href.startsWith("#")) {
      const target = href.length > 1 && this.el.querySelector(`[id="${CSS.escape(decodeURIComponent(href.slice(1)))}"]`);
      if (target) target.scrollIntoView({ block: "start" });
      return;
    }
    if (href) window.open(a.href, "_blank", "noopener,noreferrer");
  }
}
