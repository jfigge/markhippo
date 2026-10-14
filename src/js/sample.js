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
 * sample.js — the document shown the first time MarkHippo opens: a short
 * tour that doubles as a check that every CommonMark construct renders.
 */

export const SAMPLE = `# Welcome to MarkHippo

Write **markdown** on the left and see it rendered on the right. The source
is coloured by the same parser as the preview, so you see what it understood
as you type; the preview catches up a moment after you stop.

MarkHippo reads markdown with *its own* parser — every construct of
[CommonMark](https://commonmark.org/), and nothing you write leaves this
machine. Open a \`.md\` file with **Open…**, or drop one on the page.

## Things to try

- Lists, which can be
  1. ordered,
  2. nested,
  3. and *tight* or loose
- Block quotes:

  > Markdown is intended to be as easy-to-read and easy-to-write as is
  > feasible.

- Code, inline like \`const x = 1\` or fenced:

\`\`\`js
function hello(name) {
  return \`Hello, \${name}!\`;
}
\`\`\`

## Links and images

An inline [link](https://hippoherd.com/ "Hippo Herd"), a [reference
link][herd], and an autolink: <https://hippoherd.com/markhippo/>. Images
are written the same way as links, with a \`!\` in front:
\`![alt text](picture.png)\`.

[herd]: https://hippoherd.com/

---

Try deleting the closing fence of the code block above: everything after it
becomes code, on both sides. That is the parser telling you exactly what it
understood.
`;
