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
 * code.js — colouring the code in fenced blocks, for the preview and the
 * edit pane alike.
 *
 * Languages are registered by plugins (`api.language(spec)`):
 *
 *   { id: "python", name: "Python", aliases: ["py"], tokenize(code) }
 *
 * where tokenize(code) answers the coloured stretches of `code` as
 * [from, to, token] triples — in order, not overlapping, and leaving plain
 * text out. A token is a short name ("keyword", "string", "comment"…) that
 * becomes the class mh-tk-<token> in both panes, so one stylesheet rule
 * colours a keyword the same way everywhere.
 */

const CACHE_SIZE = 256;
const reToken = /^[a-z][a-z0-9-]*$/;
const caches = new WeakMap();

// The language a fenced block's info string names, or null: the first word,
// case-insensitively.
export function languageFor(registry, info) {
  if (!info) return null;
  const word = info.trim().split(/\s/, 1)[0].toLowerCase();
  return (word && registry.languages.get(word)) || null;
}

// The tokens of `code` in `lang`. Tokenizing is memoized per language, so a
// document that is re-highlighted after every pause in typing only pays for
// the code blocks that changed.
export function tokenizeCode(lang, code) {
  let cache = caches.get(lang);
  if (!cache) caches.set(lang, (cache = new Map()));
  let tokens = cache.get(code);
  if (tokens) {
    // Most recently used goes last; the oldest is evicted first.
    cache.delete(code);
  } else {
    tokens = clean(lang.tokenize(code), code.length);
  }
  cache.set(code, tokens);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
  return tokens;
}

// A tokenizer is plugin code: keep only well-formed, in-order tokens with
// class-safe names, so a faulty one can at worst colour wrongly, never
// corrupt the text or the markup.
function clean(tokens, length) {
  const out = [];
  let at = 0;
  for (const t of tokens ?? []) {
    if (!Array.isArray(t) || !reToken.test(t[2])) continue;
    const from = Math.max(at, t[0] | 0);
    const to = Math.min(length, t[1] | 0);
    if (to <= from) continue;
    out.push([from, to, t[2]]);
    at = to;
  }
  return out;
}

// `code` as HTML, its tokens wrapped in <span class="mh-tk-…">. `esc`
// escapes text for HTML.
export function codeToHtml(code, tokens, esc) {
  let html = "";
  let at = 0;
  for (const [from, to, token] of tokens) {
    if (from > at) html += esc(code.slice(at, from));
    html += `<span class="mh-tk-${token}">${esc(code.slice(from, to))}</span>`;
    at = to;
  }
  return html + esc(code.slice(at));
}
