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
 * The code plugin: syntax colouring for fenced code, in the preview and the
 * edit pane, for the languages in languages.js. It also declares those
 * languages as suggestions for a fence's info string, for the autocomplete
 * milestone to offer.
 *
 * It only registers languages; the CommonMark plugin's code block renderer
 * and highlighter look a block's language up and use whatever is there. So
 * a third-party plugin adds a language the same way:
 *
 *   api.language({ id: "lua", name: "Lua", aliases: [], tokenize(code) { … } })
 */

import { LANGUAGES } from "./languages.js";

export default {
  id: "code",
  name: "Code highlighting",
  version: "1.0.0",
  description: "Colours fenced code in the preview and the editor: JavaScript, TypeScript, JSON, YAML, Python, HTML, CSS, shell, SQL, C, C++, C#, Java, Kotlin, Go, Rust, Swift, INI/TOML, Dockerfile and diffs.",
  setup(api) {
    for (const lang of LANGUAGES) api.language(lang);
    api.completions({
      context: "fence-info",
      provide: () =>
        LANGUAGES.map((lang) => ({ label: lang.id, detail: lang.name, aliases: lang.aliases })),
    });
  },
};
