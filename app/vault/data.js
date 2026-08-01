// Task 6.8 / 6.1: everything the app used to fetch from /api/v2, computed
// locally from the vault index.
//
// Two surfaces on purpose:
//
//   * named methods (`pages()`, `counts()`, …) — what call sites migrate to, so
//     6.8's grep for v2Get/v2Post/… reaches zero;
//   * `get()/post()/patch()/del()` path routers — which let the old fetch layer
//     be replaced in one edit, so the app is serverless before all 84 call sites
//     have moved. Remove them once the migration is finished.
//
// Endpoints absent here are gone with their features, each ruled out by the
// spec rather than by convenience: LLM anything — chat, voice, tweet, resume
// (§16); /graph (§16); /mention-tags (ordinary notes now, task 1.6); /import,
// /backup, /extension, /capture (§11, §15); /settings/* beyond local prefs
// (6.17); /links/fetch and /preview/link (§7 — a browser page cannot fetch
// arbitrary URLs, and previews come from the clipper at capture time).

import { computeDashboard } from "./dashboard.js";
import { listImages, filterImages } from "./images.js";

const DEFAULT_LIMIT = 200;

/**
 * Task 2.7 / SPEC §5: how a `note` renders is decided by its FRONTMATTER, not
 * by a subtype. This is the whole reason bookmark, snippet and markdown could
 * collapse into one kind — the distinction was always in the metadata.
 *
 * Returns one of: 'bookmark card' | 'link with source line' | 'pull-quote' | 'article'
 */
export function noteChrome(page = {}) {
  const fm = page.frontmatter || page;
  const url = fm.url || page.url;
  const ogImage = fm.og_image || page.og_image;
  const body = String(page.body ?? fm.body ?? "").trim();
  if (url && ogImage) return "bookmark card";
  if (url) return "link with source line";
  const lines = body.split("\n").filter((l) => l.trim() !== "");
  if (lines.length > 0 && lines.every((l) => l.trimStart().startsWith(">"))) return "pull-quote";
  return "article";
}
const FOLDER_FOR = { note: "notes", topic: "topics", canvas: "canvas", inspo: "inspo" };

/**
 * JSON Canvas → the shape the board view reads (`meta.layout`).
 *
 * The exact inverse of the migration's mapping — `text`→text, `link`→link,
 * `image`→`file` — so a board that made the round trip renders as it began.
 * Geometry stays read-only; this only lets the app *draw* what Obsidian owns.
 */
export function layoutFromCanvas(canvasText) {
  let doc;
  try { doc = JSON.parse(canvasText); } catch { return []; }
  return (doc.nodes || []).map((n) => {
    const box = { id: n.id, x: n.x, y: n.y, w: n.width, h: n.height };
    if (n.type === "text") return { ...box, type: "text", text: n.text || "" };
    if (n.type === "link") return { ...box, type: "link", url: n.url || "" };
    if (n.type === "file") return { ...box, type: "image", asset: n.file || "" };
    return { ...box, type: n.type };            // group, or anything JSON Canvas adds later
  });
}

function pageOut(entry, body) {
  return {
    id: entry.id,
    slug: entry.path.split("/").pop().replace(/\.md$/, ""),
    kind: entry.kind,
    title: entry.title,
    created: entry.created || entry.updated || null,
    updated: entry.updated,
    tags: entry.tags || [],
    mentions: entry.mentions || [],
    aliases: entry.aliases || [],
    meta: entry.meta || {},
    path: entry.path,
    excerpt: entry.excerpt || "",
    // List endpoints return the excerpt here on purpose: SPEC §7 forbids holding
    // full bodies in the index. `page(id)` reads the real body from disk.
    body: body !== undefined ? body : (entry.excerpt || ""),
    // `body` above is the 300-char EXCERPT unless a real one was passed in.
    // Anything caching pages must not mistake one for the other: the excerpt is
    // also whitespace-collapsed, so a `## Thread` heading in it is no longer a
    // heading. Only `page(id)` sets this true.
    bodyIsFull: body !== undefined,
    stamped: entry.stamped !== false,
    unparseable: entry.unparseable || null,
  };
}

