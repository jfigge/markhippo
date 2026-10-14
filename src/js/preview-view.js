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
 * The HTML comes from MarkHippo's own renderer (with `safe` URLs), and the
 * page's Content-Security-Policy stops any script or inline handler in the
 * document's raw HTML from running. The CSP cannot stop everything raw HTML
 * can do, though: a <meta http-equiv="refresh"> would navigate the page
 * away (and, the document being saved, do it again on every visit), a
 * <base> would re-point every relative link, a <form> could pose as the
 * app. So the HTML is built inert in a <template> first, those elements are
 * removed there, and unsafe URLs in raw HTML's own attributes are cleared,
 * before anything reaches the page.
 *
 * Links in the document open in a new tab — never in this one, where they
 * would replace the editor — except in-document #anchors, which scroll the
 * preview.
 */

import { potentiallyUnsafe } from "./render/html.js";

// Elements raw HTML may not bring into the page at all. (Scripts, frames
// and objects are blocked by the CSP too; removing them keeps that true
// wherever the page is hosted.)
// SVG animation is among them: <set attributeName="href" to="…"> would give
// a link a new address after it was checked.
const REMOVED =
  "meta, base, link, script, style, iframe, frame, frameset, object, embed, form, portal, svg set, svg animate, svg animateMotion, svg animateTransform";
const XLINK = "http://www.w3.org/1999/xlink";
// Attributes that hold a URL something could be loaded from or run.
const URL_ATTRIBUTES = ["href", "src", "action", "formaction", "xlink:href", "poster", "background"];
// (An SVG's xlink:href is namespaced, which attribute selectors do not
// match, so SVG links and references are looked at whatever they carry.)
const URL_SELECTOR = [...URL_ATTRIBUTES.map((a) => `[${CSS.escape(a)}]`), "svg a", "svg use", "svg image"].join(", ");

export class PreviewView {
  constructor(el, scroller) {
    this.el = el;
    this.scroller = scroller ?? el;
    el.addEventListener("click", (e) => this.click(e));
  }

  update(html) {
    const template = document.createElement("template");
    template.innerHTML = html;
    sanitize(template.content);
    // Keep the reader where they were: replacing the content resets nothing
    // the browser would preserve on its own.
    const top = this.scroller.scrollTop;
    this.el.replaceChildren(template.content);
    this.scroller.scrollTop = top;
  }

  // Every link-like element is caught — HTML links, image-map areas, SVG
  // links (whose address may be xlink:href) — and never followed in place.
  click(e) {
    const a = e.target.closest("a, area");
    if (!a || !this.el.contains(a)) return;
    e.preventDefault();
    const href = a.getAttribute("href") ?? a.getAttributeNS(XLINK, "href");
    if (!href) return;
    if (href.startsWith("#")) {
      const target = href.length > 1 && this.el.querySelector(`[id="${CSS.escape(fragment(href))}"]`);
      if (target) target.scrollIntoView({ block: "start" });
      return;
    }
    let url;
    try {
      url = new URL(href, document.baseURI);
    } catch {
      return;
    }
    if (!potentiallyUnsafe(url.href)) window.open(url.href, "_blank", "noopener,noreferrer");
  }
}

// Remove what raw HTML must not do (see the top of this file).
export function sanitize(root) {
  for (const el of root.querySelectorAll(REMOVED)) {
    // A form's content can stay; the form itself goes.
    if (el.localName === "form") el.replaceWith(...el.childNodes);
    else el.remove();
  }
  for (const el of root.querySelectorAll(URL_SELECTOR)) {
    for (const name of URL_ATTRIBUTES) {
      const value = el.getAttribute(name);
      if (value !== null && potentiallyUnsafe(value)) el.removeAttribute(name);
    }
  }
}

// The id a #fragment names; a malformed escape is taken as written.
function fragment(href) {
  try {
    return decodeURIComponent(href.slice(1));
  } catch {
    return href.slice(1);
  }
}
