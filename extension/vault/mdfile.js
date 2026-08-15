// The file format contract, in JS. A faithful port of
// scripts/vaultgen/mdfile.py — task 5.4 requires the two to emit identical
// bytes for every file in the vault, so any change here must be mirrored there.
//
// Task 5.1 asked for vendored js-yaml with a pinned schema (spike S8), because
// js-yaml's default schema coerces unquoted ISO timestamps to Date and re-emits
// them differently — which would break byte-identity for all 124 timestamp
// values. Porting the same tiny hand-rolled subset instead removes the
// dependency, the download and the schema fight altogether, and makes
// byte-parity structural rather than something to tune. See PLAN 5.1.
//
// No build step, no bundler: this is a plain ES module.

export const FIELD_ORDER = [
  "id", "kind", "title", "created", "updated",
  "tags", "aliases",
  "url", "links", "og_title", "og_description", "og_image", "og_site_name",
  "author", "captured", "source", "status", "start_date",
  "parent", "children",
  // The Obsidian Excalidraw plugin's marker. Written on drawings the app
  // creates so the plugin recognises them as its own files.
  "excalidraw-plugin",
];

export const REQUIRED = ["id", "kind", "title", "created", "updated"];

// Only these headings are structural. A user's own `## Design notes` is prose
// and must survive untouched, so the escape is keyed to the section names.
export const SECTIONS = ["Thread", "Attachments", "Links", "Mentions", "Board contents"];
const NAMES = SECTIONS.join("|");

const DELIM = new RegExp(`^(##\\s+(?:${NAMES})\\s*$|\\*\\*(?:user|assistant)\\*\\*\\s)`);
const DELIM_STRICT = new RegExp(`^(##\\s+(?:${NAMES})\\s*$|###\\s|\\*\\*(?:user|assistant)\\*\\*\\s)`);
const ESCAPED = new RegExp(`^\\\\((?:##\\s+(?:${NAMES})\\s*$|###\\s|\\*\\*(?:user|assistant)\\*\\*\\s))`);

const PLAIN_SAFE = /^[A-Za-z0-9][A-Za-z0-9 _./+:@-]*$/;
const LOOKS_SCALAR = /^(true|false|null|yes|no|on|off|~|-?\d+(\.\d+)?([eE][+-]?\d+)?)$/i;
const INDICATORS = "[]{}&*!|>%@`\"'#,?:-";

/**
 * Keys whose list was written in YAML *block* style, plus the exact text it had.
 *
 * Both the Obsidian Web Clipper and Obsidian's own Properties panel write lists
 * as `key:` followed by `  - "item"` lines, while this emitter uses flow style.
 * Reading a block list as a flow list used to yield `""` and **silently drop
 * every item** — a clipped or Obsidian-edited note lost its tags on the next
 * app write. Remembering the original text lets both styles be read, and the
 * one the file actually had re-emitted, so foreign files round-trip too.
 */
export const BLOCK_LISTS = Symbol("blockLists");

export function escapeUser(text, strict = false) {
  const pat = strict ? DELIM_STRICT : DELIM;
  return String(text).split("\n").map((ln) => (pat.test(ln) ? "\\" + ln : ln)).join("\n");
}

export function unescapeUser(text) {
  return String(text).split("\n")
    .map((ln) => (ESCAPED.test(ln) ? ln.replace(ESCAPED, "$1") : ln))
    .join("\n");
}

function needsQuote(s) {
  if (s === "" || s !== s.trim()) return true;
  if (LOOKS_SCALAR.test(s)) return true;
  if (INDICATORS.includes(s[0])) return true;
  if (s.includes(": ") || s.includes(" #") || s.includes("\n") || s.includes("\t")) return true;
  return !PLAIN_SAFE.test(s);
}

function emitScalar(s) {
  s = String(s);
  if (!needsQuote(s)) return s;
  return '"' + s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t") + '"';
}

function parseScalar(raw) {
  raw = raw.trim();
  if (raw.length >= 2 && raw[0] === '"' && raw[raw.length - 1] === '"') {
    const inner = raw.slice(1, -1);
    let out = "";
    for (let i = 0; i < inner.length; i++) {
      if (inner[i] === "\\" && i + 1 < inner.length) {
        const n = inner[i + 1];
        out += n === "n" ? "\n" : n === "t" ? "\t" : n;
        i++;
      } else out += inner[i];
    }
    return out;
  }
  return raw;
}

