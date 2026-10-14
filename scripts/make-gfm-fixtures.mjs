/*
 * Copyright 2026 Jason Figge
 *
 * This file is part of MarkHippo.
 *
 * MarkHippo is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * MarkHippo is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
 * more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with MarkHippo. If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * make-gfm-fixtures.mjs — `make gfm-fixtures`: regenerate
 * test/fixtures/gfm/examples.json, the GitHub Flavored Markdown examples
 * for the extensions MarkHippo implements as plugins.
 *
 * Two sources, both from github/cmark-gfm:
 *
 *   test/spec.txt        the GFM spec; only its examples tagged as an
 *                        extension (table, strikethrough, autolink,
 *                        disabled = task lists, tagfilter) are taken — the
 *                        rest are CommonMark 0.29, which the CommonMark
 *                        0.31.2 suite already covers
 *   test/extensions.txt  cmark-gfm's own extension tests, footnotes
 *                        included (the GFM spec has none)
 *
 *     node scripts/make-gfm-fixtures.mjs [spec.txt extensions.txt]
 *
 * With no arguments both are downloaded. The output is committed.
 */

import { readFile, writeFile } from "node:fs/promises";

const BASE = "https://raw.githubusercontent.com/github/cmark-gfm/master/test/";
const OUT = new URL("../test/fixtures/gfm/examples.json", import.meta.url);
const FENCE = "`".repeat(32);

async function load(arg, name) {
  return arg ? readFile(arg, "utf8") : (await fetch(BASE + name)).text();
}

// Examples, with the heading each falls under.
function examples(text, source, keep) {
  const out = [];
  let section = "";
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const heading = lines[i].match(/^#{1,6} +(.*)$/);
    if (heading) section = heading[1].trim();
    if (!lines[i].startsWith(FENCE + " example")) continue;
    const tag = lines[i].slice(FENCE.length + " example".length).trim();
    const md = [];
    const html = [];
    let into = md;
    for (i++; lines[i] !== FENCE; i++) {
      if (i >= lines.length) throw new Error(`${source}: example "${tag}" (in ${section}) is never closed`);
      if (lines[i] === "." && into === md) into = html;
      else into.push(lines[i]);
    }
    if (!keep(tag, section)) continue;
    const fix = (s) => (s.length ? s.join("\n") + "\n" : "").replace(/→/g, "\t");
    out.push({ source, section, extension: tag || section, markdown: fix(md), html: fix(html) });
  }
  return out;
}

const spec = await load(process.argv[2], "spec.txt");
const ext = await load(process.argv[3], "extensions.txt");
const all = [
  ...examples(spec, "spec.txt", (tag) => tag !== ""),
  ...examples(ext, "extensions.txt", () => true),
].map((e, i) => ({ example: i + 1, ...e }));

await writeFile(OUT, JSON.stringify(all, null, 1) + "\n");
console.log(`${all.length} examples → ${OUT.pathname}`);
