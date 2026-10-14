// desktop.test.js — what the desktop app promises that can be checked
// without Electron: where its windows may go and what its scheme serves
// (electron/policy.js), the page's side of that (src/js/desktop.js), the
// user's plugins, and that the packaging builds the six installers the
// Release workflow publishes. `make desktop-smoke` drives the real thing.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import policy from "../electron/policy.js";
import { createMarkHippo } from "../src/js/core/host.js";
import commonmark from "../src/js/plugins/commonmark/index.js";
import highlight from "../examples/plugins/highlight.js";
import { documentImageUrl, loadUserPlugins } from "../src/js/desktop.js";

const webDir = path.resolve("build", "electron", "web");
const docDir = path.resolve("docs", "notes");
const pluginsDir = path.resolve("profile", "plugins");
const dirs = { webDir, pluginsDir, docDir };
const resolve = (url, d = dirs) => policy.resolveRequest(url, d);

describe("where a window may go", () => {
  test("the editor's own page loads", () => {
    for (const url of ["app://markhippo/index.html", "app://markhippo/", "app://markhippo/index.html?x=1#y"]) {
      assert.equal(policy.classifyNavigation(url), "app", url);
    }
  });

  test("the guide goes to its own window", () => {
    for (const url of ["app://markhippo/docs/", "app://markhippo/docs", "app://markhippo/docs/index.html#themes"]) {
      assert.equal(policy.classifyNavigation(url), "guide", url);
    }
  });

  test("the web leaves through the system browser", () => {
    assert.equal(policy.classifyNavigation("https://hippoherd.com/"), "external");
    assert.equal(policy.classifyNavigation("http://example.com/x"), "external");
    assert.equal(policy.classifyNavigation("mailto:me@example.com"), "external");
  });

  test("everything else goes nowhere", () => {
    for (const url of [
      "app://markhippo/js/app.js",
      "app://markhippo/@doc/notes.md",
      "app://other/index.html",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "data:text/html,<p>hi</p>",
      "blob:app://markhippo/0b0c",
      "chrome://settings",
      "not a url",
      "",
    ]) {
      assert.equal(policy.classifyNavigation(url), "deny", url);
    }
  });
});

describe("what app://markhippo/ serves", () => {
  test("the app's files, from its folder, with their types", () => {
    assert.deepEqual(resolve("app://markhippo/index.html"), { file: path.join(webDir, "index.html"), type: "text/html; charset=utf-8" });
    assert.equal(resolve("app://markhippo/").file, path.join(webDir, "index.html"));
    assert.equal(resolve("app://markhippo/docs/").file, path.join(webDir, "docs", "index.html"));
    assert.equal(resolve("app://markhippo/js/app.js?v=1").type, "text/javascript; charset=utf-8");
    assert.equal(resolve("app://markhippo/vendor/temml/Temml.woff2").type, "font/woff2");
  });

  test("nothing outside the app's folder, however it is spelled", () => {
    const inside = (file) => file.startsWith(webDir + path.sep);
    // Dots the URL itself resolves stay in the folder; escaped slashes that
    // would climb out of it are refused.
    for (const url of ["app://markhippo/%2e%2e/main.js", "app://markhippo/../../main.js", "app://markhippo/@plugins/%2e%2e/session.json"]) {
      assert.ok(inside(resolve(url).file), url);
    }
    for (const url of ["app://markhippo/..%2Fmain.js", "app://markhippo/a/..%2F..%2F..%2Fetc/passwd", "app://markhippo/@plugins/..%2Fsession.json", "app://markhippo/a%00b", "app://other/index.html"]) {
      assert.equal(resolve(url), null, url);
    }
  });

  test("the user's plugins, scripts and what they load only", () => {
    assert.equal(resolve("app://markhippo/@plugins/highlight.js").file, path.join(pluginsDir, "highlight.js"));
    assert.equal(resolve("app://markhippo/@plugins/emoji/index.mjs").file, path.join(pluginsDir, "emoji", "index.mjs"));
    assert.equal(resolve("app://markhippo/@plugins/emoji/emoji.css").type, "text/css; charset=utf-8");
    assert.equal(resolve("app://markhippo/@plugins/secrets.txt"), null);
    assert.equal(resolve("app://markhippo/@plugins/x.js", { webDir }), null);
  });

  test("the document's images: the page writes the address, the shell finds the file", () => {
    const served = (src) => resolve(`app://markhippo${documentImageUrl(src)}`)?.file ?? null;
    assert.equal(served("pics/dot.png"), path.join(docDir, "pics", "dot.png"));
    // The document's address is a URL: %20 is a space, and dots are kept
    // rather than collapsed by the page's own URL.
    assert.equal(served("my%20pics/a%20b.JPG"), path.join(docDir, "my pics", "a b.JPG"));
    assert.equal(served("../shared/logo.svg"), path.join(docDir, "..", "shared", "logo.svg"));
    assert.equal(served("/Users/me/Pictures/x.webp"), path.resolve("/Users/me/Pictures/x.webp"));
    assert.equal(served("pics/dot.png?v=2#x"), path.join(docDir, "pics", "dot.png"));
    // Images only, whatever the path.
    assert.equal(served("../../.ssh/id_rsa"), null);
    assert.equal(served("notes.md"), null);
    // Not the document's: the page leaves these alone.
    for (const src of ["https://example.com/a.png", "data:image/png;base64,AA", "#top", "//cdn.example.com/a.png", "file:///a.png", ""]) {
      assert.equal(documentImageUrl(src), null, src);
    }
    // No document, no folder: nothing.
    assert.equal(resolve(`app://markhippo${documentImageUrl("a.png")}`, { webDir }), null);
  });
});

