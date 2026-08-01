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

/** Basename of a vault path, without the extension. */
export function basenameOf(path) {
  const name = String(path).split("/").pop();
  return name.replace(/\.(md|canvas)$/i, "");
}

/**
 * Resolve a link target against index entries ({id, path, title, aliases}).
 * Returns the entry, or null. Ties are broken by path so the choice is stable.
 */
export function resolveWikilink(target, entries) {
  const t = lower(String(target).replace(/\.(md|canvas)$/i, "")).trim();
  if (!t) return null;
  const sorted = [...entries].sort((a, b) => String(a.path).localeCompare(String(b.path)));

  // 1) filename basename — what Obsidian tries first
  for (const e of sorted) if (lower(basenameOf(e.path)) === t) return e;
  // 2) aliases
  for (const e of sorted) {
    for (const a of e.aliases || []) if (lower(a) === t) return e;
  }
  // 3) relative path, with or without extension
  for (const e of sorted) {
    const p = lower(e.path);
    if (p === t || p.replace(/\.(md|canvas)$/i, "") === t) return e;
  }
  return null;
}

/** True when the target names an embeddable asset rather than a page. */
export function isEmbeddableFile(target) {
  return /\.(png|jpe?g|gif|webp|avif|svg|pdf|canvas)$/i.test(String(target));
}

/**
 * Find every wikilink in a string. Returns
 * {raw, embed, target, display, heading, start, end}.
 */
export function findWikilinks(text) {
  const out = [];
  const re = /(!?)\[\[([^\]\n]+?)\]\]/g;
  let m;
  while ((m = re.exec(String(text)))) {
    const { target, display, heading } = parseWikilink(m[2]);
    out.push({
      raw: m[0], embed: m[1] === "!", target, display, heading,
      start: m.index, end: m.index + m[0].length,
    });
  }
  return out;
}
