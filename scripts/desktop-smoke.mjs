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

// desktop-smoke.mjs — the desktop app, driven end to end (`make
// desktop-smoke`).
//
// It runs the shell on src/ in a throwaway profile and folder, with the
// example plugin (and two broken ones) in its plugins folder and a document
// on the command line, and drives the page over the Chrome DevTools
// Protocol — Node's own WebSocket, no test framework. Dialogs answer
// themselves (MARKHIPPO_SAVE_DIR, a development-only knob in main.js), so
// nothing waits on a person. It never prints (the system's dialog would
// wait) or copies (it would replace what is on your clipboard).
//
// A window does open while it runs, for a few seconds.

import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const electronDir = path.join(repo, "electron");
// The Electron binary itself (its package's export), not the .bin wrapper:
// killing a wrapper leaves the app running.
const electron = createRequire(path.join(electronDir, "package.json"))("electron");

// A 2×1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADklEQVR4nGP4z8AAQv8BD/kD/YURmXYAAAAASUVORK5CYII=", "base64");

// ── The fixture ──────────────────────────────────────────────────────────────

const root = mkdtempSync(path.join(tmpdir(), "markhippo-smoke-"));
const profile = path.join(root, "profile");
const plugins = path.join(profile, "plugins");
const docs = path.join(root, "docs");
const saves = path.join(root, "saves");
for (const dir of [plugins, path.join(docs, "pics"), saves]) mkdirSync(dir, { recursive: true });
copyFileSync(path.join(repo, "examples", "plugins", "highlight.js"), path.join(plugins, "highlight.js"));
writeFileSync(path.join(plugins, "broken.js"), 'export default { id: "broken", setup() { throw new Error("on purpose"); } };\n');
writeFileSync(path.join(plugins, "not-a-plugin.js"), "export const hello = 1;\n");
writeFileSync(path.join(docs, "pics", "dot.png"), PNG);
const notes = path.join(docs, "notes.md");
writeFileSync(notes, "# Notes\n\nHello ==world==.\n\n![dot](pics/dot.png)\n");

// ── A little CDP ─────────────────────────────────────────────────────────────

const freePort = () =>
  new Promise((resolve) => {
    const server = createServer().listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function targets(port) {
  try {
    return await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  } catch {
    return [];
  }
}

async function waitFor(fn, what, ms = 15000) {
  const until = Date.now() + ms;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await sleep(150);
  }
}

function connect(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  const call = (method, params = {}) =>
    new Promise((resolve) => {
      const n = ++id;
      pending.set(n, resolve);
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  // Evaluate in the page, awaiting a promise; answers the value, or throws.
  const run = async (expression) => {
    const { result, error } = await call("Runtime.evaluate", { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true });
    if (error) throw new Error(error.message);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  return new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve({ call, run, close: () => ws.close() }));
    ws.addEventListener("error", () => reject(new Error(`could not connect to ${url}`)));
  });
}

// ── The run ──────────────────────────────────────────────────────────────────

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
}

const port = await freePort();
const app = spawn(electron, [electronDir, `--remote-debugging-port=${port}`, notes], {
  env: { ...process.env, MARKHIPPO_WEB_DIR: path.join(repo, "src"), MARKHIPPO_USER_DATA: profile, MARKHIPPO_SAVE_DIR: saves },
  stdio: ["ignore", "inherit", "inherit"],
});