function splitFlow(raw) {
  const inner = raw.trim().slice(1, -1).trim();
  if (!inner) return [];
  const items = [];
  let buf = "", q = false, esc = false;
  for (const c of inner) {
    if (esc) { buf += c; esc = false; }
    else if (c === "\\" && q) { buf += c; esc = true; }
    else if (c === '"') { q = !q; buf += c; }
    else if (c === "," && !q) { items.push(buf); buf = ""; }
    else buf += c;
  }
  items.push(buf);
  return items.filter((i) => i.trim() !== "").map(parseScalar);
}

export function serialize(fm, body) {
  const missing = REQUIRED.filter((k) => !fm[k]);
  if (missing.length) throw new Error(`missing required frontmatter: ${missing}`);
  const unknown = Object.keys(fm).filter((k) => !FIELD_ORDER.includes(k));
  if (unknown.length) throw new Error(`unknown frontmatter fields: ${unknown}`);

  const lines = ["---"];
  for (const key of FIELD_ORDER) {
    if (!(key in fm)) continue;
    const val = fm[key];
    // `url` is the one key whose PRESENCE carries meaning: an empty url is
    // what makes a page a bookmark-in-progress rather than an article. Every
    // other empty value is noise and stays dropped.
    if (val === "" && key === "url") { lines.push('url: ""'); continue; }
    if (val === null || val === undefined || val === "") continue;
    if (Array.isArray(val)) {
      if (!val.length) continue;
      const raw = fm[BLOCK_LISTS] && fm[BLOCK_LISTS][key];
      if (raw && raw.values.length === val.length
          && raw.values.every((v, i) => v === String(val[i]))) {
        lines.push(raw.text);                 // unchanged: reproduce it exactly
      } else if (raw) {
        lines.push(`${key}:`);                // changed: keep the file's style
        for (const v of val) lines.push(`  - ${emitScalar(String(v))}`);
      } else {
        lines.push(`${key}: [${val.map((v) => emitScalar(String(v))).join(", ")}]`);
      }
    } else {
      lines.push(`${key}: ${emitScalar(String(val))}`);
    }
  }
  lines.push("---");

  const text = String(body).replace(/\n+$/, "");
  return lines.join("\n") + (text ? "\n\n" + text + "\n" : "\n");
}

export function parse(text) {
  if (!text.startsWith("---\n")) return [{}, text];
  const end = text.indexOf("\n---", 3);
  if (end === -1) return [{}, text];
  const block = text.slice(4, end);
  let rest = text.slice(end + 4);
  if (rest.startsWith("\n")) rest = rest.slice(1);
  if (rest.startsWith("\n")) rest = rest.slice(1);

  const fm = {};
  const blocks = {};
  const bl = block.split("\n");
  for (let i = 0; i < bl.length; i++) {
    const line = bl[i];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const c = line.indexOf(":");
    if (c === -1) continue;
    const key = line.slice(0, c).trim();
    const raw = line.slice(c + 1).trim();

    // A bare `key:` followed by `  - item` lines is a YAML block list. Both the
    // Web Clipper and Obsidian's Properties panel write them that way; reading
    // one as a flow list used to drop every item silently.
    if (raw === "" && /^\s*-\s/.test(bl[i + 1] || "")) {
      const values = [];
      const text = [line];
      let j = i + 1;
      while (j < bl.length && /^\s*-\s/.test(bl[j])) {
        text.push(bl[j]);
        values.push(parseScalar(bl[j].replace(/^\s*-\s+/, "")));
        j++;
      }
      fm[key] = values;
      blocks[key] = { text: text.join("\n"), values: values.map(String) };
      i = j - 1;
      continue;
    }
    fm[key] = raw.startsWith("[") ? splitFlow(raw) : parseScalar(raw);
  }
  if (Object.keys(blocks).length) fm[BLOCK_LISTS] = blocks;
  return [fm, rest.replace(/\n+$/, "")];
}

export function roundtripOk(text) {
  const [fm, body] = parse(text);
  if (!Object.keys(fm).length) return [false, "no frontmatter"];
  let again;
  try { again = serialize(fm, body); }
  catch (e) { return [false, e.message]; }
  return [again === text, again === text ? "" : "bytes differ"];
}
