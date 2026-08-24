// The popup: one property list, aimed by the destination at the top of it.
//
// The order is the design, and it is the same order every time:
//
//   1. where it goes        Note · Bookmark · Inspo
//   2. what it is           title, source, author, description, site, note,
//                           tags, mentions — one continuous list, one row shape
//   3. the picture          the only thing here that is not typed
//   4. which file it joins  a new page, or the bottom of one you already have
//   5. save                 anchored to the bottom, never scrolled away
//
// Destinations differ only in which rows they use. Inspo has no title and no
// byline because a wall item has neither — it is a picture with a caption — but
// the rows it does have look exactly like everyone else's.
//
// Every value on screen was written by the page, which is why every one is
// editable: a title is a filename here, and `(6) Home` is a filename nobody
// wants. The line under it shows the name the file will get, and says when that
// name is taken — the alternative is owning three pages called `Canon Vault 2`.
//
// No writing happens here. The popup asks the service worker, because the queue
// has to be written by whoever is still alive when the popup closes, and a
// popup closes the moment you look away from it.

const $ = (id) => document.getElementById(id);

/** Talk to the worker; a dead worker becomes an answer, never a silent button. */
async function send(type, extra = {}) {
  try {
    const r = await chrome.runtime.sendMessage({ type, ...extra });
    return r ?? { ok: false, reason: "the background worker did not answer" };
  } catch (e) {
    return { ok: false, reason: "worker",
             message: "The clipper's background worker is not responding — "
                    + "reload it at chrome://extensions." };
  }
}

const DEST_KEY = "lastDest";

const wallName = (s) => ($("wall") && $("wall").value.trim())
  || (s && s.settings && s.settings.wall) || "Interface Inspiration";

/**
 * What each destination is: the rows it shows, the picture it can carry, and
 * which pages it will let you add to.
 *
 * `accepts` is the answer to "add to a page — which pages?". A note joins a
 * note, a bookmark joins a bookmark, a picture joins a wall. Offering all of
 * them everywhere was offering to append a wall item to a bookmark, which
 * parses as nothing on either side.
 */
const DEST = {
  note: {
    verb: "Save note", folder: "notes/",
    where: () => "→ notes/ — a page you can write on",
    rows: ["title", "source", "author", "description", "site", "note", "tags", "mentions"],
    picture: "optional", highlight: true, noteLabel: "note",
    accepts: (p) => p.kind === "note" && !p.url, acceptsWhat: "notes",
  },
  bookmark: {
    verb: "Save bookmark", folder: "notes/",
    where: () => "→ notes/ — the site kept as a card",
    rows: ["title", "source", "author", "description", "site", "note", "tags", "mentions"],
    picture: "none", highlight: false, noteLabel: "note",
    accepts: (p) => p.kind === "note" && Boolean(p.url), acceptsWhat: "bookmarks",
  },
  inspo: {
    verb: "Save to wall", folder: "inspo/",
    where: (s) => `→ inspo/${wallName(s)}`,
    rows: ["note", "tags", "mentions", "source"],
    picture: "required", highlight: false, noteLabel: "caption",
    accepts: (p) => p.kind === "inspo", acceptsWhat: "walls",
  },
};

const ROW_IDS = {
  title: "row-title", source: "row-source", author: "row-author",
  description: "row-description", site: "row-site", note: "row-note",
  tags: "row-tags", mentions: "row-mentions",
};

let tab = null;
let meta = null;
let state = null;
let pending = null;
let dest = "bookmark";
let picture = "none";
let mode = "new";          // "new" | "append"
let chosen = null;         // the page an append is aimed at
let pickedImage = null;    // the src of an image a right-click pointed at
let mentions = [];         // page titles this capture links to

function status(text, tone = "") {
  const el = $("status");
  el.textContent = text;
  el.className = `status ${tone}`;
}

function host(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url || ""; }
}

