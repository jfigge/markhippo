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
 * What the CommonMark plugin suggests (see complete/complete.js): the block
 * types after a / at the start of a line, the inline scaffolding after a /
 * mid-line, and the document's own reference labels after "][". Each shows
 * the markdown it stands for (`hint`), so choosing from the list teaches
 * the syntax.
 */

const heading = (level) => ({
  label: `Heading ${level}`,
  detail: level === 1 ? "Title" : level === 2 ? "Section" : level === 3 ? "Subsection" : "",
  keywords: [`h${level}`, "#".repeat(level), "title", "section"],
  hint: `${"#".repeat(level)} `,
  insert: `${"#".repeat(level)} \${Heading}`,
});

export const BLOCK_ITEMS = [
  heading(1),
  heading(2),
  heading(3),
  heading(4),
  heading(5),
  heading(6),
  { label: "Bulleted list", keywords: ["ul", "unordered", "bullets", "-"], hint: "- ", insert: "- ${item}" },
  { label: "Numbered list", keywords: ["ol", "ordered", "1."], hint: "1. ", insert: "1. ${item}" },
  { label: "Quote", keywords: ["blockquote", "citation", ">"], hint: "> ", insert: "> ${quote}" },
  // The fence's language is suggested next, as soon as it is inserted.
  { label: "Code block", keywords: ["fence", "fenced", "pre", "```"], hint: "```", insert: "```$0\n\n```" },
  { label: "Divider", keywords: ["thematic break", "horizontal rule", "hr", "separator", "---"], hint: "---", insert: "---\n$0" },
  {
    label: "Link definition",
    detail: "For reference links",
    keywords: ["reference", "ref", "url"],
    hint: "[label]: url",
    insert: "[${label}]: ${https://}",
  },
  { label: "Comment", detail: "Hidden in the preview", keywords: ["html", "note", "hidden"], hint: "<!-- -->", insert: "<!-- ${comment} -->" },
];

export const INLINE_ITEMS = [
  { label: "Link", keywords: ["url", "href", "a"], hint: "[text](url)", insert: "[${text}](${https://})" },
  { label: "Image", keywords: ["img", "picture", "photo"], hint: "![alt](src)", insert: "![${alt text}](${image.png})" },
  { label: "Bold", keywords: ["strong", "b", "**"], hint: "**bold**", insert: "**${bold}**" },
  { label: "Italic", keywords: ["emphasis", "em", "i", "*"], hint: "*italic*", insert: "*${italic}*" },
  { label: "Inline code", keywords: ["code", "backtick", "`"], hint: "`code`", insert: "`${code}`" },
  { label: "Reference link", keywords: ["ref", "link"], hint: "[text][label]", insert: "[${text}][${label}]" },
  { label: "Autolink", keywords: ["url", "email"], hint: "<https://…>", insert: "<${https://example.com}>" },
  { label: "Line break", detail: "Without a new paragraph", keywords: ["br", "hard break", "newline"], hint: "\\ at the end", insert: "\\\n$0" },
];

// Snippet syntax is literal text but for $, and the label is one line.
const literal = (s) => s.replace(/\$/g, "$$$$").replace(/\s+/g, " ");

const reLabel = /^[ \t]*\[((?:\\[^]|[^\\\]])*)\]/;

// The document's definitions, by the label as it was written.
function referenceLabels(ctx) {
  const seen = new Set();
  const items = [];
  const close = ctx.text[ctx.offset] === "]" ? "" : "]";
  const visit = (node) => {
    if (node.type === "link_reference_definition" && !seen.has(node.label)) {
      seen.add(node.label);
      const m = ctx.ast.source.slice(node.pos.start.offset, node.pos.end.offset).match(reLabel);
      const label = m ? m[1].replace(/\s+/g, " ") : node.label;
      items.push({ label, detail: node.destination, insert: literal(label) + close });
    }
    for (const child of node.children ?? []) visit(child);
  };
  if (ctx.ast) visit(ctx.ast);
  return items;
}

export const providers = [
  { context: "block", provide: () => BLOCK_ITEMS },
  { context: "inline", provide: () => INLINE_ITEMS },
  { context: "link-ref", provide: referenceLabels },
];
