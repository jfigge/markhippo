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
 * outline-view.js — the outline panel: the document's headings, indented by
 * level, the one whose section is in view marked. Choosing one jumps the
 * editor (and the preview) to it.
 */

export class OutlineView {
  constructor({ panel, list, empty, onJump }) {
    this.panel = panel;
    this.list = list;
    this.empty = empty;
    this.onJump = onJump;
    this.items = [];
    this.key = "";
    this.current = -1;
    list.addEventListener("click", (e) => {
      const button = e.target.closest("[data-index]");
      if (button) this.onJump(this.items[Number(button.dataset.index)]);
    });
  }

  get visible() {
    return !this.panel.hidden;
  }

  show(on) {
    this.panel.hidden = !on;
  }

  // New headings (outline.js). Redrawn only when they changed.
  update(items) {
    const key = items.map((h) => `${h.level}\u0000${h.text}\u0000${h.line}`).join("\u0001");
    this.items = items;
    if (key === this.key) return;
    this.key = key;
    this.current = -1;
    const top = Math.min(...items.map((h) => h.level));
    this.list.replaceChildren(
      ...items.map((h, i) => {
        const li = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = `mh-outline-item mh-outline-item--h${h.level}`;
        button.dataset.index = String(i);
        button.style.setProperty("--depth", String(h.level - top));
        button.textContent = h.text || "(empty heading)";
        button.title = `Line ${h.line}`;
        li.append(button);
        return li;
      }),
    );
    this.empty.hidden = items.length > 0;
  }

  // Mark heading `index` as the one in view.
  setCurrent(index) {
    if (index === this.current) return;
    this.list.querySelector("[aria-current]")?.removeAttribute("aria-current");
    this.current = index;
    const button = this.list.querySelector(`[data-index="${index}"]`);
    if (!button) return;
    button.setAttribute("aria-current", "location");
    if (this.visible) button.scrollIntoView({ block: "nearest" });
  }
}
