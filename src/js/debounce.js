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
 * debounce.js — run something once the user pauses.
 *
 * Nothing is parsed per keystroke. The edit pane's colours are brought up
 * to date when typing pauses for HIGHLIGHT_DELAY_MS — short, so a heading
 * marker turns heading-coloured almost as it is typed (the parse is
 * incremental, so this stays cheap) — and the preview re-renders after
 * RENDER_DELAY_MS. Autocomplete runs on its own faster path and waits for
 * neither (autocomplete.js).
 */

export const HIGHLIGHT_DELAY_MS = 150;
export const RENDER_DELAY_MS = 1000;

// A debounced `fn`: each call restarts the wait. `.flush()` runs a pending
// call now; `.cancel()` drops it.
export function debounce(fn, ms) {
  let timer = null;
  let pending = null;
  const debounced = (...args) => {
    pending = args;
    clearTimeout(timer);
    timer = setTimeout(run, ms);
  };
  function run() {
    timer = null;
    const args = pending;
    pending = null;
    if (args) fn(...args);
  }
  debounced.flush = () => {
    clearTimeout(timer);
    run();
  };
  debounced.cancel = () => {
    clearTimeout(timer);
    timer = null;
    pending = null;
  };
  return debounced;
}