export class Data {
  constructor(vault, opts = {}) {
    this.v = vault;
    this.renderMarkdown = opts.renderMarkdown || ((md) => md);
    this.now = opts.now || (() => new Date());
  }

  pages({ q = "", kind = "", tag = "", mention = "", limit = DEFAULT_LIMIT } = {}) {
    let items = this.v.list();
    if (kind) items = items.filter((e) => e.kind === kind);
    if (tag) items = items.filter((e) => (e.tags || []).includes(tag));
    if (mention) {
      const needle = String(mention).toLowerCase();
      const target = this.v.index.get(mention);
      const title = (target && target.title || "").toLowerCase();
      items = items.filter((e) => (e.mentions || []).some((m) => {
        const ml = m.toLowerCase();
        return ml === needle || (title && ml === title);
      }));
    }
    if (q) {
      const n = q.toLowerCase();
      items = items.filter((e) =>
        (e.title || "").toLowerCase().includes(n) ||
        (e.tags || []).some((t) => t.toLowerCase().includes(n)) ||
        (e.aliases || []).some((a) => a.toLowerCase().includes(n)) ||
        (e.excerpt || "").toLowerCase().includes(n));
    }
    const sorted = items.sort((a, b) =>
      String(b.updated || "").localeCompare(String(a.updated || "")));
    const sliced = sorted.slice(0, Math.max(0, limit));
    return { items: sliced.map((e) => pageOut(e)), count: sliced.length };
  }

  /** Task 6.5's second action: stream bodies from disk so memory stays flat. */
  async searchFullText(q, { limit = 50 } = {}) {
    const n = String(q).toLowerCase();
    if (!n) return { items: [], count: 0 };
    const hits = [];
    for (const e of this.v.list()) {
      if (hits.length >= limit) break;
      const p = await this.v.get(e.id);
      if (p && String(p.body || "").toLowerCase().includes(n)) hits.push(pageOut(e));
    }
    return { items: hits, count: hits.length };
  }

  async page(id) {
    const p = await this.v.get(id);
    if (!p) return null;
    const out = pageOut(p, p.body ?? "");
    if (p.canvas != null) out.meta = { ...out.meta, layout: layoutFromCanvas(p.canvas) };
    return out;
  }

  batch(ids) {
    const wanted = (Array.isArray(ids) ? ids : String(ids).split(","))
      .map((s) => s.trim()).filter(Boolean);
    const items = wanted.map((id) => this.v.index.get(id)).filter(Boolean).map((e) => pageOut(e));
    return { items, count: items.length };
  }

  counts() {
    const counts = {};
    for (const e of this.v.list()) counts[e.kind] = (counts[e.kind] || 0) + 1;
    return { counts };
  }

  tags() {
    const n = new Map();
    for (const e of this.v.list()) for (const t of e.tags || []) n.set(t, (n.get(t) || 0) + 1);
    return {
      tags: [...n.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([tag, count]) => ({ tag, count })),
    };
  }

