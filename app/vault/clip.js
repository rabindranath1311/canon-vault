// What a web capture becomes on disk.
//
// The clipper (extension/) runs in a browser extension; this module is the half
// of it that has no browser in it, so the rules live where `node --test` can
// reach them. The extension mirrors this file verbatim — see
// scripts/sync-extension.mjs.
//
// Everything arriving here is **untrusted page content**: a title, an
// `og:description`, an alt text, a selection. A page can put anything in those,
// including the exact strings this vault's file format treats as structure. So
// every field is normalised before it is written, and the normalisation is what
// most of this file is:
//
//   - a caption is ONE line, because a blank line inside one would split an
//     inspo item in two (inspo.js splits on /\n{2,}/);
//   - a caption never *starts* like something else — `#tag`, `## Group`,
//     `![[embed]]`, a bare URL — because inspo.js reads those lines by shape,
//     and a page that titled itself `## Attachments` would otherwise forge a
//     section boundary;
//   - a URL is http(s) or it is dropped, so a `javascript:` href cannot be
//     stored and later clicked out of the app or Obsidian.
//
// `mdfile.escapeUser` already guards the five structural headings on the body
// side. This is the same idea applied to the shapes inspo.js reads.

import { parseInspoBody, serializeInspoBody } from "./inspo.js";
import { FIELD_ORDER, REQUIRED } from "./mdfile.js";

/** Frontmatter a capture is allowed to set. The vault owns the rest. */
export const CLIP_FIELDS = FIELD_ORDER.filter(
  (k) => !REQUIRED.includes(k) && !["tags", "aliases", "excalidraw-plugin"].includes(k));

export const MAX_CAPTION = 300;
export const MAX_TAGS = 12;
export const MAX_STEM = 80;

const IMAGE_MIME = {
  "image/png": ".png", "image/jpeg": ".jpg", "image/jpg": ".jpg",
  "image/gif": ".gif", "image/webp": ".webp", "image/avif": ".avif",
  "image/svg+xml": ".svg",
};
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg)$/i;

// Tracking parameters. Two identical references clipped from a newsletter and
// from a tweet differ only by these, and a wall that shows the same picture
// twice is a wall nobody trusts.
const JUNK_PARAMS = /^(utm_|fbclid$|gclid$|mc_[ce]id$|igshid$|ref_src$|ref_url$|si$|s$|t$)/i;

