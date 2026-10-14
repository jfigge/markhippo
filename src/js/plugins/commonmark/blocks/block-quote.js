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
 * Block quotes (§5.1): `>` and an optional space, nestable, with lazy
 * continuation handled by the engine.
 */

import { isSpaceOrTab } from "./util.js";

export const blockQuote = {
  type: "block_quote",
  priority: 800,
  triggers: ">",

  start(parser) {
    if (parser.indented || parser.currentLine.charAt(parser.nextNonspace) !== ">") return 0;
    parser.advanceNextNonspace();
    parser.advanceOffset(1, false);
    if (isSpaceOrTab(parser.currentLine.charAt(parser.offset))) parser.advanceOffset(1, true);
    parser.closeUnmatchedBlocks();
    parser.addChild("block_quote", parser.nextNonspace);
    return 1;
  },

  continue(parser) {
    const ln = parser.currentLine;
    if (parser.indented || ln.charAt(parser.nextNonspace) !== ">") return 1;
    parser.advanceNextNonspace();
    parser.advanceOffset(1, false);
    if (isSpaceOrTab(ln.charAt(parser.offset))) parser.advanceOffset(1, true);
    return 0;
  },

  finalize() {},
  canContain: (type, parser) => !parser.rule(type).onlyInside,
  acceptsLines: false,
};
