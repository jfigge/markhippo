// mini-dom.js — just enough of the DOM to run the exporters (src/js/export/)
// under node: a reader for well-formed HTML, such as the renderer writes,
// into nodes with nodeType, localName, childNodes, getAttribute,
// textContent and data. Not an HTML parser: no implied tags, no raw-text
// elements, no error recovery beyond the obvious.

const VOID = new Set(["area", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

const decode = (s) =>
  s.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, e) => {
    if (e[0] !== "#") return ENTITIES[e] ?? m;
    return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10));
  });

class Text {
  constructor(data) {
    this.nodeType = 3;
    this.data = data;
  }

  get textContent() {
    return this.data;
  }
}

class Element {
  constructor(localName, attributes) {
    this.nodeType = 1;
    this.localName = localName;
    this.attributes = attributes;
    this.childNodes = [];
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  get textContent() {
    return this.childNodes.map((child) => child.textContent).join("");
  }
}

const reToken = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>|[^<]+|</g;
const reAttribute = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

// The HTML as a fragment-like root: { childNodes }.
export function parseHtml(html) {
  const root = new Element("#fragment", new Map());
  const stack = [root];
  for (const m of html.matchAll(reToken)) {
    const top = stack[stack.length - 1];
    if (m[0].startsWith("<!--")) continue;
    if (m[1]) {
      const name = m[1].toLowerCase();
      const at = stack.findLastIndex((el) => el.localName === name);
      if (at > 0) stack.length = at;
    } else if (m[2]) {
      const attributes = new Map();
      for (const a of (m[3] ?? "").matchAll(reAttribute)) attributes.set(a[1].toLowerCase(), decode(a[2] ?? a[3] ?? a[4] ?? ""));
      const el = new Element(m[2].toLowerCase(), attributes);
      top.childNodes.push(el);
      if (!VOID.has(el.localName) && !m[4]) stack.push(el);
    } else {
      top.childNodes.push(new Text(decode(m[0])));
    }
  }
  return root;
}
