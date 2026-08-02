// The §9 data layer. Every file access in the app goes through here; app.js
// never touches a file API directly. That seam is what makes a native shell an
// add-on rather than a rewrite.
//
// One core, two backends. `FSABackend` is the File System Access API;
// `MemoryBackend` is an in-memory filesystem so the whole thing is testable
// under `node --test` with no browser and no npm install (task 5.11).

import { serialize, parse, escapeUser, unescapeUser, REQUIRED } from "./mdfile.js";
import { isExcalidrawPath, stripExcalidrawData } from "./excalidraw.js";

export const IGNORED_DIRS = [".git", ".obsidian", ".trash", ".history"];
export const KIND_BY_FOLDER = {
  notes: "note", topics: "topic", canvas: "canvas",
  inspo: "inspo", projects: "project", context: "note",
};
const HISTORY_KEEP = 10;
const EXCERPT = 300;

const isIgnored = (path) =>
  path.split("/").some((p) => IGNORED_DIRS.includes(p) || (p.startsWith(".") && p !== "."));

// ── tags ────────────────────────────────────────────────────────────────────
// Task 5.24. `#` is only a tag outside fenced blocks and inline code, and only
// when it opens a word at a boundary — so `## Heading` and `example.com/#frag`
// are not tags.
export function extractInlineTags(body) {
  const stripped = String(body)
    .replace(/^```[\s\S]*?^```/gm, "")
    .replace(/^~~~[\s\S]*?^~~~/gm, "")
    .replace(/`[^`\n]*`/g, "");
  const out = new Set();
  for (const m of stripped.matchAll(/(?:^|\s)#([A-Za-z0-9_][\w/-]*)/g)) out.add(m[1]);
  return [...out];
}

export function inferKind(path) {
  // The file format identifies itself, so the extension wins over the folder.
  // Same reasoning as a bare `.canvas` below: a drawing written by Obsidian's
  // Excalidraw plugin carries no `kind:` — its frontmatter is
  // `excalidraw-plugin: parsed` — so there is nothing else to read it from.
  if (isExcalidrawPath(path)) return "excalidraw";
  const top = path.split("/")[0];
  return KIND_BY_FOLDER[top] || "note";
}

/** `canvas/Board.excalidraw.md` → `Board`. Both extensions, not just `.md`. */
export function titleFromPath(path) {
  return String(path).split("/").pop().replace(/\.excalidraw\.md$/i, "").replace(/\.md$/, "");
}

function excerptOf(body) {
  return String(body).replace(/\s+/g, " ").trim().slice(0, EXCERPT);
}

function stamp(iso) {
  return iso.replace(/:/g, "-");
}

// ── backends ────────────────────────────────────────────────────────────────

export class MemoryBackend {
  constructor(files = {}) {
    this.files = new Map();          // path -> {data: Uint8Array, mtime: number}
    this.clock = 1;
    for (const [p, v] of Object.entries(files)) this.writeText(p, v);
  }
  #enc(s) { return new TextEncoder().encode(s); }
  async listAll() {
    return [...this.files.entries()]
      .filter(([p]) => !isIgnored(p))
      .map(([path, f]) => ({ path, mtime: f.mtime, size: f.data.length }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }
  async exists(path) { return this.files.has(path); }
  async stat(path) {
    const f = this.files.get(path);
    return f ? { mtime: f.mtime, size: f.data.length } : null;
  }
  async readBytes(path) {
    const f = this.files.get(path);
    if (!f) throw new Error(`ENOENT: ${path}`);
    return f.data;
  }
  async readText(path) { return new TextDecoder("utf-8", { fatal: true }).decode(await this.readBytes(path)); }
  async writeBytes(path, bytes) { this.files.set(path, { data: bytes, mtime: this.clock++ }); }
  async writeText(path, text) { await this.writeBytes(path, this.#enc(text)); }
  async move(from, to) {
    const f = this.files.get(from);
    if (!f) throw new Error(`ENOENT: ${from}`);
    this.files.set(to, f);
    this.files.delete(from);
  }
  async listDir(prefix) {
    return [...this.files.keys()].filter((p) => p.startsWith(prefix + "/"));
  }
  async mkdirp() { /* directories are implicit in the memory backend */ }
  async remove(path) { this.files.delete(path); }
}

export class FSABackend {
  constructor(rootHandle) { this.root = rootHandle; }
  async #dir(parts, create = false) {
    let h = this.root;
    for (const p of parts) h = await h.getDirectoryHandle(p, { create });
    return h;
  }
  async #file(path, create = false) {
    const parts = path.split("/");
    const name = parts.pop();
    const dir = await this.#dir(parts, create);
    return dir.getFileHandle(name, { create });
  }
  async listAll() {
    const out = [];
    const walk = async (dir, prefix) => {
      for await (const [name, handle] of dir.entries()) {
        const path = prefix ? `${prefix}/${name}` : name;
        if (handle.kind === "directory") {
          if (IGNORED_DIRS.includes(name) || name.startsWith(".")) continue;
          await walk(handle, path);
        } else {
          const f = await handle.getFile();
          out.push({ path, mtime: f.lastModified, size: f.size });
        }
      }
    };
    await walk(this.root, "");
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }
  async exists(path) {
    try { await this.#file(path); return true; } catch { return false; }
  }
  async stat(path) {
    try {
      const f = await (await this.#file(path)).getFile();
      return { mtime: f.lastModified, size: f.size };
    } catch { return null; }
  }
  async readBytes(path) {
    const f = await (await this.#file(path)).getFile();
    return new Uint8Array(await f.arrayBuffer());
  }
  async readText(path) {
    const f = await (await this.#file(path)).getFile();
    const buf = await f.arrayBuffer();
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  }
  async writeBytes(path, bytes) {
    const h = await this.#file(path, true);
    const w = await h.createWritable();      // temp file, swapped on close
    await w.write(bytes);
    await w.close();
  }
  async writeText(path, text) {
    await this.writeBytes(path, new TextEncoder().encode(text));
  }
  async move(from, to) {
    const bytes = await this.readBytes(from);
    await this.writeBytes(to, bytes);
    const parts = from.split("/");
    const name = parts.pop();
    (await this.#dir(parts)).removeEntry(name);
  }
  async listDir(prefix) {
    return (await this.listAll()).map((f) => f.path).filter((p) => p.startsWith(prefix + "/"));
  }
  async remove(path) {
    const parts = path.split("/");
    const name = parts.pop();
    (await this.#dir(parts)).removeEntry(name);
  }
  async mkdirp(path) { await this.#dir(path.split("/"), true); }
}

// ── writer election (5.10 / 5.23) ───────────────────────────────────────────

export class WriterElection {
  constructor(channel, id = Math.random().toString(36).slice(2)) {
    this.id = id;
    this.peers = new Map();
    this.isWriter = true;
    this.ch = channel;
    if (this.ch) {
      this.ch.onmessage = (e) => this.#onMessage(e.data);
      this.ch.postMessage({ type: "hello", id: this.id });
    }
  }
  #onMessage(msg) {
    if (msg.id === this.id) return;
    if (msg.type === "hello") {
      this.peers.set(msg.id, Date.now());
      this.ch.postMessage({ type: "here", id: this.id });
    } else if (msg.type === "here") {
      this.peers.set(msg.id, Date.now());
    } else if (msg.type === "bye") {
      this.peers.delete(msg.id);
    }
    // Lowest id wins — deterministic, no negotiation round trips.
    const ids = [this.id, ...this.peers.keys()].sort();
    this.isWriter = ids[0] === this.id;
  }
  release() {
    if (this.ch) this.ch.postMessage({ type: "bye", id: this.id });
  }
}

// ── connect (5.2 / 5.3) ─────────────────────────────────────────────────────
// The directory handle is persisted in IndexedDB so the grant survives reloads;
// re-picking is only needed when the browser downgrades the permission.
//
// Every browser dependency is injected, so all three permission states are
// reachable in a test rather than only by clicking through Chrome.

export const PERSIST_KEY = "vault-root";
export const FINGERPRINT_KEY = "vault-fingerprint";

/**
 * Spike S7 found that a stored handle does NOT reliably mean "the same vault":
 * a handle follows a rename, and — worse — a handle whose directory was deleted
 * and replaced by a new one of the same name will happily write into the
 * replacement, with no error and no re-prompt. A user who lost their vault and
 * made a fresh folder would have the app silently adopt it.
 *
 * So identity is checked against the vault's own contents, not the handle.
 */
export async function vaultFingerprint(backend) {
  let files;
  try {
    files = await backend.listAll();
  } catch {
    // Unreadable is not the same as "different" — say nothing rather than
    // raising a false alarm that would block a legitimate reconnect.
    return { marker: null, markdownCount: null, name: null, unknown: true };
  }
  const md = files.filter((f) => f.path.endsWith(".md"));
  let marker = null;
  for (const name of ["CONVENTION.md", "CLAUDE.md"]) {
    try {
      const [fm] = parse(await backend.readText(name));
      if (fm.id) { marker = `${name}:${fm.id}`; break; }
    } catch { /* absent is itself information */ }
  }
  return { marker, markdownCount: md.length, name: backend.root ? backend.root.name : null };
}

/** True when `now` plausibly describes the same vault as `then`. */
export function sameVault(then, now) {
  if (!then || !now || then.unknown || now.unknown) return true;   // no evidence either way
  if (then.marker && now.marker) return then.marker === now.marker;
  // No marker either side: fall back to "did it become unrecognisably different".
  if (then.markdownCount > 0 && now.markdownCount === 0) return false;
  return true;
}

// Crockford base32 — the ULID alphabet. I, L, O and U are excluded so they
// cannot be confused with 1, 1, 0 and V.
const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * A real ULID: 10 chars of millisecond timestamp, 16 of randomness, sortable.
 *
 * The previous generator was `Math.random().toString(36).toUpperCase()`, whose
 * alphabet is 0-9A-Z — so it emitted the four letters ULID forbids. 71% of the
 * ids it produced were rejected by this project's own validator, meaning a few
 * pages created in the app were enough to make the vault fail VERIFY.
 */
export function newUlid(now = Date.now()) {
  let t = "", ms = now;
  for (let i = 0; i < 10; i++) { t = B32[ms % 32] + t; ms = Math.floor(ms / 32); }
  let r = "";
  const bytes = (globalThis.crypto && globalThis.crypto.getRandomValues)
    ? globalThis.crypto.getRandomValues(new Uint8Array(16))
    : Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  for (let i = 0; i < 16; i++) r += B32[bytes[i] % 32];
  return t + r;
}

/**
 * What the user must be told after a vault is stood up, in priority order.
 *
 * SPEC §4 requires duplicates be surfaced "rather than silently choosing".
 * buildIndex already writes a precise message for each — naming both paths and
 * which one wins — but nothing consumed them: `window.SB_WARNINGS` was assigned
 * and read by no one, so one page could shadow another invisibly, showing up
 * only as a page count that did not match the file count.
 *
 * Pure and exported so the wording is testable without a DOM.
 */
export function vaultNotices(isWriter, warnings = []) {
  const out = [];
  if (!isWriter) out.push("Another tab has the vault open for editing. This tab is read-only.");
  if (warnings.length === 1) out.push(warnings[0]);
  else if (warnings.length > 1) out.push(`${warnings.length} vault warnings, including: ${warnings[0]}`);
  return out;
}

/**
 * Classify the outcome of an interactive reconnect, so the UI has one place to
 * branch and the branching is testable without a DOM or a real picker.
 *
 * Two cases were wrong when this lived inline in bridge.js:
 *   - AbortError (the user dismissed the picker) was reported as
 *     "Could not open that folder", blaming the folder for a decision.
 *   - `granted` with no vault — the S7 different-vault refusal — matched no
 *     branch at all and threw nothing, so its explanatory message was computed
 *     and silently discarded.
 */
export function reconnectOutcome(result, error) {
  if (error) {
    if (error.name === "AbortError") return { act: "nothing" };
    return { act: "banner", text: "Could not open that folder." };
  }
  if (result && result.state === "granted" && result.vault) return { act: "connect" };
  return {
    act: "banner",
    text: (result && result.message) || "That folder could not be opened as a vault.",
  };
}

export async function connectVault(deps) {
  const {
    store,                        // {get(key), set(key, value)}
    picker,                       // () => Promise<FileSystemDirectoryHandle>
    queryPermission,              // (handle) => 'granted'|'prompt'|'denied'
    requestPermission,            // (handle) => 'granted'|'prompt'|'denied'
    interactive = false,          // true only inside a user gesture
    cache = null,                 // last-known index, for read-only rendering
  } = deps;

  let handle = await store.get(PERSIST_KEY);

  if (!handle) {
    if (!interactive) {
      return { state: "prompt", vault: null, handle: null, cache,
               reason: "no stored handle; picking needs a user gesture" };
    }
    handle = await picker();
    await store.set(PERSIST_KEY, handle);
  }

  let state = await queryPermission(handle);
  if (state !== "granted" && interactive) state = await requestPermission(handle);

  if (state === "granted") {
    const backend = new FSABackend(handle);
    // S7: the handle alone does not prove this is the same vault.
    const now = await vaultFingerprint(backend);
    const then = await store.get(FINGERPRINT_KEY).catch(() => null);
    if (!sameVault(then, now)) {
      return { state, handle, vault: null, cache, readOnly: true,
               reason: "different-vault",
               message: "This folder is not the vault this app was connected to. "
                      + "Nothing has been written. Reconnect to adopt it deliberately.",
               expected: then, found: now };
    }
    await store.set(FINGERPRINT_KEY, now).catch(() => {});
    return { state, handle, vault: new Vault(backend, deps.vaultOpts || {}) };
  }
  // SPEC §7: a cold open must never show an empty shell. Render the cached
  // index read-only behind a reconnect banner.
  return { state, handle, vault: null, cache, readOnly: true };
}

// ── the vault ───────────────────────────────────────────────────────────────

export class Vault {
  constructor(backend, opts = {}) {
    this.be = backend;
    this.index = new Map();          // id -> entry
    this.byPath = new Map();         // path -> entry
    this.warnings = [];
    this.historyKeep = opts.historyKeep ?? HISTORY_KEEP;
    this.election = opts.election ?? { isWriter: true };
    this.now = opts.now ?? (() => new Date().toISOString().replace(/\.\d+Z$/, "+00:00"));
    this.newId = opts.newId ?? newUlid;
    this._mtimes = new Map();
  }

  // 5.5 / 5.12 / 5.13 / 5.16 / 5.17
  async buildIndex() {
    const files = await this.be.listAll();
    const seenIds = new Map();
    const nextIndex = new Map();
    const nextByPath = new Map();
    this.warnings = [];
    let reread = 0;

    const canvases = new Set(files.filter((f) => f.path.endsWith(".canvas")).map((f) => f.path));
    const mdPaths = new Set(files.filter((f) => f.path.endsWith(".md")).map((f) => f.path));

    for (const f of files) {
      const isMd = f.path.endsWith(".md");
      const isCanvas = f.path.endsWith(".canvas");
      if (!isMd && !isCanvas) continue;

      // 5.15 — a bare .canvas with no .md is a page in its own right; no file
      // is created for it until the user edits it through the app.
      if (isCanvas) {
        const sibling = f.path.replace(/\.canvas$/, ".md");
        if (mdPaths.has(sibling)) continue;
        const entry = {
          id: `canvas:${f.path}`, path: f.path, kind: "canvas",
          title: f.path.split("/").pop().replace(/\.canvas$/, ""),
          tags: [], aliases: [], mentions: [], excerpt: "",
          updated: null, mtime: f.mtime, stamped: false, bare: true,
        };
        try { JSON.parse(await this.be.readText(f.path)); }
        catch (e) { entry.unparseable = `invalid canvas JSON: ${e.message}`; }
        nextIndex.set(entry.id, entry);
        nextByPath.set(entry.path, entry);
        continue;
      }

      // 5.9 — reuse the cached entry when mtime is unchanged.
      const cached = this.byPath.get(f.path);
      if (cached && this._mtimes.get(f.path) === f.mtime) {
        nextIndex.set(cached.id, cached);
        nextByPath.set(f.path, cached);
        continue;
      }
      reread++;

      let text, entry;
      try {
        text = await this.be.readText(f.path);
      } catch (e) {
        // 5.17(b) — non-UTF-8. The walk must complete.
        entry = this.#stub(f, `unreadable: ${e.message}`);
        nextIndex.set(entry.id, entry); nextByPath.set(f.path, entry);
        this._mtimes.set(f.path, f.mtime);
        continue;
      }

      let fm = {}, body = text;
      let unparseable = null;
      try {
        [fm, body] = parse(text);
        // 5.17(c) — an unterminated `---` yields no frontmatter but must not throw.
        if (text.startsWith("---\n") && !Object.keys(fm).length) {
          unparseable = "unterminated frontmatter block";
        }
      } catch (e) {
        unparseable = `frontmatter: ${e.message}`;
        fm = {}; body = text;
      }

      const stamped = REQUIRED.every((k) => fm[k]);
      const id = fm.id || `path:${f.path}`;
      const fmTags = Array.isArray(fm.tags) ? fm.tags : fm.tags ? [fm.tags] : [];
      const isExcalidraw = isExcalidrawPath(f.path);
      entry = {
        id,
        // For a drawing the extension is authoritative: a stray `kind:` in the
        // frontmatter must not turn one into a note we would then render as
        // 300 characters of base64.
        kind: isExcalidraw ? "excalidraw" : (fm.kind || inferKind(f.path)),
        path: f.path,
        title: fm.title || titleFromPath(f.path),
        tags: [...new Set([...fmTags, ...extractInlineTags(body)])],
        aliases: Array.isArray(fm.aliases) ? fm.aliases : fm.aliases ? [fm.aliases] : [],
        mentions: [...new Set([...String(body).matchAll(/!?\[\[([^\]|#]+)/g)].map((m) => m[1].trim()))],
        excerpt: excerptOf(unescapeUser(isExcalidraw ? stripExcalidrawData(body) : body)),
        updated: fm.updated || null,
        mtime: f.mtime,
        stamped,
        unparseable,
      };

      if (seenIds.has(id)) {
        // 5.12 — duplicate id. Warn naming both paths; get() resolves to the
        // lexicographically first path, deterministically.
        const other = seenIds.get(id);
        this.warnings.push(
          `duplicate id ${id}: ${other} and ${f.path} — get() resolves ${[other, f.path].sort()[0]}`);
        if ([other, f.path].sort()[0] === other) {
          this._mtimes.set(f.path, f.mtime);
          nextByPath.set(f.path, entry);
          continue;
        }
      }
      seenIds.set(id, f.path);
      nextIndex.set(id, entry);
      nextByPath.set(f.path, entry);
      this._mtimes.set(f.path, f.mtime);
    }

    // duplicate titles (SPEC §7)
    const byTitle = new Map();
    for (const e of nextIndex.values()) {
      const k = (e.title || "").toLowerCase();
      if (byTitle.has(k)) this.warnings.push(`duplicate title "${e.title}": ${byTitle.get(k)} and ${e.path}`);
      else byTitle.set(k, e.path);
    }

    for (const p of this.byPath.keys()) if (!nextByPath.has(p)) this._mtimes.delete(p);
    this.index = nextIndex;
    this.byPath = nextByPath;
    this.lastReread = reread;
    return { entries: nextIndex.size, reread, warnings: this.warnings };
  }

  #stub(f, why) {
    return {
      id: `path:${f.path}`, path: f.path, kind: inferKind(f.path),
      title: f.path.split("/").pop().replace(/\.md$/, ""),
      tags: [], aliases: [], mentions: [], excerpt: "",
      updated: null, mtime: f.mtime, stamped: false, unparseable: why,
    };
  }

  list() { return [...this.index.values()]; }

  async get(id) {
    const e = this.index.get(id);
    if (!e) return null;
    if (e.bare) return { ...e, body: "", canvas: await this.be.readText(e.path) };
    const text = await this.be.readText(e.path);
    const [fm, body] = parse(text);
    // A canvas or inspo page keeps its geometry in a `.canvas` sibling, and only
    // the *bare* case attached it. So an ordinary board — the common one, two
    // files — reached the view with nothing to draw and rendered empty. SPEC §10
    // requires the app to render boards read-only, which is not the same as not
    // rendering them.
    const sibling = e.path.endsWith(".md") ? e.path.replace(/\.md$/, ".canvas") : null;
    const canvas = sibling && await this.be.exists(sibling)
      ? await this.be.readText(sibling) : null;
    return { ...e, frontmatter: fm, body: unescapeUser(body), raw: text,
             ...(canvas !== null && { canvas }) };
  }

  // 5.6 / 5.14 / 5.17 / 5.19 / 5.20 / 5.23
  async put(page) {
    if (!this.election.isWriter) {
      return { ok: false, reason: "not-writer", message: "another tab holds the write lock" };
    }
    // Resolve by PATH first when one is given. Resolving by id is wrong here: a
    // conflict copy keeps the original's id and sorts before it, so an id lookup
    // can hand back a different file than the one being written — and then the
    // conflict check compares against the wrong `updated` and silently passes.
    const entry = (page.path && this.byPath.get(page.path)) || this.index.get(page.id);
    const path = page.path || entry?.path;
    if (!path) return { ok: false, reason: "no-path" };

    if (entry?.unparseable) {
      return { ok: false, reason: "unparseable",
               message: `refusing to write over a file we could not parse: ${entry.unparseable}` };
    }

    // 5.19 — conflict check FIRST, so a refused write leaves no history.
    const onDisk = await this.be.stat(path);
    if (onDisk && entry) {
      // Obsidian is a text editor: it rewrites the body and leaves `updated`
      // exactly as it found it. Comparing only that field made every edit made
      // in Obsidian invisible here, so the next save from the app destroyed it
      // without a word — the one thing CONVENTION promises never happens.
      //
      // mtime moves on any write, whoever made it, so it is the check that
      // actually holds. `updated` stays as a second signal, for a backend whose
      // mtime is coarse or for a file re-saved within the same clock tick.
      let changed = entry.mtime != null && onDisk.mtime !== entry.mtime;
      if (!changed && entry.updated) {
        const [curFm] = parse(await this.be.readText(path));
        changed = !!(curFm.updated && curFm.updated !== entry.updated);
      }
      if (changed && !page.force) {
        return { ok: false, reason: "conflict", path,
                 message: "changed on disk — reload or overwrite" };
      }
      if (changed && page.force) {
        const day = this.now().slice(0, 10);
        let dest = path.replace(/\.md$/, ` (conflict ${day}).md`);
        let n = 2;
        while (await this.be.exists(dest)) {           // 5.18
          dest = path.replace(/\.md$/, ` (conflict ${day} ${n++}).md`);
        }
        await this.be.writeBytes(dest, await this.be.readBytes(path));
      }
    }

    // history AFTER the conflict gate (5.19), keyed by id so renames keep it
    if (onDisk) {
      const key = (page.id || entry?.id || path).replace(/[/:]/g, "_");
      const dir = `.history/${key}`;
      await this.be.writeBytes(`${dir}/${stamp(this.now())}.md`, await this.be.readBytes(path));
      const kept = (await this.be.listDir(dir)).sort();
      for (const old of kept.slice(0, Math.max(0, kept.length - this.historyKeep))) {
        await this.be.remove(old);
      }
    }

    // 5.14 — lazy stamping: exactly id, kind, created on first write, nothing else.
    const fm = { ...(page.frontmatter || {}) };
    if (!fm.id) fm.id = page.id && !String(page.id).startsWith("path:") ? page.id : this.newId();
    if (!fm.kind) fm.kind = page.kind || inferKind(path);
    if (!fm.created) fm.created = this.now();
    if (!fm.title) fm.title = page.title || path.split("/").pop().replace(/\.md$/, "");
    fm.updated = this.now();

    const text = serialize(fm, escapeUser(page.body ?? ""));
    try {
      await this.be.writeText(path, text);
    } catch (e) {
      // Spike S6: a full volume throws QuotaExceededError from createWritable.
      // Surface it as a refusal — the history snapshot and the original file are
      // both already safe, so this is recoverable, not corruption.
      if (e && (e.name === "QuotaExceededError" || /quota/i.test(e.message || ""))) {
        return { ok: false, reason: "quota", path,
                 message: "no space left — the file on disk is unchanged" };
      }
      throw e;
    }

    // Keep the index honest about what is now on disk, so the next write from
    // this same session does not read its own change as somebody else's and
    // refuse. Deliberately NOT `_mtimes`: that map is what buildIndex uses to
    // decide an entry can be reused unparsed, so seeding it here would make the
    // rebuild skip the file and serve back the values we just replaced.
    const after = await this.be.stat(path);
    if (after && entry) {
      entry.mtime = after.mtime;
      entry.updated = fm.updated;
    }
    return { ok: true, path, id: fm.id, bytes: text.length };
  }

  // 5.7 / 5.18
  async del(id) {
    const e = this.index.get(id);
    if (!e) return { ok: false, reason: "unknown-id" };

    // A canvas or inspo page is *two* files on disk: `<name>.md` and
    // `<name>.canvas`. Trashing only the markdown orphaned the canvas — it
    // stayed visible in Obsidian, and the next page created under that name
    // silently inherited someone else's board. Move the pair together, and
    // give both the same collision suffix so they stay paired in `.trash/`.
    const sib = e.path.endsWith(".md") ? e.path.replace(/\.md$/, ".canvas") : null;
    const hasSib = sib ? await this.be.exists(sib) : false;

    const suffixed = (p, s) => p.replace(/(\.[^./]+)$/, `${s}$1`);
    const at = (s) => ({
      md: `.trash/${suffixed(e.path, s)}`,
      canvas: hasSib ? `.trash/${suffixed(sib, s)}` : null,
    });

    let n = 2, dest = at("");
    while (await this.be.exists(dest.md)
        || (dest.canvas && await this.be.exists(dest.canvas))) {
      dest = at(` ${n++}`);
    }

    await this.be.move(e.path, dest.md);
    if (hasSib) await this.be.move(sib, dest.canvas);
    this.index.delete(id);
    this.byPath.delete(e.path);
    return { ok: true, trashed: dest.md, ...(hasSib && { trashedCanvas: dest.canvas }) };
  }

  async readBlob(path) { return this.be.readBytes(path); }
  async writeBlob(path, bytes) {
    if (!this.election.isWriter) return { ok: false, reason: "not-writer" };
    try {
      await this.be.writeBytes(path, bytes);
    } catch (e) {
      if (e && (e.name === "QuotaExceededError" || /quota/i.test(e.message || ""))) {
        return { ok: false, reason: "quota", path, message: "no space left" };
      }
      throw e;
    }
    return { ok: true, path };
  }

  // 5.9 / 5.21
  async watchExternal() {
    const before = new Map([...this.byPath].map(([p, e]) => [p, e.mtime]));
    const r = await this.buildIndex();
    const after = new Map([...this.byPath].map(([p, e]) => [p, e.mtime]));
    const created = [...after.keys()].filter((p) => !before.has(p));
    const removed = [...before.keys()].filter((p) => !after.has(p));
    return { ...r, created, removed,
             changed: [...after].filter(([p, m]) => before.has(p) && before.get(p) !== m).map(([p]) => p) };
  }
}