describe("files", () => {
  test("the document a launch names: the last markdown path, flags passed over", () => {
    assert.equal(policy.documentFromArgv(["/Applications/MarkHippo.app/Contents/MacOS/MarkHippo", "/tmp/a.md"]), "/tmp/a.md");
    assert.equal(policy.documentFromArgv(["electron", ".", "--remote-debugging-port=1", "notes.markdown"]), "notes.markdown");
    assert.equal(policy.documentFromArgv(["MarkHippo", "--inspect", "-psn_0_123"]), null);
    assert.equal(policy.documentFromArgv(["MarkHippo.exe", "C:\\Users\\me\\a.png"]), null);
  });

  test("a pasted picture's file name: tidied, typed, and never one already there", () => {
    const none = () => false;
    assert.equal(policy.assetName("Screen Shot 2026-10-14 at 11.38.47 AM.png", "image/png", none), "screen-shot-2026-10-14-at-11-38-47-am.png");
    assert.equal(policy.assetName("Café crème.JPEG", "image/jpeg", none), "cafe-creme.jpg");
    assert.equal(policy.assetName("", "image/webp", none), "image.webp");
    assert.equal(policy.assetName("../../etc/passwd", "image/png", none), "etc-passwd.png");
    const taken = new Set(["image.png", "image-2.png"]);
    assert.equal(policy.assetName("image.png", "image/png", (n) => taken.has(n)), "image-3.png");
  });

  test("the window's title, and the save dialog's filters", () => {
    assert.equal(policy.windowTitle({ name: "notes.md", dirty: true, platform: "darwin" }), "notes.md");
    assert.equal(policy.windowTitle({ name: "notes.md", dirty: true, platform: "win32" }), "• notes.md — MarkHippo");
    assert.equal(policy.windowTitle({ name: "notes.md", dirty: false, platform: "linux" }), "notes.md — MarkHippo");
    assert.deepEqual(policy.saveFilters("notes.md"), [{ name: "Markdown", extensions: ["md", "markdown"] }]);
    assert.deepEqual(policy.saveFilters("notes.pdf"), [{ name: "PDF", extensions: ["pdf"] }]);
    assert.deepEqual(policy.saveFilters("theme.markhippo-theme.json"), []);
  });
});

