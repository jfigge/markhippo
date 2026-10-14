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
 * Thematic breaks (§4.1): three or more matching `-`, `_` or `*`.
 */

const reThematicBreak = /^(?:\*[ \t]*){3,}$|^(?:_[ \t]*){3,}$|^(?:-[ \t]*){3,}$/;

export const thematicBreak = {
  type: "thematic_break",
  priority: 300,
  triggers: "*_-",

  start(parser) {
    if (parser.indented || !reThematicBreak.test(parser.currentLine.slice(parser.nextNonspace))) return 0;
    parser.closeUnmatchedBlocks();
    parser.addChild("thematic_break", parser.nextNonspace);
    parser.advanceOffset(parser.currentLine.length - parser.offset, false);
    return 2;
  },

  continue: () => 1,
  finalize() {},
  canContain: () => false,
  acceptsLines: false,
};
