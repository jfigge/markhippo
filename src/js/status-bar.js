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
 * status-bar.js — parse timing, document size and the cursor position.
 */

export class StatusBar {
  constructor({ parse, doc, cursor }) {
    this.parseEl = parse;
    this.docEl = doc;
    this.cursorEl = cursor;
  }

  // `stats` is what reparse() filled in; `ms` the parse + render time.
  parsed(stats, ms, ast) {
    let how;
    if (stats.mode === "incremental") how = `Reparsed lines ${stats.fromLine}–${stats.toLine}`;
    else if (stats.mode === "unchanged") how = "Unchanged";
    else how = "Parsed";
    this.parseEl.textContent = `${how} · ${ms < 1 ? "<1" : Math.round(ms)} ms`;

    const blocks = ast.children ? ast.children.length : 0;
    const lines = ast.pos.end.line;
    const words = (ast.source.match(/\S+/g) ?? []).length;
    this.docEl.textContent = `${plural(lines, "line")} · ${plural(words, "word")} · ${plural(blocks, "block")}`;
  }

  cursor({ line, column }) {
    this.cursorEl.textContent = `Ln ${line}, Col ${column}`;
  }
}

const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