describe("the user's plugins", () => {
  test("each one in the folder is imported; one that is not a plugin says why", async () => {
    const example = new URL("../examples/plugins/highlight.js", import.meta.url).href;
    const bridge = {
      plugins: async () => [
        { name: "highlight.js", url: example },
        { name: "nothing.js", url: "data:text/javascript,export const x = 1;" },
        { name: "missing.js", url: new URL("./no-such-plugin.js", import.meta.url).href },
      ],
    };
    const [ok, notPlugin, missing] = await loadUserPlugins(bridge);
    assert.equal(ok.plugin.id, "highlight");
    assert.match(notPlugin.error, /is not a plugin/);
    assert.ok(missing.error);
    assert.deepEqual(await loadUserPlugins(null), []);
    const unreadable = await loadUserPlugins({ plugins: async () => Promise.reject(new Error("EACCES")) });
    assert.match(unreadable[0].error, /could not be read: EACCES/);
  });

  test("a plugin that will not install is reported, and the rest still run", () => {
    const failures = [];
    const bad = { id: "bad", setup: () => { throw new Error("on purpose"); } };
    const mh = createMarkHippo({ plugins: [commonmark, bad, { id: "commonmark", setup() {} }, highlight], onError: (p, err) => failures.push([p.id, err.message]) });
    assert.deepEqual(failures, [["bad", "on purpose"], ["commonmark", 'Plugin "commonmark" is already installed']]);
    assert.deepEqual(mh.plugins.map((p) => p.id), ["commonmark", "highlight"]);
    // Without onError, as before, the error is thrown.
    assert.throws(() => createMarkHippo({ plugins: [bad] }), /on purpose/);
  });

  test("the example plugin: ==highlight==, coloured, suggested", () => {
    const mh = createMarkHippo({ plugins: [commonmark, highlight] });
    const render = (src) => mh.render(mh.parse(src));
    assert.equal(render("Remember to ==back up== first."), "<p>Remember to <mark>back up</mark> first.</p>\n");
    assert.equal(render("==*nested* too=="), "<p><mark><em>nested</em> too</mark></p>\n");
    // Equals signs that are not a pair of two hugging text stay text.
    for (const src of ["a == b == c", "===x===", "a ==b", "Title\n=====\n"]) assert.doesNotMatch(render(src), /<mark>/, src);
    const ast = mh.parse("a ==b== c");
    assert.deepEqual(mh.highlight(ast), [
      [2, 4, "mh-md-strong mh-md-marker"],
      [4, 5, "mh-md-strong"],
      [5, 7, "mh-md-strong mh-md-marker"],
    ]);
    const { items } = mh.complete(mh.parse("text /high"), "text /high", 10);
    assert.ok(items.some((item) => item.label === "Highlight" && item.insert === "==${text}=="));
  });
});

describe("packaging (electron/package.json)", () => {
  const { build, version, main } = JSON.parse(readFileSync("electron/package.json", "utf8"));
  const targets = (platform) => build[platform].target.map((t) => `${t.target}:${t.arch.join("+")}`);

  test("six installers: dmg, nsis and AppImage, each for arm64 and x64", () => {
    assert.deepEqual(targets("mac"), ["dmg:arm64+x64"]);
    assert.deepEqual(targets("win"), ["nsis:x64+arm64"]);
    assert.deepEqual(targets("linux"), ["AppImage:x64+arm64"]);
    assert.equal(build.nsis.buildUniversalInstaller, false);
    assert.match(build.nsis.artifactName, /\$\{arch\}/);
    assert.match(build.artifactName, /\$\{arch\}/);
  });

  test("never publishes by itself, and the version is stamped at build time", () => {
    assert.equal(build.publish, null);
    assert.equal(version, "0.0.0");
  });

  test("markdown files open with it, and everything main.js loads is packaged", () => {
    assert.deepEqual(build.fileAssociations[0].ext, ["md", "markdown", "mdown", "mkd", "mkdn"]);
    for (const file of [main, "policy.js", "preload.js", "web/**/*"]) assert.ok(build.files.includes(file), file);
  });
});
