// The clipper's own storage: a capture queue, the vault handle, and settings.
//
// Everything here is local to the extension. Settings deliberately use
// `chrome.storage.local` rather than `.sync` — `.sync` uploads to a Google
// account, and an app whose whole argument is "your notes stay on your disk"
// does not get to make an exception for the folder name they live in.
//
// Captures queue in IndexedDB because some of them are image blobs, which
// `chrome.storage` cannot hold. A capture is queued FIRST and written second,
// so a clip survives a closed laptop, a locked vault folder, or a service
// worker Chrome decided to shut down mid-write.

const DB = "canon-clip";
const CAPTURES = "captures";
const META = "meta";

function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(CAPTURES)) {
        db.createObjectStore(CAPTURES, { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function tx(store, mode, fn) {
  return open().then((db) => new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => res(req && "result" in req ? req.result : undefined);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  }));
}

// ── the queue ───────────────────────────────────────────────────────────────

/** Queue a capture. Returns the record, id included. */
export async function enqueue(capture) {
  const rec = { ...capture, queuedAt: new Date().toISOString(), error: null };
  const id = await tx(CAPTURES, "readwrite", (s) => s.add(rec));
  return { ...rec, id };
}

/** Oldest first — a queue that reorders itself is a queue nobody can predict. */
export async function pending() {
  const all = await tx(CAPTURES, "readonly", (s) => s.getAll());
  return (all || []).sort((a, b) => a.id - b.id);
}

export async function count() {
  return (await tx(CAPTURES, "readonly", (s) => s.count())) || 0;
}

export async function patch(id, fields) {
  const rec = await tx(CAPTURES, "readonly", (s) => s.get(id));
  if (!rec) return null;
  const next = { ...rec, ...fields };
  await tx(CAPTURES, "readwrite", (s) => s.put(next));
  return next;
}

export async function drop(id) {
  await tx(CAPTURES, "readwrite", (s) => s.delete(id));
}

export async function clear() {
  await tx(CAPTURES, "readwrite", (s) => s.clear());
}

// ── meta: the vault handle, and the log of what was written ─────────────────

export const HANDLE_KEY = "vault-handle";
export const LOG_KEY = "recent";
const LOG_KEEP = 20;

export async function getMeta(key) {
  return (await tx(META, "readonly", (s) => s.get(key))) ?? null;
}

export async function setMeta(key, value) {
  await tx(META, "readwrite", (s) => s.put(value, key));
  return value;
}

/** A short "what landed where" list, so the popup can prove a clip arrived. */
export async function logWrite(entry) {
  const cur = (await getMeta(LOG_KEY)) || [];
  const next = [{ ...entry, at: new Date().toISOString() }, ...cur].slice(0, LOG_KEEP);
  await setMeta(LOG_KEY, next);
  return next;
}

export async function recent() {
  return (await getMeta(LOG_KEY)) || [];
}

// ── settings ────────────────────────────────────────────────────────────────

// One setting, because one is all a clipper needs an opinion about: the wall
// clipped pictures land on. An ordinary inspo page — created on the first clip,
// and editable in the app or Obsidian like any other.
//
// Everything that used to be here (which wall group, whether a page became a
// bookmark or a card, whether to write immediately, whether to skip duplicates)
// is now a rule rather than a question: pictures go to the wall, everything else
// becomes a note, clips are written at once, and the same link is never saved
// twice. A preference nobody can answer better than the default is not a
// preference, it is a decision left lying on the floor.
export const DEFAULTS = {
  wall: "Interface Inspiration",
};

export async function settings() {
  const got = await chrome.storage.local.get("settings");
  // Only the keys DEFAULTS knows about. An install from an older version has
  // `autoSave: false` or `linkTarget: "wall"` sitting in storage, and a setting
  // with no control left to change it would be a mode nobody could get out of.
  const kept = {};
  for (const k of Object.keys(DEFAULTS)) {
    const v = (got.settings || {})[k];
    if (v !== undefined && v !== null && v !== "") kept[k] = v;
  }
  return { ...DEFAULTS, ...kept };
}

export async function saveSettings(patchObj) {
  const next = { ...(await settings()), ...patchObj };
  await chrome.storage.local.set({ settings: next });
  return next;
}