function openSetup(hash = "") {
  if (hash) chrome.tabs.create({ url: chrome.runtime.getURL(`vault.html${hash}`) });
  else chrome.runtime.openOptionsPage();
  window.close();
}

/** The vault chip is the honest one-glance answer to "will this be saved?" —
 *  and when the answer is no, the banner below says why and fixes it. */
function paintVault() {
  const chip = $("vault-chip");
  const banner = $("vault-banner");
  const v = state.vault || {};

  if (!v.name) {
    chip.textContent = "Connect vault";
    chip.className = "chip warn";
    banner.classList.remove("hidden");
    $("banner-title").textContent = "No vault connected";
    $("banner-why").textContent = "Clips are kept safely here until you pick a folder.";
    $("banner-do").textContent = "Connect";
    banner.dataset.hash = "";
    return;
  }
  if (v.permission !== "granted") {
    chip.textContent = `${v.name} — locked`;
    chip.className = "chip warn";
    banner.classList.remove("hidden");
    $("banner-title").textContent = `${v.name} is locked`;
    $("banner-why").textContent = "Chrome drops folder access between sessions. One click restores it.";
    $("banner-do").textContent = "Unlock";
    banner.dataset.hash = "#unlock";
    return;
  }
  chip.textContent = v.name;
  chip.className = "chip";
  banner.classList.add("hidden");
}

/** Saves that have not landed. The count, the first reason, and the retry. */
function paintWaiting() {
  const items = state.pending || [];
  $("waiting").classList.toggle("hidden", !items.length);
  if (!items.length) return;
  $("waiting-what").textContent = items.length === 1
    ? "1 unfinished save" : `${items.length} unfinished saves`;
  const failed = items.find((r) => r.error);
  $("waiting-why").textContent = failed ? failed.error
    : "Kept here until the vault can be written.";
}

/** Saves that did land. Three of them: enough to answer "did that work?", not
 *  so many that the form is pushed off the screen by its own history. */
function paintRecent() {
  const items = (state.recent || []).slice(0, 3);
  $("recent-box").classList.toggle("hidden", !items.length);
  const box = $("recent");
  box.textContent = "";
  for (const r of items) {
    const row = document.createElement("div");
    row.className = "item";
    const what = document.createElement("div");
    what.className = "grow truncate";
    what.textContent = r.title || r.path || "";
    const where = document.createElement("div");
    where.className = "tiny muted truncate mono";
    where.style.maxWidth = "150px";
    where.textContent = r.skipped ? `already in ${r.path}` : r.path || "";
    row.append(what, where);
    box.appendChild(row);
  }
}

function seg(box, key, value) {
  for (const b of box.querySelectorAll("button")) {
    b.classList.toggle("on", b.dataset[key] === value);
  }
}

/**
 * The filename this title will get, and whether something already owns it.
 *
 * The vault's own rule, applied early: strip what a filesystem refuses, and if
 * the name is taken anywhere in the vault — not just in this folder, because
 * that is how `[[Wikilinks]]` resolve — a number is appended. Saying so here
 * turns a surprise into a decision.
 */
