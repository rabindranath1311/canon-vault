// The inspo page model: a bento grid stored as plain markdown.
//
// An inspo page used to keep its items in a `.canvas` sibling, which made it a
// worse canvas instead of a good reference wall. The model here is ordinary
// markdown, so Obsidian renders the very same page as images with captions —
// nothing app-private, per the README's rule.
//
//   ## Moodboard            ← a group is a section heading
//   ![[attachments/a.png]]  ← the image (a vault embed)
//   Neon gradient hero      ← caption: any plain line
//   > Works because the     ← the note: why it works, the rule, when to
//   > type carries it.        reach for it. Any number of `>` lines.
//   #ui #gradient           ← tags: a line of #tokens
//   https://dribbble.com/x  ← source link: a bare URL line
//
//   ![[attachments/b.png]]  ← blank line separates items
//
// Items before the first heading are ungrouped. An item needs an image OR a
// link — a bare link is a legitimate inspiration too.
//
// The NOTE is what turns a wall of pictures into something you can use later.
// A caption says what a thing is; the note says why it is here and when to
// reach for it, which is the part you cannot reconstruct from the image six
// months on. It is a blockquote because that is the markdown for "commentary
// on the thing above" — Obsidian renders it as an indented quote under the
// picture with no plugin, and it cannot be confused with a caption.
//
// A wikilink inside a caption or a note is an ordinary wikilink: the vault
// harvests it into `mentions` like any other, so one wall can cite another,
// or a topic, without this model needing a concept of "related".

const IMG_EMBED = /^!\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]$/;
const BARE_URL = /^https?:\/\/\S+$/i;
const TAG_LINE = /^#[^\s#]/;
const HEADING = /^##\s+(.+?)\s*$/;
const NOTE_LINE = /^>\s?(.*)$/;

/** body → { groups: [{ name, items: [{image, caption, tags, url}] }] }.
 *  groups[0] is always the unnamed one (possibly empty). */