/** An http(s) URL, or null. Anything else — javascript:, data:, chrome: — is dropped. */
export function safeUrl(raw) {
  const s = String(raw ?? "").trim();
  if (!/^https?:\/\//i.test(s)) return null;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch { return null; }
}

/** The same reference, spelled the same way twice — for dedupe only, never stored. */
export function canonicalUrl(raw) {
  const safe = safeUrl(raw);
  if (!safe) return null;
  const u = new URL(safe);
  for (const k of [...u.searchParams.keys()]) if (JUNK_PARAMS.test(k)) u.searchParams.delete(k);
  u.hash = "";
  u.hostname = u.hostname.replace(/^www\./i, "").toLowerCase();
  let path = u.pathname.replace(/\/+$/, "");
  return `${u.hostname}${path}${u.search}`;
}

/** Collapse to a single trimmed line, capped. Newlines are the danger, not the length. */
export function oneLine(text, max = MAX_CAPTION) {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

/**
 * A caption that cannot be mistaken for one of inspo.js's other line shapes.
 *
 * The escapes are markdown's own, so Obsidian renders the text the user saw:
 * `\#` prints `#`, and `<https://…>` prints (and links) the URL.
 */
export function safeCaption(text, max = MAX_CAPTION) {
  const line = oneLine(text, max);
  if (!line) return "";
  if (/^https?:\/\/\S+$/i.test(line)) return `<${line}>`;
  if (/^[#!]/.test(line)) return "\\" + line;
  return line;
}

/** `#UI Design` → `ui-design`. Tags are filenames-adjacent; keep them boring. */
export function normalizeTags(tags) {
  const out = [];
  for (const raw of [].concat(tags || [])) {
    for (const piece of String(raw).split(/[\s,]+/)) {
      const t = piece.replace(/^#+/, "").replace(/[^A-Za-z0-9_/-]/g, "-")
        .replace(/-{2,}/g, "-").replace(/^[-/]+|[-/]+$/g, "").toLowerCase();
      if (t && !out.includes(t)) out.push(t);
      if (out.length >= MAX_TAGS) return out;
    }
  }
  return out;
}

/** A filename the filesystem and `[[Wikilinks]]` both accept. */
export function safeStem(text, max = MAX_STEM) {
  const s = String(text ?? "")
    .replace(/[/\\:*?"<>|]/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+/, "")
    .trim();
  return s.length > max ? s.slice(0, max).trim() : s;
}

/**
 * What to call the image file. The source URL's own basename when it has one —
 * so the file in `attachments/` is recognisable next to the site it came from —
 * and the page title otherwise. The extension is decided by the MIME type the
 * server actually sent, never by the URL, because half the web serves `.php`.
 */
export function attachmentName(capture = {}) {
  const mime = String(capture.mime || "").split(";")[0].trim().toLowerCase();
  const ext = IMAGE_MIME[mime] || (IMAGE_EXT.exec(String(capture.src || "")) || [])[0] || ".png";
  let stem = "";
  const src = safeUrl(capture.src);
  if (src) {
    const base = decodeURIComponent(new URL(src).pathname.split("/").pop() || "");
    // Any trailing extension, not only an image one: plenty of images are
    // served from `/hero.php` or `/asset.aspx`, and `hero.php.webp` is a
    // filename that tells the truth about nothing.
    stem = safeStem(base.replace(/\.[A-Za-z0-9]{1,6}$/, "").replace(/[._-]+$/, ""), 48);
  }
  if (!stem) stem = safeStem(oneLine(capture.title || capture.caption || "", 48), 48);
  if (!stem) stem = "clip";
  const day = String(capture.capturedAt || "").slice(0, 10);
  return `${stem}${day ? ` ${day}` : ""}${ext.toLowerCase()}`;
}

/**
 * The caption an item gets when the user typed nothing: what the page called
 * itself, or what the image called itself. A picture with no words at all is
 * still a legitimate item — `caption` may come back empty.
 */
function captionFor(capture) {
  return safeCaption(capture.note || capture.caption || capture.alt || capture.title || "");
}

/**
 * A capture → an inspo item. `assetPath` is where the bytes were written
 * (`attachments/…`), absent for a link-only reference.
 *
 * An item needs an image or a link — inspo.js drops one with neither — so this
 * returns null rather than writing a card that the next parse would discard.
 */
export function captureToItem(capture = {}, assetPath = null) {
  const image = assetPath ? String(assetPath) : null;
  const url = safeUrl(capture.url || capture.pageUrl);
  if (!image && !url) return null;
  return {
    image,
    caption: captionFor(capture),
    tags: normalizeTags(capture.tags),
    url,
  };
}

/** Two items are the same reference when they point at the same thing. */
export function itemKey(item = {}) {
  if (item.image) return `image:${String(item.image).toLowerCase()}`;
  const c = canonicalUrl(item.url);
  return c ? `url:${c}` : `caption:${oneLine(item.caption || "").toLowerCase()}`;
}

/**
 * Add an item to a wall's markdown body, newest first, in `group`.
 *
 * Returns the body unchanged with `added: false` when the wall already holds
 * that reference — clipping the same shot twice is a slip, not an instruction,
 * and silently doubling it is how a reference pile stops being usable.
 */
export function addItemToWall(body, item, { group = "", dedupe = true } = {}) {
  if (!item) return { body: String(body ?? ""), added: false, reason: "empty-item" };
  const model = parseInspoBody(body || "");
  if (dedupe) {
    const key = itemKey(item);
    for (const g of model.groups) {
      for (const it of g.items) {
        if (itemKey(it) === key) {
          return { body: serializeInspoBody(model), added: false, reason: "duplicate",
                   group: g.name };
        }
      }
    }
  }
  const name = String(group || "").trim();
  let target = name
    ? model.groups.find((g) => g.name.toLowerCase() === name.toLowerCase())
    : model.groups[0];
  if (!target) {
    target = { name, items: [] };
    model.groups.push(target);
  }
  target.items.unshift(item);
  return { body: serializeInspoBody(model), added: true, group: target.name };
}

/**
 * A capture → the arguments for `Data.createPage`, for the captures that are
 * pages rather than wall items.
 *
 * `kind: "bookmark"` is the *view*, not a storage kind — createPage turns it
 * into a note carrying `url`, which is what the convention says a bookmark is.
 * The og_* keys are what make it render as a card rather than a bare link;
 * `og_image` stays a remote URL on purpose, so the card shows the publisher's
 * artwork without the vault swallowing a copy of every thumbnail on the web.
 */
export function captureToBookmark(capture = {}) {
  const url = safeUrl(capture.url || capture.pageUrl);
  if (!url) return null;
  const og = capture.og || {};
  const title = oneLine(capture.title || og.title || "", MAX_STEM) || titleFromUrl(url);
  const fm = {
    url,
    ...(safeUrl(og.image) && { og_image: safeUrl(og.image) }),
    ...(oneLine(og.title || "") && { og_title: oneLine(og.title) }),
    ...(oneLine(og.description || "") && { og_description: oneLine(og.description) }),
    ...(oneLine(og.siteName || "") && { og_site_name: oneLine(og.siteName, 80) }),
    ...(oneLine(og.author || "") && { author: oneLine(og.author, 80) }),
    ...(capture.capturedAt && { captured: capture.capturedAt }),
  };
  return {
    kind: "bookmark",
    title,
    tags: normalizeTags(capture.tags),
    frontmatter: fm,
    body: bookmarkBody(capture),
  };
}

/**
 * What to call a link nobody named — clipped from a context menu, where the
 * only thing known about it is the href.
 *
 * The host alone would do, but every link from one site would then want the
 * same filename and the second would be `stripe.com 2` — a name that says
 * nothing and cannot be linked to. The last path segment is what the site
 * itself calls the page, so it is the better half of the pair.
 */
export function titleFromUrl(url) {
  const safe = safeUrl(url);
  if (!safe) return "";
  const u = new URL(safe);
  const host = u.hostname.replace(/^www\./i, "");
  const last = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || "");
  const stem = oneLine(last.replace(/\.[A-Za-z0-9]{1,6}$/, "").replace(/[-_+]+/g, " "), 60);
  return stem ? `${stem} — ${host}` : host;
}

/**
 * The body of a clipped page: what the user selected, as a quotation, plus
 * whatever they typed in the popup. Blank when they took neither — the card is
 * the content, and an invented summary would be a lie about provenance.
 */
export function bookmarkBody(capture = {}) {
  const parts = [];
  const quote = String(capture.text || "").trim();
  if (quote) parts.push(quote.split("\n").map((l) => `> ${l}`.trimEnd()).join("\n"));
  const note = String(capture.note || "").trim();
  if (note) parts.push(note);
  return parts.join("\n\n");
}

/**
 * A selection with no link worth keeping → a `note` whose body is one
 * blockquote, which `noteChrome` renders as a pull-quote.
 */
export function captureToQuote(capture = {}) {
  const text = String(capture.text || "").trim();
  if (!text) return null;
  const url = safeUrl(capture.url || capture.pageUrl);
  const title = oneLine(capture.title || text, MAX_STEM);
  return {
    kind: url ? "bookmark" : "note",
    title,
    tags: normalizeTags(capture.tags),
    frontmatter: {
      ...(url && { url }),
      ...(capture.capturedAt && { captured: capture.capturedAt }),
    },
    body: bookmarkBody(capture),
  };
}

/** Only the frontmatter keys a capture may set, with empty values dropped. */
export function clipFrontmatter(fm = {}) {
  const out = {};
  for (const k of CLIP_FIELDS) {
    const v = fm[k];
    if (v === null || v === undefined || v === "") continue;
    out[k] = v;
  }
  return out;
}

/**
 * Where a wall lives. A wall is an ordinary inspo page, so this is just the
 * convention's filename rule — the caller still asks the vault whether that
 * path exists before creating anything.
 */
export function wallPath(title) {
  const stem = safeStem(title);
  return stem ? `inspo/${stem}.md` : null;
}

// ── writing one ─────────────────────────────────────────────────────────────
//
// The clipper's orchestration lives here, above the `Vault`/`Data` it is handed
// rather than inside the extension, for the ordinary reason: this is where the
// decisions are, and a decision that can only be exercised by clicking through
// Chrome is a decision nobody can test. `applyCapture` runs against a
// MemoryBackend in app/test/clip.test.js exactly as it runs against a folder.

/** The wall by that name, created if this is the first clip onto it. */
export async function ensureWall(data, vault, title) {
  const want = wallPath(title);
  if (!want) throw new Error("that wall name cannot be a filename");
  const byPath = vault.byPath.get(want);
  if (byPath) return byPath;
  const byTitle = vault.list().find(
    (e) => e.kind === "inspo" && String(e.title).toLowerCase() === String(title).toLowerCase());
  if (byTitle) return byTitle;
  const made = await data.createPage({ kind: "inspo", title });
  if (!made || made.ok === false) {
    throw new Error(`could not create the wall: ${(made && made.reason) || "unknown"}`);
  }
  const entry = vault.index.get(made.id);
  if (!entry) throw new Error("the wall was written but is not in the index");
  return entry;
}

/** A page already holding this url — clipping the same link twice is a slip. */
export function findByUrl(vault, url) {
  const key = canonicalUrl(url);
  if (!key) return null;
  return vault.list().find((e) => e.url && canonicalUrl(e.url) === key) || null;
}

/** Blob → the shape `Data.writeAsset` reads. Deliberately not a `File`: a
 *  service worker need not have that constructor, and two properties is the
 *  whole contract. */
function asAsset(blob, name) {
  return { name, arrayBuffer: () => blob.arrayBuffer() };
}

/** Where a capture goes when nothing said otherwise. */
export function targetFor(capture = {}, settings = {}) {
  if (capture.target) return capture.target;
  if (capture.blob || capture.assetPath) return "wall";
  if (capture.type === "selection" && !safeUrl(capture.url || capture.pageUrl)) return "quote";
  return settings.linkTarget || "bookmark";
}

/**
 * Write one capture into the vault.
 *
 * Returns `{ok, path, skipped?}`. `skipped` is a *success*: the reference is
 * already there, which is what the user wanted — and re-adding it would cost a
 * `.history` snapshot and a duplicate card to say the same thing.
 *
 * `onAsset` is called the moment image bytes land in `attachments/`, so a retry
 * after a failed page write reuses that file instead of writing a second copy.
 */
export async function applyCapture(data, vault, capture, opts = {}) {
  const { settings = {}, onAsset = null } = opts;
  const target = targetFor(capture, settings);

  if (target === "wall") {
    const entry = await ensureWall(data, vault, capture.wall || settings.wall);

    let assetPath = capture.assetPath || null;
    if (!assetPath && capture.blob) {
      const written = await data.writeAsset(asAsset(capture.blob, attachmentName(capture)));
      if (!written || written.ok === false) {
        return { ok: false, reason: (written && written.reason) || "asset-write-failed" };
      }
      assetPath = written.path;
      if (onAsset) await onAsset(assetPath);
    }

    const item = captureToItem(capture, assetPath);
    if (!item) return { ok: false, reason: "nothing-to-save" };

    const page = await data.page(entry.id);
    const next = addItemToWall(page.body || "", item, {
      group: capture.group ?? settings.group ?? "",
      dedupe: settings.dedupe !== false,
    });
    if (!next.added) {
      return { ok: true, skipped: next.reason, path: entry.path, wall: entry.title };
    }
    const saved = await data.updatePage(entry.id, { body: next.body });
    if (saved && saved.ok === false) {
      return { ok: false, reason: saved.reason, message: saved.message, assetPath };
    }
    return { ok: true, path: entry.path, wall: entry.title, assetPath, item };
  }

  const plan = target === "quote" ? captureToQuote(capture) : captureToBookmark(capture);
  if (!plan) return { ok: false, reason: "nothing-to-save" };

  if (settings.dedupe !== false && plan.frontmatter && plan.frontmatter.url) {
    const dupe = findByUrl(vault, plan.frontmatter.url);
    if (dupe) return { ok: true, skipped: "duplicate", path: dupe.path, title: dupe.title };
  }

  const made = await data.createPage(plan);
  if (!made || made.ok === false) {
    return { ok: false, reason: (made && made.reason) || "create-failed",
             message: made && made.message };
  }
  return { ok: true, path: made.path, title: made.title, id: made.id };
}