function paintName() {
  const d = DEST[dest];
  const hint = $("name-hint");
  const relevant = d.rows.includes("title") && mode === "new";
  hint.classList.toggle("hidden", !relevant);
  if (!relevant) return;
  const raw = $("title").value.trim();
  const stem = raw.replace(/[/\\:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
  if (!stem) {
    hint.textContent = `${d.folder}Note ${new Date().toISOString().slice(0, 10)}.md`;
    hint.className = "prop-hint";
    return;
  }
  const taken = (state.pages || []).some(
    (p) => String(p.title || "").toLowerCase() === stem.toLowerCase());
  hint.textContent = taken
    ? `${d.folder}${stem} 2.md — “${stem}” is taken`
    : `${d.folder}${stem}.md`;
  hint.className = taken ? "prop-hint is-taken" : "prop-hint";
}

/** A page list, filtered and drawn. Shared by the two searches. */
function drawHits(box, hits, onPick, empty) {
  box.textContent = "";
  if (!hits.length) {
    box.appendChild(Object.assign(document.createElement("div"),
      { className: "item muted tiny", textContent: empty }));
    return;
  }
  for (const p of hits) {
    const row = document.createElement("button");
    row.className = "item pick";
    row.type = "button";
    const t = document.createElement("span");
    t.className = "grow truncate";
    t.textContent = p.title;
    const k = document.createElement("span");
    k.className = "tiny muted";
    k.textContent = p.url ? "bookmark" : p.kind;
    row.append(t, k);
    row.addEventListener("click", () => onPick(p));
    box.appendChild(row);
  }
}

function paintPicks() {
  const d = DEST[dest];
  const q = $("pick").value.trim().toLowerCase();
  if (!q) { $("pick-results").textContent = ""; return; }
  const hits = (state.pages || [])
    .filter(d.accepts)
    .filter((p) => String(p.title || "").toLowerCase().includes(q))
    .slice(0, 6);
  drawHits($("pick-results"), hits, (p) => {
    chosen = p;
    $("pick").value = "";
    paintForm();
  }, `No ${d.acceptsWhat} by that name.`);
}

/** Mentions may point anywhere — a link is not an append, and the graph is not
 *  filtered by kind. */
function paintMentionSearch() {
  const q = $("mention").value.trim().toLowerCase();
  if (!q) { $("mention-results").textContent = ""; return; }
  const hits = (state.pages || [])
    .filter((p) => String(p.title || "").toLowerCase().includes(q))
    .filter((p) => !mentions.includes(p.title))
    .slice(0, 5);
  drawHits($("mention-results"), hits, (p) => {
    mentions = [...mentions, p.title];
    $("mention").value = "";
    paintForm();
  }, "No page by that name.");
}

function paintChips() {
  const box = $("mention-chips");
  box.textContent = "";
  box.classList.toggle("hidden", !mentions.length);
  for (const name of mentions) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip mention-chip";
    chip.title = "Remove";
    chip.textContent = `[[${name}]] ✕`;
    chip.addEventListener("click", () => {
      mentions = mentions.filter((m) => m !== name);
      paintForm();
    });
    box.appendChild(chip);
  }
}

/** Repaint everything that follows from the destination and the mode. */
function paintForm() {
  const d = DEST[dest];
  seg($("dest"), "dest", dest);
  seg($("mode"), "mode", mode);
  $("dest-where").textContent = d.where(state);
  $("save").textContent = d.verb;
  $("note-label").textContent = d.noteLabel;
  $("mode-new").textContent = dest === "inspo" ? "A wall" : "New page";

  $("props").classList.toggle("is-inspo", dest === "inspo");
  // One list, one rule: a row is on screen when this destination has that row,
  // and a title is not a thing you give to a page that already exists.
  for (const [row, id] of Object.entries(ROW_IDS)) {
    const on = d.rows.includes(row) && !(row === "title" && mode === "append");
    $(id).classList.toggle("hidden", !on);
  }

  const has = Boolean(meta && meta.selection);
  $("highlight-row").classList.toggle("hidden", !d.highlight);
  $("highlight").disabled = !has;
  $("highlight-label").textContent = has
    ? `Include “${meta.selection.slice(0, 34)}${meta.selection.length > 34 ? "…" : ""}”`
    : "Include the highlighted text — nothing is selected";

  // The picture.
  $("picture-row").classList.toggle("hidden", d.picture === "none");
  $("picture").querySelector('[data-pic="none"]').classList
    .toggle("hidden", d.picture === "required");
  $("picture").querySelector('[data-pic="picked"]').classList
    .toggle("hidden", !pickedImage);
  const noPreview = !(meta && meta.og && meta.og.image);
  const prev = $("picture").querySelector('[data-pic="page"]');
  prev.disabled = noPreview;
  prev.title = noPreview ? "This page declares no preview image" : "";

  if (d.picture === "none") picture = "none";
  if (d.picture === "required" && picture === "none") {
    picture = pickedImage ? "picked" : noPreview ? "screen" : "page";
  }
  if (picture === "page" && noPreview) picture = pickedImage ? "picked" : "screen";
  if (picture === "picked" && !pickedImage) picture = "screen";
  seg($("picture"), "pic", picture);

  const src = picture === "picked" ? pickedImage
    : picture === "page" ? (meta && meta.og && meta.og.image) : null;
  $("pic-preview").hidden = !src;
  if (src) $("pic-preview").src = src;
  $("picture-hint").textContent =
    picture === "region" ? "the popup closes so you can drag"
    : picture === "screen" ? "the visible window — scroll first"
    : picture === "page" ? "the image the site advertises"
    : picture === "picked" ? "the image you right-clicked"
    : "";

  // Where it lands.
  $("wall-row").classList.toggle("hidden", dest !== "inspo" || mode === "append");
  $("pick-row").classList.toggle("hidden", mode !== "append");
  $("pick").placeholder = `Search your ${d.acceptsWhat}…`;
  if (chosen && !d.accepts(chosen)) chosen = null;   // the destination moved
  $("pick-chosen").textContent = chosen ? `→ ${chosen.path}`
    : (mode === "append" ? `Pick one of your ${d.acceptsWhat} above.` : "");
  $("pick-chosen").className = chosen ? "tiny ok" : "tiny warn";

  paintPicks();
  paintMentionSearch();
  paintChips();
  paintName();
}

function paint() {
  paintVault();
  paintWaiting();
  paintRecent();
  paintForm();
}

async function refresh() {
  state = await send("state");
  paint();
}

/** Everything on screen, as the worker's `saveCapture` wants it. */
function form() {
  const d = DEST[dest];
  const has = (row) => d.rows.includes(row);
  return {
    title: has("title") ? $("title").value.trim() : "",
    note: $("note").value.trim(),
    tags: $("tags").value.trim(),
    mentions,
    picture: d.picture === "none" ? "none" : picture,
    imageSrc: pickedImage,
    highlight: d.highlight && $("highlight").checked && !$("highlight").disabled,
    selection: (meta && meta.selection) || (pending && pending.selection) || "",
    ...(has("source") && { url: $("source").value.trim() }),
    ...(has("author") && { author: $("author").value.trim() }),
    ...(has("description") && { description: $("description").value.trim() }),
    ...(has("site") && { siteName: $("siteName").value.trim() }),
    ...(mode === "append" && chosen && { appendTo: chosen.id }),
    ...(mode === "new" && dest === "inspo" && { wall: $("wall").value.trim() }),
  };
}

function report(r) {
  if (!r || r.ok === false) {
    if (r && r.reason === "cancelled") { status("Cancelled."); return; }
    if (r && r.reason === "no-vault") {
      status("Kept — connect a vault above and it is written.", "warn"); return;
    }
    if (r && (r.reason === "permission" || r.reason === "different-vault")) {
      status("Kept — unlock the vault above and it is written.", "warn"); return;
    }
    status(`Not saved: ${(r && (r.message || r.reason)) || "unknown"}`, "bad");
    return;
  }
  if (r.wrote) {
    const last = (state.recent || [])[0];
    status(last && last.path
      ? `${last.skipped ? "Already in" : "Saved to"} ${last.path}` : "Saved to the vault.", "ok");
  } else if (r.failed) status("Saved here, but the write failed — see below.", "bad");
  else status("Saved here — waiting for the vault.", "warn");
}

async function act(fn) {
  status("Working…");
  $("save").disabled = true;
  let r;
  try {
    r = await fn();
  } catch (e) {
    status(String((e && e.message) || e), "bad");
    $("save").disabled = false;
    await refresh();
    return;
  }
  await refresh();
  $("save").disabled = false;
  report(r);
}

async function save() {
  if (mode === "append" && !chosen) {
    status(`Pick the ${DEST[dest].acceptsWhat.replace(/s$/, "")} it should be added to.`, "warn");
    $("pick").focus();
    return;
  }
  const f = form();
  if (f.picture === "region") {        // the drag needs the popup gone
    send("saveCapture", { tab, dest, form: f });
    window.close();
    return;
  }
  await act(() => send("saveCapture", { tab, dest, form: f }));
}

// ── wiring ──────────────────────────────────────────────────────────────────

$("vault-chip").addEventListener("click", () => openSetup());
$("banner-do").addEventListener("click", () => openSetup($("vault-banner").dataset.hash || ""));
$("open-history").addEventListener("click", () => openSetup());

$("dest").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-dest]");
  if (!b) return;
  dest = b.dataset.dest;
  chrome.storage.local.set({ [DEST_KEY]: dest });
  paintForm();
});

