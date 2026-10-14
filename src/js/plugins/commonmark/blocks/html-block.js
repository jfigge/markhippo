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
 * HTML blocks (§4.6): the seven kinds of start condition, each with its own
 * end condition. The literal HTML is kept; whether it is emitted is up to the
 * renderer.
 */

import { CLOSETAG, OPENTAG } from "../../../parser/scanners.js";

const BLOCK_TAGS =
  "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|" +
  "dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[123456]|head|header|hr|html|" +
  "iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|" +
  "summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul";

const reHtmlBlockOpen = [
  /./, // no type 0
  /^<(?:script|pre|textarea|style)(?:\s|>|$)/i,
  /^<!--/,
  /^<[?]/,
  /^<![A-Za-z]/,
  /^<!\[CDATA\[/,
  new RegExp(`^<[/]?(?:${BLOCK_TAGS})(?:\\s|[/]?[>]|$)`, "i"),
  new RegExp(`^(?:${OPENTAG}|${CLOSETAG})\\s*$`, "i"),
];

const reHtmlBlockClose = [
  /./,
  /<\/(?:script|pre|textarea|style)>/i,
  /-->/,
  /\?>/,
  />/,
  /\]\]>/,
];

export const htmlBlock = {
  type: "html_block",
  priority: 500,
  triggers: "<",

  start(parser, container) {
    if (parser.indented || parser.currentLine.charAt(parser.nextNonspace) !== "<") return 0;
    const s = parser.currentLine.slice(parser.nextNonspace);
    for (let kind = 1; kind <= 7; kind++) {
      if (!reHtmlBlockOpen[kind].test(s)) continue;
      // Type 7 cannot interrupt a paragraph, lazy or not.
      if (
        kind === 7 &&
        (container.type === "paragraph" ||
          (!parser.allClosed && !parser.blank && parser.tip.type === "paragraph"))
      ) {
        continue;
      }
      parser.closeUnmatchedBlocks();
      // The indentation is part of the HTML: the offset is not advanced.
      const block = parser.addChild("html_block", parser.offset);
      block.htmlType = kind;
      return 2;
    }
    return 0;
  },

  continue: (parser, block) => (parser.blank && (block.htmlType === 6 || block.htmlType === 7) ? 1 : 0),

  // Types 1–5 end on the line holding their end condition.
  lineAdded(parser, block) {
    return block.htmlType <= 5 && reHtmlBlockClose[block.htmlType].test(parser.currentLine.slice(parser.offset));
  },

  finalize(parser, block) {
    block.literal = block._content.replace(/\n$/, "");
    block._content = null;
    block._segments = null;
  },

  canContain: () => false,
  acceptsLines: true,
};
