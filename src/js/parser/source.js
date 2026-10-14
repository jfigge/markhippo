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
 * source.js — the text being parsed, as lines with their offsets.
 *
 * Every position in the AST is { line, column, offset }: line and column are
 * 1-based (column counts UTF-16 code units, as an editor's does), offset is
 * the 0-based index into the source string. A node's `end` is EXCLUSIVE — the
 * position just after its last character — so a node covers
 * source.slice(pos.start.offset, pos.end.offset).
 */

const LINE_ENDING = /\r\n|\n|\r/g;

// Split into lines without their endings, remembering where each starts.
// A final line ending does not start another line to parse: "a\n" is one
// line, though `starts` has a second entry, for the empty line after it.
export function splitLines(text) {
  const lines = [];
  const starts = [];
  let last = 0;
  LINE_ENDING.lastIndex = 0;
  let m;
  while ((m = LINE_ENDING.exec(text)) !== null) {
    lines.push(text.slice(last, m.index));
    starts.push(last);
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    lines.push(text.slice(last));
    starts.push(last);
  } else if (text.length > 0) {
    // The text ends with a line ending: the position after it is the start
    // of a line too (where an editor's cursor would be), though not one with
    // any content to parse.
    starts.push(last);
  }
  return { lines, starts };
}

// Turns offsets into positions and back, for one source.
export class Locator {
  constructor(text, starts) {
    this.text = text;
    this.starts = starts ?? splitLines(text).starts;
  }

  // Position of a 0-based offset. An offset past a line's end (on its line
  // ending) still belongs to that line.
  point(offset) {
    const starts = this.starts;
    if (starts.length === 0) return { line: 1, column: offset + 1, offset };
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: offset - starts[lo] + 1, offset };
  }

  // Position of a 1-based line and 1-based column.
  at(line, column) {
    const start = line - 1 < this.starts.length ? this.starts[line - 1] : this.text.length;
    return { line, column, offset: start + column - 1 };
  }

  lineStart(line) {
    return line - 1 < this.starts.length ? this.starts[line - 1] : this.text.length;
  }
}