  suggestMentions(q = "", limit = 8) {
    const needle = String(q).toLowerCase();
    const scored = [];
    for (const e of this.v.list()) {
      for (const h of [e.title, ...(e.aliases || [])].filter(Boolean)) {
        const hl = h.toLowerCase();
        if (!needle || hl.includes(needle)) {
          scored.push({ e, label: h, rank: !needle ? 2 : hl.startsWith(needle) ? 0 : 1 });
          break;
        }
      }
    }
    scored.sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label));
    return {
      items: scored.slice(0, limit).map((s) => ({
        id: s.e.id, title: s.label, kind: s.e.kind, path: s.e.path,
      })),
    };
  }

  /** Task 9.2: every image in the vault, resolved to its containing page. */
  async images(filter = {}) {
    const files = await this.v.be.listAll();
    const all = listImages(files, this.v.list());
    return { items: filterImages(all, filter), count: all.length };
  }

  dashboard() {
    return computeDashboard(this.v.list(), this.now());
  }

  async aboutMe() {
    const e = [...this.v.index.values()].find((x) => x.path === "context/about-me.md");
    if (!e) return { body: "", updated: null };
    const p = await this.v.get(e.id);
    return { body: p.body, updated: p.updated, path: e.path };
  }

  /** Task 6.11: an upload becomes a file in attachments/, not a POST.
   *  Returns the shape the old /assets endpoint did, so call sites are unchanged. */
  async writeAsset(file) {
    const raw = file.name || "asset";
    const dot = raw.lastIndexOf(".");
    const stem = (dot > 0 ? raw.slice(0, dot) : raw).replace(/[/\\:*?"<>|]/g, "-");
    const ext = dot > 0 ? raw.slice(dot) : "";
    let name = `${stem}${ext}`;
    let n = 2;
    while (await this.v.be.exists(`attachments/${name}`)) name = `${stem}-${n++}${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const r = await this.v.writeBlob(`attachments/${name}`, bytes);
    if (!r.ok) return r;
    return { path: `attachments/${name}`, name, url: `attachments/${name}`, bytes: bytes.length };
  }

  /** Pages that link to this one. Computed from the index, not stored. */
  backlinks(id) {
    const target = this.v.index.get(id);
    if (!target) return { items: [], count: 0 };
    const title = (target.title || "").toLowerCase();
    const items = this.v.list()
      .filter((e) => e.id !== id && (e.mentions || []).some((m) => m.toLowerCase() === title))
      .map((e) => pageOut(e));
    return { items, count: items.length };
  }

  /** Markdown → HTML, locally (S9). */
  renderHtml(md) {
    return { html: this.renderMarkdown(md || "") };
  }

  async updateAboutMe(patch = {}) {
    const e = [...this.v.index.values()].find((x) => x.path === "context/about-me.md");
    if (!e) return { ok: false, reason: "no-about-me" };
    return this.updatePage(e.id, patch);
  }

  async exportPage(id) {
    const p = await this.v.get(id);
    return p ? { markdown: p.raw ?? "", filename: p.path.split("/").pop() } : null;
  }

  async createPage(body = {}) {
    const kind = body.kind || "note";
    // An unknown kind used to fall through to `notes/` while still writing the
    // bogus `kind:` into the file — the Projects screen did exactly that and
    // produced `notes/Test Project.md` with `kind: project`, which CONVENTION's
    // four-kind vocabulary does not admit. Refuse instead of mis-filing.
    const folder = FOLDER_FOR[kind];
    if (!folder) {
      return { ok: false, reason: "unknown-kind",
               message: `no such kind: ${kind} (expected ${Object.keys(FOLDER_FOR).join(", ")})` };
    }
    const title = (body.title || "Untitled").trim();
    const stem = title.replace(/[/\\:*?"<>|]/g, " ").replace(/\s+/g, " ").trim() || "Untitled";
    // CONVENTION rule 3: when the filename cannot equal the title, the true
    // title must go in `aliases` or inbound links stop resolving. Obsidian
    // matches basename then aliases and never reads `title:`, so without this
    // `[[Slash/Colon: "Quote"]]` — the obvious way to link the page — is dead.
    const aliases = [...new Set([...(body.aliases || []), ...(stem === title ? [] : [title])])];
    const r = await this.v.put({
      path: `${folder}/${stem}.md`,
      kind, title,
      frontmatter: { kind, title, tags: body.tags || [], ...(aliases.length && { aliases }) },
      body: body.body || "",
    });
    if (!r.ok) return r;
    await this.v.buildIndex();
    return this.page(r.id);
  }

  async updatePage(id, patch = {}) {
    const cur = await this.v.get(id);
    if (!cur) return { ok: false, reason: "unknown-id" };
    const fm = { ...(cur.frontmatter || {}) };
    for (const k of ["title", "tags", "aliases", "url", "status"]) {
      if (k in patch) fm[k] = patch[k];
    }
    const r = await this.v.put({
      id, path: cur.path, frontmatter: fm,
      body: "body" in patch ? patch.body : cur.body,
      force: patch.force,
    });
    if (!r.ok) return r;
    await this.v.buildIndex();
    return this.page(id);
  }

  /**
   * SPEC: **`project` is not a kind.** A project is a folder under `projects/`
   * holding a folder note `<name>/<name>.md` plus its member pages. The screen
   * used to ask for `kind: "project"`, which nothing can ever be, so it always
   * reported an empty vault however many projects were on disk.
   */
  async projects() {
    const byFolder = new Map();
    for (const e of this.v.list()) {
      const m = /^projects\/([^/]+)\//.exec(e.path);
      if (!m) continue;
      if (!byFolder.has(m[1])) byFolder.set(m[1], []);
      byFolder.get(m[1]).push(e);
    }
    const items = [];
    for (const [name, members] of byFolder) {
      const note = members.find((e) => e.path === `projects/${name}/${name}.md`);
      const rest = members.filter((e) => e !== note);
      items.push({
        id: note ? note.id : `project:${name}`,
        name,
        title: note ? note.title : name,
        path: `projects/${name}`,
        notePath: note ? note.path : null,
        excerpt: note ? note.excerpt || "" : "",
        updated: members.map((e) => e.updated).filter(Boolean).sort().pop() || null,
        memberCount: rest.length,
        members: rest.map((e) => pageOut(e)),
      });
    }
    items.sort((a, b) => String(a.title).localeCompare(String(b.title)));
    return { items, count: items.length };
  }

  /** Create `projects/<Title>/<Title>.md` — the folder note that makes it a project. */
  async createProject(title) {
    const t = String(title || "Untitled").trim() || "Untitled";
    const stem = t.replace(/[/\\:*?"<>|]/g, " ").replace(/\s+/g, " ").trim() || "Untitled";
    const aliases = stem === t ? [] : [t];
    const r = await this.v.put({
      path: `projects/${stem}/${stem}.md`,
      kind: "note", title: t,
      frontmatter: { kind: "note", title: t, ...(aliases.length && { aliases }) },
      body: "",
    });
    if (!r.ok) return r;
    await this.v.buildIndex();
    return this.page(r.id);
  }

  async deletePage(id) {
    const r = await this.v.del(id);
    await this.v.buildIndex();
    return r;
  }

  // ── path routers (transitional; see the header) ───────────────────────
  async get(path) {
    const [base, qs = ""] = String(path).replace(/^\/+/, "").split("?");
    const q = new URLSearchParams(qs);
    const num = (k, d) => (q.get(k) ? parseInt(q.get(k), 10) : d);
    if (base === "counts") return this.counts();
    if (base === "tags") return this.tags();
    if (base === "dashboard") return this.dashboard();
    if (base === "about-me") return this.aboutMe();
    if (base === "mentions/suggest") return this.suggestMentions(q.get("q") || "", num("limit", 8));
    if (base === "pages/batch") return this.batch(q.get("ids") || "");
    if (base === "pages") {
      return this.pages({
        q: q.get("q") || "", kind: q.get("kind") || "", tag: q.get("tag") || "",
        mention: q.get("mention") || "", limit: num("limit", DEFAULT_LIMIT),
      });
    }
    if (base.startsWith("pages/")) return this.page(base.slice(6));
    // These two look like /export/<id> but are not. Matching them as an id
    // would return null and read as "no such page" instead of "feature gone".
    if (base === "export/resume") {
      throw new Error("no local implementation for GET /export/resume — resume "
        + "export was an LLM feature, deleted per SPEC §16");
    }
    if (base === "export/all") {
      throw new Error("no local implementation for GET /export/all — the vault "
        + "is already a folder of markdown; copy it");
    }
    if (base.startsWith("export/")) return this.exportPage(base.slice(7));
    throw new Error(`no local implementation for GET /${base} — see data.js header`);
  }

  async post(path, body) {
    const base = String(path).replace(/^\/+/, "").split("?")[0];
    if (base === "pages") return this.createPage(body);
    if (base === "render/markdown") return { html: this.renderMarkdown((body && body.md) || "") };
    throw new Error(`no local implementation for POST /${base} — see data.js header`);
  }

  async patch(path, body) {
    const base = String(path).replace(/^\/+/, "").split("?")[0];
    if (base.startsWith("pages/")) return this.updatePage(base.slice(6), body);
    throw new Error(`no local implementation for PATCH /${base} — see data.js header`);
  }

  async del(path) {
    const base = String(path).replace(/^\/+/, "").split("?")[0];
    if (base.startsWith("pages/")) return this.deletePage(base.slice(6));
    throw new Error(`no local implementation for DELETE /${base} — see data.js header`);
  }
}