let failed = false;
try {
  console.log("MarkHippo desktop smoke test");
  const target = await waitFor(async () => (await targets(port)).find((t) => t.type === "page" && t.url.startsWith("app://markhippo/index.html")), "the editor window");
  const page = await connect(target.webSocketDebuggerUrl);
  await page.call("Runtime.enable");
  await waitFor(() => page.run("return document.getElementById('mh-source')?.value.length > 0").catch(() => false), "the document");
  await sleep(1200);

  // Opened from the command line, with the user's plugin running.
  check("the page is served on app://markhippo/ with the bridge", await page.run("return location.origin === 'app://markhippo' && typeof window.markhippoDesktop === 'object'"));
  check("the document on the command line is open", await page.run("return document.getElementById('mh-source').value.startsWith('# Notes') && document.getElementById('mh-filename').textContent === 'notes.md'"));
  check("the user's plugin renders: ==world== is <mark>", await page.run("return document.querySelector('#mh-preview mark')?.textContent === 'world'"));
  check(
    "the document's own image is served from beside it",
    await page.run(`const img = document.querySelector('#mh-preview img[alt="dot"]'); if (!img) return false; if (!img.complete) await new Promise((r) => img.addEventListener('load', r, { once: true })); return img.getAttribute('src').startsWith('/@doc/') && img.naturalWidth === 2`),
  );

  // The plugin list.
  const listed = await page.run(`document.getElementById('mh-plugins-open').click(); await new Promise((r) => setTimeout(r, 100));
    const items = [...document.querySelectorAll('#mh-plugin-list .mh-plugin')].map((li) => li.textContent);
    document.getElementById('mh-plugins').close();
    return items;`);
  check("the Plugins list shows the user's plugin as theirs", listed.some((t) => t.includes("Highlight") && t.includes("Yours") && t.includes("highlight.js")));
  check("a plugin that throws in setup is listed, not running", listed.some((t) => t.includes("broken") && t.includes("Not running: on purpose")));
  check("a file that is not a plugin is listed with why", listed.some((t) => t.includes("not-a-plugin.js") && t.includes("is not a plugin")));

  // The network is shut, but for images.
  check("fetch() to the web is refused", await page.run("try { await fetch('https://example.com/'); return false; } catch { return true; }"));

  // Edit and save in place.
  await page.run(`const ta = document.getElementById('mh-source'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); document.execCommand('insertText', false, '\\nSaved from the smoke test.\\n'); return true;`);
  await page.run(`document.querySelector('[data-action="save"]').click(); await new Promise((r) => setTimeout(r, 600)); return true;`);
  check("Save writes the file in place", readFileSync(notes, "utf8").includes("Saved from the smoke test."));

  // A pasted picture goes in assets/ beside the document.
  await page.run(`const ta = document.getElementById('mh-source'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    const c = document.createElement('canvas'); c.width = 3; c.height = 2; c.getContext('2d').fillRect(0, 0, 3, 2);
    const file = await new Promise((r) => c.toBlob((b) => r(new File([b], 'Screen Shot 1.png', { type: 'image/png' }))));
    const data = new DataTransfer(); data.items.add(file);
    ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 800)); return true;`);
  const assets = existsSync(path.join(docs, "assets")) ? readdirSync(path.join(docs, "assets")) : [];
  check("a pasted picture is written to assets/ beside the document", assets.includes("screen-shot-1.png"), assets.join(", "));
  check("…and linked by its relative path", await page.run("return document.getElementById('mh-source').value.includes('![Screen Shot 1](assets/screen-shot-1.png)')"));
  check(
    "…and shown in the preview",
    await page.run(`const img = document.querySelector('#mh-preview img[alt="Screen Shot 1"]'); if (!img) return false; if (!img.complete) await new Promise((r) => img.addEventListener('load', r, { once: true })); return img.naturalWidth === 3`),
  );

  // Exports, saved where the (self-answering) dialog says.
  for (const kind of ["html", "rtf", "text", "pdf"]) {
    await page.run(`document.getElementById('mh-export').click(); document.querySelector('#mh-export-menu [data-value="${kind}"]').click(); await new Promise((r) => setTimeout(r, ${kind === "pdf" ? 2500 : 1200})); return true;`);
  }
  const saved = (name) => (existsSync(path.join(saves, name)) ? readFileSync(path.join(saves, name)) : null);
  const html = saved("notes.html")?.toString("utf8") ?? "";
  check("Export → HTML page is saved, with the plugin's markup", html.includes("<mark>world</mark>"));
  check("…and the document's images inside it as data: URLs", (html.match(/src="data:image\/png;base64,/g) ?? []).length === 2);
  check("Export → Rich text carries the pictures", (saved("notes.rtf")?.toString("latin1") ?? "").includes("\\pngblip"));
  check("Export → Plain text is saved", (saved("notes.txt")?.toString("utf8") ?? "").includes("Hello world."));
  check("Export → PDF is saved", saved("notes.pdf")?.subarray(0, 5).toString("latin1") === "%PDF-");
  check("the print area is empty again afterwards", await page.run("return !document.getElementById('mh-print').hasChildNodes()"));

  // The guide opens in a window of its own.
  await page.run(`document.querySelector('a[href="docs/"]').click(); return true;`);
  const guide = await waitFor(async () => (await targets(port)).find((t) => t.type === "page" && t.url.includes("/docs/")), "the guide window", 8000).catch(() => null);
  check("the Guide link opens the guide in its own window", guide);
  check("…and the editor stays where it was", await page.run("return location.pathname === '/index.html'"));

  // A reload keeps the document, and knows it is saved.
  await page.call("Page.reload");
  await sleep(2500);
  const page2 = await connect((await targets(port)).find((t) => t.url.startsWith("app://markhippo/index.html")).webSocketDebuggerUrl);
  check("a reload keeps the open document", await page2.run("return document.getElementById('mh-filename').textContent === 'notes.md' && document.getElementById('mh-source').value.includes('assets/screen-shot-1.png')"));
  // Saved, so quitting asks nothing.
  await page2.run(`document.querySelector('[data-action="save"]').click(); await new Promise((r) => setTimeout(r, 600)); return true;`);
  check("the pasted picture's link is saved too", readFileSync(notes, "utf8").includes("assets/screen-shot-1.png"));
  page2.close();
  page.close();
} catch (err) {
  failed = true;
  console.error(`  ✗ ${err.message}`);
} finally {
  // Unsaved changes would ask before quitting (a failed check can leave
  // some): if it has not gone in a few seconds, it goes regardless.
  const exited = new Promise((resolve) => app.once("exit", () => resolve(true)));
  app.kill();
  if (!(await Promise.race([exited, sleep(5000)]))) app.kill("SIGKILL");
  rmSync(root, { recursive: true, force: true });
}

const bad = results.filter((r) => !r.ok).length;
console.log(bad || failed ? `\n${bad} check(s) failed.` : `\nAll ${results.length} checks passed.`);
process.exit(bad || failed ? 1 : 0);
