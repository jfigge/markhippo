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
 * html.js — AST to HTML.
 *
 * One consumer of the parser's tree among several. Every node type renders
 * through a function registered in the registry (`api.renderer(type, fn)`);
 * the engine itself only knows how to render the types the core parser
 * produces with no plugins at all — documents, paragraphs and text. A type
 * nobody registered renders its children, so an unknown node never loses
 * its content.
 *
 * A renderer is `fn(node, r)`, where `r` is this HtmlRenderer: it writes
 * with r.tag(), r.out() (escaped text), r.lit() (raw HTML), r.code() (a code
 * block's content, coloured when its language is known) and r.cr(), and
 * descends with r.children(node). Output matches the CommonMark reference
 * renderer byte for byte, which is what the spec suite compares against.
 *
 * Options:
 *   html         emit raw HTML (blocks and inline); off → omitted. Default true.
 *   safe         neutralise javascript:, vbscript:, file: and non-image data:
 *                URLs. Default false.
 *   sourceLines  put data-line="N" (the 1-based source line) on block
 *                elements — the hook synced scroll will use. Default false.
 *   softbreak    what a soft line break renders as. Default "\n".
 */

import { codeToHtml, languageFor, tokenizeCode } from "../highlight/code.js";

const reUnsafeProtocol = /^javascript:|vbscript:|file:|data:/i;
const reSafeDataProtocol = /^data:image\/(?:png|gif|jpeg|webp)/i;
const reNeedsEscape = /[&<>"]/;
const reEscape = /[&<>"]/g;
const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

export function escapeHtml(s) {
  return reNeedsEscape.test(s) ? s.replace(reEscape, (c) => ESCAPES[c]) : s;
}

export function potentiallyUnsafe(url) {
  return reUnsafeProtocol.test(url) && !reSafeDataProtocol.test(url);
}

const CORE_RENDERERS = {
  document: (node, r) => r.children(node),
  paragraph(node, r) {
    r.cr();
    r.tag("p", r.attrs(node));
    r.children(node);
    r.tag("/p");
    r.cr();
  },
  text: (node, r) => r.out(node.literal),
  softbreak: (node, r) => r.lit(r.options.softbreak),
};

export class HtmlRenderer {
  constructor(registry, options = {}) {
    this.registry = registry;
    this.options = { html: true, safe: false, sourceLines: false, softbreak: "\n", ...options };
  }

  render(ast) {
    this.buffer = "";
    this.lastOut = "\n";
    this.disableTags = 0;
    this.stack = [];
    this.node(ast);
    return this.buffer;
  }

  // ── For renderers ─────────────────────────────────────────────────────────

  node(node) {
    const fn = this.registry.renderers.get(node.type) ?? CORE_RENDERERS[node.type];
    if (fn) fn(node, this);
    else this.children(node);
  }

  children(node) {
    if (!node.children) return;
    this.stack.push(node);
    for (const child of node.children) this.node(child);
    this.stack.pop();
  }

  // The node `depth` levels above the one being rendered (1 = its parent).
  ancestor(depth = 1) {
    return this.stack[this.stack.length - depth] ?? null;
  }

  lit(s) {
    this.buffer += s;
    this.lastOut = s;
  }

  out(s) {
    this.lit(escapeHtml(s));
  }

  esc(s) {
    return escapeHtml(s);
  }

  // A newline, unless the output already ends with one.
  cr() {
    if (this.lastOut !== "\n") this.lit("\n");
  }

  // An HTML tag; attribute values must already be escaped. Suppressed inside
  // an image's alt text.
  tag(name, attrs, selfClosing) {
    if (this.disableTags > 0) return;
    let s = "<" + name;
    if (attrs) for (const [k, v] of attrs) s += ` ${k}="${v}"`;
    if (selfClosing) s += " /";
    this.lit(s + ">");
  }

  // The attributes every block element gets: its source line, if asked for.
  attrs(node) {
    return this.options.sourceLines && node.pos ? [["data-line", String(node.pos.start.line)]] : [];
  }

  // A code block's content as HTML: coloured, if a plugin registered the
  // language its info string names (see highlight/code.js), else just
  // escaped.
  code(literal, info) {
    const lang = languageFor(this.registry, info);
    return lang ? codeToHtml(literal, tokenizeCode(lang, literal), escapeHtml) : escapeHtml(literal);
  }

  // A URL as it should be written into an attribute.
  url(url) {
    return this.options.safe && potentiallyUnsafe(url) ? "" : escapeHtml(url);
  }
}
