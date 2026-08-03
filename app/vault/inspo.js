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
//   #ui #gradient           ← tags: a line of #tokens
//   https://dribbble.com/x  ← source link: a bare URL line
//
//   ![[attachments/b.png]]  ← blank line separates items
//
// Items before the first heading are ungrouped. An item needs an image OR a
// link — a bare link is a legitimate inspiration too.

const IMG_EMBED = /^!\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]$/;
const BARE_URL = /^https?:\/\/\S+$/i;
const TAG_LINE = /^#[^\s#]/;
const HEADING = /^##\s+(.+?)\s*$/;

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
    const item = { image: null, caption: "", tags: [], url: null };
    const captions = [];
    for (const ln of lines) {
      const img = ln.match(IMG_EMBED);
      if (img && !item.image) { item.image = img[1]; continue; }
      if (BARE_URL.test(ln) && !item.url) { item.url = ln; continue; }
      if (TAG_LINE.test(ln) && ln.split(/\s+/).every((t) => t.startsWith("#"))) {
        item.tags.push(...ln.split(/\s+/).map((t) => t.replace(/^#/, "")).filter(Boolean));
        continue;
      }
      captions.push(ln);
    }
    item.caption = captions.join(" ");
    item.tags = [...new Set(item.tags)];
    // A block with neither an image nor a link is prose, not an item — the
    // page intro, say. It stays in the caption-less void rather than becoming
    // a broken card. (Serialization preserves items only; freeform prose on an
    // inspo page is not part of this model.)
    if (item.image || item.url) cur.items.push(item);
  }
  return { groups };
}

/** The inverse. Canonical order inside an item: image, caption, tags, url. */
export function serializeInspoBody(model) {
  const out = [];
  for (const g of (model && model.groups) || []) {
    if (g.name) out.push(`## ${g.name}`);
    for (const it of g.items || []) {
      const lines = [];
      if (it.image) lines.push(`![[${it.image}]]`);
      if (it.caption && it.caption.trim()) lines.push(it.caption.trim());
      if (it.tags && it.tags.length) lines.push(it.tags.map((t) => `#${t}`).join(" "));
      if (it.url) lines.push(it.url);
      if (lines.length) out.push(lines.join("\n"));
    }
  }
  return out.join("\n\n") + (out.length ? "\n" : "");
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
                   tags: [], url: it.assetUrl || null });
    } else if (it.type === "link" && it.url) {
      items.push({ image: null, caption: it.caption || it.title || "", tags: [], url: it.url });
    }
  }
  return items;
}
