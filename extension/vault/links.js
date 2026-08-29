// Task 6.10: wikilink resolution, matching Obsidian's own rules.
//
// Obsidian resolves a `[[Wikilink]]` against the **filename basename** and the
// frontmatter **aliases** — it never reads a `title:` field. Getting this wrong
// is what made the previous export Obsidian-dead, so the order here is not a
// preference: basename → aliases → relative path, case-insensitive.
//
// Kept separate from app.js so it can be tested headlessly.

/** Split `Target|display` / `Target#heading` / `Target#^block`. */
export function parseWikilink(inner) {
  let rest = String(inner);
  let display = null;
  const pipe = rest.indexOf("|");
  if (pipe !== -1) {
    display = rest.slice(pipe + 1).trim();
    rest = rest.slice(0, pipe);
  }
  let heading = null;
  const hash = rest.indexOf("#");
  if (hash !== -1) {
    heading = rest.slice(hash + 1).trim();
    rest = rest.slice(0, hash);
  }
  return { target: rest.trim(), display, heading };
}

const lower = (s) => String(s || "").toLowerCase();

/** The extension a link target may spell out, and a basename drops. */
const EXT = /\.(md|canvas)$/i;

/** Basename of a vault path, without the extension. */
export function basenameOf(path) {
  const name = String(path).split("/").pop();
  return name.replace(EXT, "");
}

/** A link target, normalised the way every tier compares it. */
const targetKey = (target) => lower(String(target).replace(EXT, "")).trim();

/**
 * The lookup `resolveWikilink` walks, built once for many resolutions.
 *
 * Same three tiers in the same order, and the same tie-break: entries are
 * indexed in path order and the first to claim a key keeps it, so a lookup
 * answers exactly what the linear scan below would have.
 *
 * It exists because that scan sorts the whole vault on every call, and the
 * queries that need it — backlinks, a topic's orbit — resolve every mention in
 * the vault. One sort per query, not one per mention.
 */
export function linkResolver(entries) {
  const byBasename = new Map(), byAlias = new Map(), byPath = new Map();
  const claim = (map, key, e) => { if (key && !map.has(key)) map.set(key, e); };
  const sorted = [...entries].sort((a, b) => String(a.path).localeCompare(String(b.path)));
  for (const e of sorted) {
    claim(byBasename, lower(basenameOf(e.path)), e);              // 1) basename
    for (const a of e.aliases || []) claim(byAlias, lower(a), e); // 2) aliases
    const p = lower(e.path);                                      // 3) relative path,
    claim(byPath, p, e);                                          //    with or
    claim(byPath, p.replace(EXT, ""), e);                         //    without the extension
  }
  return (target) => {
    const t = targetKey(target);
    if (!t) return null;
    return byBasename.get(t) || byAlias.get(t) || byPath.get(t) || null;
  };
}

/**
 * Resolve a link target against index entries ({id, path, title, aliases}).
 * Returns the entry, or null. Ties are broken by path so the choice is stable.
 *
 * Resolving many targets against one set of entries? Build the lookup once with
 * `linkResolver` — this rebuilds it, sort and all, on every call.
 */
export function resolveWikilink(target, entries) {
  return linkResolver(entries)(target);
}

/** True when the target names an embeddable asset rather than a page. */
export function isEmbeddableFile(target) {
  return /\.(png|jpe?g|gif|webp|avif|svg|pdf|canvas)$/i.test(String(target));
}

/**
 * Blank out fenced code blocks and inline code spans, preserving length and
 * line structure so every offset into the result still indexes the original.
 *
 * Obsidian does not linkify inside code, and neither may we: `CONVENTION.md`
 * ships seven `[[example]]`s inside code blocks, and without this every new
 * vault would open showing them as dead links and pull them into the graph.
 */
export function maskCode(text) {
  const src = String(text);
  const lines = src.split("\n");
  let fence = null;                                   // the open fence's marker
  const masked = lines.map((line) => {
    const m = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      // A closing fence is the same character, at least as long, alone on the line.
      const closes = m && m[1][0] === fence[0] && m[1].length >= fence.length
        && line.slice(line.indexOf(m[1]) + m[1].length).trim() === "";
      if (closes) fence = null;
      return " ".repeat(line.length);                 // fence lines are code too
    }
    if (m) { fence = m[1]; return " ".repeat(line.length); }
    // Inline code: matched backtick runs of equal length, within one line.
    return line.replace(/(`+)(?!`)([^\n]*?)\1(?!`)/g, (whole) => " ".repeat(whole.length));
  });
  return masked.join("\n");
}

/**
 * Find every wikilink in a string. Returns
 * {raw, embed, target, display, heading, start, end}.
 *
 * Offsets index the original text; links inside code are skipped.
 */
export function findWikilinks(text) {
  const out = [];
  const src = String(text);
  const scan = maskCode(src);
  const re = /(!?)\[\[([^\]\n]+?)\]\]/g;
  let m;
  // Masked regions are all spaces and so contain no `]]`; a match therefore
  // never straddles one, and the captures equal the original text at m.index.
  while ((m = re.exec(scan))) {
    const { target, display, heading } = parseWikilink(m[2]);
    out.push({
      raw: m[0], embed: m[1] === "!", target, display, heading,
      start: m.index, end: m.index + m[0].length,
    });
  }
  return out;
}