$("mode").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-mode]");
  if (!b) return;
  mode = b.dataset.mode;
  paintForm();
  if (mode === "append") $("pick").focus();
});

$("picture").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-pic]");
  if (!b || b.disabled) return;
  picture = b.dataset.pic;
  paintForm();
});

$("title").addEventListener("input", paintName);
$("pick").addEventListener("input", paintPicks);
$("mention").addEventListener("input", paintMentionSearch);
$("wall").addEventListener("input", () => { $("dest-where").textContent = DEST[dest].where(state); });
$("save").addEventListener("click", save);
$("flush").addEventListener("click", () => act(() => send("flush")));

// Enter saves from any single-line field. The two searches keep it for their
// own first result, because that is what Enter means in a search box.
for (const id of ["title", "source", "author", "description", "siteName", "note", "tags"]) {
  $(id).addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); save(); }
  });
}
for (const [id, box] of [["pick", "pick-results"], ["mention", "mention-results"]]) {
  $(id).addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const first = $(box).querySelector("button.pick");
    if (first) first.click();
  });
}

(async function init() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const stored = await chrome.storage.local.get(DEST_KEY);
  const remembered = DEST[stored[DEST_KEY]] ? stored[DEST_KEY] : null;
  if (remembered) dest = remembered;

  // A right-click left a capture in waiting: it names the destination, and for
  // an image it names the picture too.
  const got = await send("takePending");
  pending = (got && got.pending) || null;
  if (pending && (!tab || pending.tabId === tab.id)) {
    if (DEST[pending.dest]) dest = pending.dest;
    if (pending.imageSrc) pickedImage = pending.imageSrc;
    if (pending.picture) picture = pending.picture;
  } else {
    pending = null;
  }

  await refresh();
  if (!/^https?:/i.test(tab.url || "")) {
    status("This page cannot be saved — Chrome blocks extensions here.", "warn");
    $("save").disabled = true;
    return;
  }

  meta = await send("meta", { tab });
  if (meta && meta.ok !== false) {
    // The page's own account of itself, prefilled and editable.
    $("title").value = meta.title || tab.title || "";
    $("source").value = (pending && pending.url) || meta.url || tab.url || "";
    $("author").value = (meta.og && meta.og.author) || "";
    $("description").value = (meta.og && meta.og.description) || "";
    $("siteName").value = (meta.og && meta.og.siteName) || host(tab.url);
    if (meta.selection) {
      $("highlight").checked = true;
      if (!remembered && !pending) dest = "note";
    }
    // A link picked out of a context menu is its own page, not this one.
    if (pending && pending.url) {
      $("title").value = "";
      $("title").placeholder = "Named from the link if you leave this blank";
    }
    if (pickedImage && meta.alt) $("note").value = meta.alt;
  }
  if (state.settings && state.settings.wall) $("wall").value = state.settings.wall;
  paintForm();
  ($("row-title").classList.contains("hidden") ? $("note") : $("title")).focus();
})();
