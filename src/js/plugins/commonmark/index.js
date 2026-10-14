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
 * The CommonMark plugin: the whole of CommonMark 0.31.2 — parsing, HTML and
 * edit-pane colouring — registered through the public plugin API like any
 * third-party plugin; nothing here reaches into the core.
 */

import { blockQuote } from "./blocks/block-quote.js";
import { codeBlock } from "./blocks/code-block.js";
import { heading } from "./blocks/heading.js";
import { htmlBlock } from "./blocks/html-block.js";
import { item, list } from "./blocks/list.js";
import { paragraph } from "./blocks/paragraph.js";
import { thematicBreak } from "./blocks/thematic-break.js";
import {
  angle,
  asterisk,
  backslash,
  bang,
  closeBracket,
  codeSpan,
  entity,
  newline,
  openBracket,
  underscore,
} from "./inlines.js";
import { highlighters } from "./highlight.js";
import { renderers } from "./render.js";

export default {
  id: "commonmark",
  name: "CommonMark",
  version: "0.31.2",
  description: "Every construct of the CommonMark 0.31.2 spec: headings, lists, quotes, code, links, images, emphasis, raw HTML.",
  required: true,
  setup(api) {
    for (const rule of [paragraph, blockQuote, heading, codeBlock, htmlBlock, thematicBreak, list, item]) {
      api.blockRule(rule);
    }
    for (const rule of [newline, backslash, codeSpan, openBracket, bang, closeBracket, angle, entity]) {
      api.inlineRule(rule);
    }
    api.delimiter(asterisk);
    api.delimiter(underscore);
    for (const [type, fn] of Object.entries(renderers)) api.renderer(type, fn);
    for (const [type, fn] of Object.entries(highlighters)) api.highlighter(type, fn);
  },
};