export function parseInspoBody(body) {
  const groups = [{ name: "", items: [] }];
  let cur = groups[0];
  const blocks = String(body || "").split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    const head = lines[0].match(HEADING);
    if (head) {
      cur = { name: head[1], items: [] };
      groups.push(cur);
      lines.shift();
      if (!lines.length) continue;
    }
    const item = { image: null, caption: "", note: "", tags: [], url: null };
    const captions = [];
    const notes = [];
    for (const ln of lines) {
      const img = ln.match(IMG_EMBED);
      if (img && !item.image) { item.image = img[1]; continue; }
      // Before the URL and tag tests: a note may legitimately be a sentence
      // that starts with a link, or a line of hashtags being quoted.
      const note = ln.match(NOTE_LINE);
      if (note) { notes.push(note[1]); continue; }
      if (BARE_URL.test(ln) && !item.url) { item.url = ln; continue; }
      if (TAG_LINE.test(ln) && ln.split(/\s+/).every((t) => t.startsWith("#"))) {
        item.tags.push(...ln.split(/\s+/).map((t) => t.replace(/^#/, "")).filter(Boolean));
        continue;
      }
      captions.push(ln);
    }
    item.caption = captions.join(" ");
    // Kept as written, line breaks and all — a rule and a "when to use" are
    // two thoughts, and joining them into one paragraph loses that.
    item.note = notes.join("\n").trim();
    item.tags = [...new Set(item.tags)];
    // A block with neither an image nor a link is prose, not an item — the
    // page intro, say. It stays in the caption-less void rather than becoming
    // a broken card. (Serialization preserves items only; freeform prose on an
    // inspo page is not part of this model.)
    if (item.image || item.url) cur.items.push(item);
  }
  return { groups };
}

/** The inverse. Canonical order: image, caption, note, tags, url. */
export function serializeInspoBody(model) {
  const out = [];
  for (const g of (model && model.groups) || []) {
    if (g.name) out.push(`## ${g.name}`);
    for (const it of g.items || []) {
      const lines = [];
      if (it.image) lines.push(`![[${it.image}]]`);
      if (it.caption && it.caption.trim()) lines.push(it.caption.trim());
      if (it.note && it.note.trim()) {
        // Every line quoted, blank ones included — an unquoted blank line
        // inside a block would split one item into two on the way back in.
        for (const ln of it.note.trim().split("\n")) lines.push(ln.trim() ? `> ${ln.trim()}` : ">");
      }
      if (it.tags && it.tags.length) lines.push(it.tags.map((t) => `#${t}`).join(" "));
      if (it.url) lines.push(it.url);
      if (lines.length) out.push(lines.join("\n"));
    }
  }
  return out.join("\n\n") + (out.length ? "\n" : "");
}

/**
 * Put one item on a wall: its block goes first in its group, where
 * `serializeInspoBody` would put it, and every other byte of the page stays
 * as it was. Re-serializing the whole model instead dropped what the model
 * does not hold — an intro paragraph, an embed's `|300` size, a caption
 * wrapped over two lines. On a page already in the canonical form the two
 * give the same text.
 *
 * `group` "" is the ungrouped items before the first heading; a named group
 * that is not on the page is added at the end. Returns `{ body, group }`.
 */
export function insertItem(body, item, group = "") {
  const text = String(body ?? "");
  const block = serializeInspoBody({ groups: [{ name: "", items: [item] }] }).replace(/\n$/, "");
  const lines = text.split("\n");
  const wanted = String(group || "").trim();
  const name = wanted.toLowerCase();
  let firstHeading = -1, firstLoose = -1;
  for (let i = 0; i < lines.length; i++) {
    // A block starts at a non-empty line after an empty one — the split
    // `parseInspoBody` makes on two or more newlines.
    if (lines[i] === "" || (i > 0 && lines[i - 1] !== "")) continue;
    let j = i;
    while (j < lines.length && lines[j] !== "") j++;
    const own = lines.slice(i, j);
    const first = own.findIndex((l) => l.trim());
    if (first < 0) continue;
    const head = own[first].trim().match(HEADING);
    if (head) {
      if (firstHeading < 0) firstHeading = i;
      if (name && head[1].toLowerCase() === name) {
        const at = i + first;
        const before = lines.slice(0, at + 1).join("\n");
        const rest = lines.slice(at + 1);
        while (rest.length && rest[0] === "") rest.shift();
        const after = rest.join("\n");
        return { body: after ? `${before}\n\n${block}\n\n${after}` : `${before}\n\n${block}\n`, group: head[1] };
      }
    } else if (!name && firstHeading < 0 && firstLoose < 0
               && parseInspoBody(own.join("\n")).groups[0].items.length) {
      firstLoose = i;
    }
  }
  if (!name) {
    const at = firstLoose >= 0 ? firstLoose : firstHeading;
    if (at >= 0) {
      const before = lines.slice(0, at).join("\n");
      return { body: `${before}${at > 0 ? "\n" : ""}${block}\n\n${lines.slice(at).join("\n")}`, group: "" };
    }
  }
  const kept = text.replace(/\s+$/, "");
  const head = name ? `## ${wanted}\n\n` : "";
  return { body: `${kept ? `${kept}\n\n` : ""}${head}${block}\n`, group: name ? wanted : "" };
}

/** Every tag on the page, for the filter strip. */
export function inspoTags(model) {
  const all = new Set();
  for (const g of (model && model.groups) || [])
    for (const it of g.items || [])
      for (const t of it.tags || []) all.add(t);
  return [...all].sort();
}

/** A `.canvas` board's items translated into inspo items — the migration for
 *  pages made under the old model. Text nodes become captions-only prose and
 *  are dropped; images and links carry over. */
export function itemsFromCanvasLayout(layout) {
  const items = [];
  for (const it of layout || []) {
    if (it.type === "image" && (it.asset || it.assetUrl)) {
      items.push({ image: it.asset || null, caption: it.caption || "",
                   note: "", tags: [], url: it.assetUrl || null });
    } else if (it.type === "link" && it.url) {
      items.push({ image: null, caption: it.caption || it.title || "",
                   note: "", tags: [], url: it.url });
    }
  }
  return items;
}
