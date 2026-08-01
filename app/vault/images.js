// Tasks 9.2 / 9.3 / 9.9: the inspo grid's data layer.
//
// The grid is **every image in the vault**, not just the ones on boards and not
// just `attachments/`. That is the whole point — a designer's reference pile is
// wherever they dropped it, and Obsidian has no equivalent view.
//
// Thumbnails are cached in IndexedDB, never written back into the vault. The
// vault belongs equally to Obsidian and to the agent; neither should have to
// step over a `.thumbnails/` directory this app invented.

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg)$/i;
const IGNORED = new Set([".git", ".obsidian", ".trash", ".history"]);

export const THUMB_DB = "sb-thumbs";
export const THUMB_STORE = "thumbs";
export const DEFAULT_CAP_BYTES = 40 * 1024 * 1024;   // declared cap, task 9.9

export function isImagePath(path) {
  return IMAGE_EXT.test(String(path));
}

const ignored = (path) =>
  String(path).split("/").some((p) => IGNORED.has(p) || (p.startsWith(".") && p !== "."));

/**
 * Task 9.2: every image anywhere in the vault, each resolved to the page that
 * embeds it (if any). `files` is the backend's listAll() output; `entries` is
 * the index, whose `mentions` already hold every `![[target]]`.
 */
export function listImages(files, entries = []) {
  const embeddedBy = new Map();          // basename -> [page entry]
  for (const e of entries) {
    for (const m of e.mentions || []) {
      if (!isImagePath(m)) continue;
      const key = String(m).split("/").pop().toLowerCase();
      if (!embeddedBy.has(key)) embeddedBy.set(key, []);
      embeddedBy.get(key).push(e);
    }
  }
  return files
    .filter((f) => isImagePath(f.path) && !ignored(f.path))
    .map((f) => {
      const name = f.path.split("/").pop();
      const pages = embeddedBy.get(name.toLowerCase()) || [];
      return {
        path: f.path,
        name,
        folder: f.path.split("/").slice(0, -1).join("/") || ".",
        mtime: f.mtime,
        size: f.size,
        // "containing page" — the page that embeds it, when one does. Images
        // dropped straight into attachments/ legitimately have none.
        pages: pages.map((p) => ({ id: p.id, title: p.title, path: p.path })),
        tags: [...new Set(pages.flatMap((p) => p.tags || []))],
        kinds: [...new Set(pages.map((p) => p.kind))],
      };
    })
    .sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
}

/** Filter the grid by tag, kind, or containing page. */
export function filterImages(images, { tag = "", kind = "", pageId = "" } = {}) {
  return images.filter((im) =>
    (!tag || im.tags.includes(tag)) &&
    (!kind || im.kinds.includes(kind)) &&
    (!pageId || im.pages.some((p) => p.id === pageId)));
}

/**
 * An LRU thumbnail cache with a declared byte cap (9.9).
 *
 * `store` is injected so the whole thing is testable without a browser:
 * {get(key), set(key, value), delete(key), entries()}.
 */
export class ThumbCache {
  constructor(store, opts = {}) {
    this.store = store;
    this.capBytes = opts.capBytes ?? DEFAULT_CAP_BYTES;
    this.bytes = 0;
    this.clock = 0;
    this.degraded = false;         // set when the browser refuses to store more
    this.hits = 0;
    this.misses = 0;
  }

  async init() {
    this.bytes = 0;
    for (const [, v] of await this.store.entries()) this.bytes += v.bytes || 0;
    return this;
  }

  async get(key, mtime) {
    const hit = await this.store.get(key);
    if (hit && hit.mtime === mtime) {
      this.hits++;
      hit.used = ++this.clock;
      await this.store.set(key, hit).catch(() => {});
      return hit.blob;
    }
    this.misses++;
    return null;
  }

  async put(key, mtime, blob, bytes) {
    if (this.degraded) return false;
    const rec = { blob, bytes, mtime, used: ++this.clock };
    try {
      await this.store.set(key, rec);
    } catch (e) {
      // 9.9: a full disk must not break the grid — it just stops caching.
      if (e && /quota/i.test(e.name + " " + e.message)) {
        this.degraded = true;
        return false;
      }
      throw e;
    }
    this.bytes += bytes;
    await this.evictToCap();
    return true;
  }

  /** Evict least-recently-used entries until the store is under its cap. */
  async evictToCap() {
    if (this.bytes <= this.capBytes) return 0;
    const all = [...(await this.store.entries())]
      .sort((a, b) => (a[1].used || 0) - (b[1].used || 0));
    let evicted = 0;
    for (const [k, v] of all) {
      if (this.bytes <= this.capBytes) break;
      await this.store.delete(k);
      this.bytes -= v.bytes || 0;
      evicted++;
    }
    return evicted;
  }
}

/** A ThumbCache backed by real IndexedDB. Browser only. */
export function idbThumbStore() {
  const open = () => new Promise((res, rej) => {
    const r = indexedDB.open(THUMB_DB, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(THUMB_STORE)) db.createObjectStore(THUMB_STORE);
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(THUMB_STORE, mode);
      const s = t.objectStore(THUMB_STORE);
      let out;
      try { out = fn(s); } catch (e) { rej(e); return; }
      t.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  };
  return {
    get: (k) => tx("readonly", (s) => s.get(k)),
    set: (k, v) => tx("readwrite", (s) => s.put(v, k)),
    delete: (k) => tx("readwrite", (s) => s.delete(k)),
    entries: async () => {
      const keys = await tx("readonly", (s) => s.getAllKeys());
      const vals = await tx("readonly", (s) => s.getAll());
      return keys.map((k, i) => [k, vals[i]]);
    },
    clear: () => tx("readwrite", (s) => s.clear()),
  };
}

/** In-memory store with the same shape — used by the tests. */
export function memoryThumbStore(opts = {}) {
  const m = new Map();
  const failAfter = opts.failAfterBytes ?? Infinity;
  let bytes = 0;
  return {
    async get(k) { return m.get(k) || null; },
    async set(k, v) {
      const prev = m.get(k);
      const delta = (v.bytes || 0) - (prev ? prev.bytes || 0 : 0);
      if (bytes + delta > failAfter) {
        const e = new Error("The quota has been exceeded.");
        e.name = "QuotaExceededError";
        throw e;
      }
      bytes += delta;
      m.set(k, v);
    },
    async delete(k) {
      const prev = m.get(k);
      if (prev) bytes -= prev.bytes || 0;
      m.delete(k);
    },
    async entries() { return [...m.entries()]; },
    async clear() { m.clear(); bytes = 0; },
    get _bytes() { return bytes; },
    get _size() { return m.size; },
  };
}
