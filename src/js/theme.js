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
 * theme.js — a classic script, loaded in <head> before the stylesheets
 * paint, so the saved theme is on the page from the first frame instead of
 * flashing from the default to it. It reads two things app.js saves:
 *
 *   markhippo.theme       the mode: "light", "dark" or "system" (or unset)
 *   markhippo.theme.vars  the chosen palette's colours, { light, dark }
 *
 * and puts the colours for the resolved mode on <html>, as
 * js/theme-manager.js does once the app is running. Only custom properties
 * with #rrggbb values are applied, whatever is in storage.
 */
(function applySavedTheme() {
  "use strict";
  var root = document.documentElement;
  try {
    var mode = window.localStorage.getItem("markhippo.theme");
    if (mode !== "light" && mode !== "dark") {
      mode = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    root.dataset.theme = mode;
    var cached = JSON.parse(window.localStorage.getItem("markhippo.theme.vars") || "null");
    var vars = cached && cached[mode];
    if (!vars || typeof vars !== "object") return;
    for (var name in vars) {
      if (/^--[a-z0-9-]+$/.test(name) && /^#[0-9a-f]{6}$/i.test(vars[name])) root.style.setProperty(name, vars[name]);
    }
    root.style.colorScheme = mode;
  } catch {
    // Storage blocked (privacy mode, file://) or unreadable: the defaults
    // in the stylesheets follow the system.
  }
})();
