// The popup: one screen, three seconds. Everything slower than that — picking
// the folder, fixing a failed write, changing defaults — belongs on the setup
// page, which is a real tab and survives a file dialog.
//
// No writing happens here. The popup asks the service worker, because the queue
// has to be written by whoever is still alive when the popup closes, and a
// popup closes the moment you look away from it.

import { saveSettings } from "./store.js";

const $ = (id) => document.getElementById(id);
const send = (type, extra = {}) => chrome.runtime.sendMessage({ type, ...extra });

let tab = null;
let meta = null;
let state = null;

function status(text, tone = "") {
  const el = $("status");
  el.textContent = text;
  el.className = `status ${tone}`;
}

function host(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url || ""; }
}

/**
 * Open the setup page, optionally on the control that fixes what is wrong.
 *
 * `openOptionsPage` cannot carry a fragment, and the fragment is the whole
 * point when the answer is one specific button — so a targeted open makes the
 * tab itself. An untargeted one keeps `openOptionsPage`, which reuses a setup
 * tab that is already open instead of stacking another.
 */
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
    chip.title = "Pick the folder your vault lives in";
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
    chip.title = "Chrome dropped the folder permission. Click to restore it.";
    banner.classList.remove("hidden");
    $("banner-title").textContent = `${v.name} is locked`;
    $("banner-why").textContent = "Chrome drops folder access between sessions. One click restores it.";
    $("banner-do").textContent = "Unlock";
    banner.dataset.hash = "#unlock";
    return;
  }
  chip.textContent = v.name;
  chip.className = "chip";
  chip.title = "Vault settings";
  banner.classList.add("hidden");
}

function paintTarget() {
  const want = state.settings.linkTarget || "bookmark";
  for (const b of $("target").querySelectorAll("button")) {
    b.classList.toggle("on", b.dataset.target === want);
  }
}

/** Tags and wall are collapsed until asked for. Anything already carrying a
 *  value opens them, because a hidden field that is quietly set is a trap. */
function paintDetails() {
  const open = state.settings.details === true
    || Boolean($("tags").value.trim())
    || Boolean($("wall").value.trim());
  setDetails(open, false);
}

function setDetails(open, remember = true) {
  $("more").classList.toggle("hidden", !open);
  $("more-toggle").setAttribute("aria-expanded", String(open));
  $("more-toggle").classList.toggle("open", open);
  $("more-label").textContent = open ? "Tags and wall" : "Add tags or choose a wall";
  if (remember) saveSettings({ details: open });
}

function paintWalls() {
  const dl = $("walls");
  dl.textContent = "";
  for (const w of state.walls || []) {
    dl.appendChild(Object.assign(document.createElement("option"), { value: w.title }));
  }
  // The default goes in the placeholder, not the value. `fields()` already
  // falls back to it, so an untouched field means "wherever it usually goes" —
  // and a *typed* one is the only thing that counts as an override worth
  // opening the section for.
  if (state.settings.wall) $("wall").placeholder = state.settings.wall;
}

function paintQueue() {
  const box = $("queue-box");
  const list = $("queue");
  const items = state.pending || [];
  box.classList.toggle("hidden", !items.length);
  $("queue-title").textContent = items.length === 1 ? "1 waiting" : `${items.length} waiting`;
  list.textContent = "";
  for (const rec of items) {
    const row = document.createElement("div");
    row.className = "item";
    const label = document.createElement("div");
    label.className = "grow truncate";
    label.textContent = rec.title || rec.url || rec.type;
    const why = document.createElement("div");
    why.className = "err truncate";
    why.style.maxWidth = "120px";
    why.textContent = rec.error || "";
    const del = document.createElement("button");
    del.className = "ghost tiny";
    del.textContent = "✕";
    del.title = "Discard this clip";
    del.addEventListener("click", async () => {
      await send("dropOne", { id: rec.id });
      await refresh();
    });
    row.append(label, why, del);
    list.appendChild(row);
  }
}

function paintRecent() {
  const items = (state.recent || []).slice(0, 3);
  $("recent-box").classList.toggle("hidden", !items.length);
  const list = $("recent");
  list.textContent = "";
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
    list.appendChild(row);
  }
}

function paint() {
  paintVault();
  paintTarget();
  paintWalls();
  paintDetails();
  paintQueue();
  paintRecent();
}

async function refresh() {
  state = await send("state");
  paint();
}

/** What the popup adds to every clip: the caption, tags and wall on screen. */
function fields() {
  return {
    note: $("caption").value.trim(),
    tags: $("tags").value.trim(),
    wall: $("wall").value.trim() || state.settings.wall,
  };
}

async function rememberWall() {
  const wall = $("wall").value.trim();
  if (wall && wall !== state.settings.wall) {
    state.settings = await saveSettings({ wall });
  }
}

/** Report what the worker did — including "queued, not saved", which is the
 *  one outcome a clipper must never round up to success. */
function report(r) {
  if (!r || r.ok === false) {
    if (r && r.reason === "cancelled") { status("Cancelled."); return; }
    if (r && r.reason === "no-vault") {
      status("Kept — connect a vault above and it is written.", "warn");
      return;
    }
    if (r && (r.reason === "permission" || r.reason === "different-vault")) {
      status("Kept — unlock the vault above and it is written.", "warn");
      return;
    }
    status(`Clipped, not saved: ${(r && (r.message || r.reason)) || "unknown"}`, "bad");
    return;
  }
  if (r.wrote) status("Saved to the vault.", "ok");
  else if (r.failed) status("Clipped, but the write failed — see below.", "bad");
  else status("Clipped — waiting for the vault.", "warn");
}

async function act(fn) {
  status("Working…");
  await rememberWall();
  try {
    report(await fn());
  } catch (e) {
    status(String((e && e.message) || e), "bad");
  }
  await refresh();
}

// ── wiring ──────────────────────────────────────────────────────────────────

$("vault-chip").addEventListener("click", () => openSetup());

$("banner-do").addEventListener("click", () => openSetup($("vault-banner").dataset.hash || ""));

$("more-toggle").addEventListener("click", () => {
  setDetails($("more").classList.contains("hidden"));
  if (!$("more").classList.contains("hidden")) $("tags").focus();
});

$("target").addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-target]");
  if (!b) return;
  state.settings = await saveSettings({ linkTarget: b.dataset.target });
  paintTarget();
  // Choosing the wall as the destination is as close as the UI gets to being
  // told *which* wall matters — so open the field that answers it.
  if (b.dataset.target === "wall" && $("more").classList.contains("hidden")) setDetails(true);
});

$("clip-page").addEventListener("click", () => act(() => send("clipPage", {
  tab, target: state.settings.linkTarget, fields: fields(),
})));

$("clip-selection").addEventListener("click", () => {
  const text = (meta && meta.selection) || "";
  if (!text) { status("Nothing is selected on the page.", "warn"); return; }
  return act(() => send("clipSelection", { tab, text, fields: fields() }));
});

// The page's own social image — the fastest way to keep a piece of interface
// that the site already rendered as a picture.
$("clip-og").addEventListener("click", () => {
  const src = meta && meta.og && meta.og.image;
  if (!src) { status("This page offers no image.", "warn"); return; }
  return act(() => send("clipImage", { tab, src, fields: fields() }));
});

$("clip-region").addEventListener("click", async () => {
  await rememberWall();
  send("clipShot", { tab, region: true, fields: fields() });  // the drag needs the popup gone
  window.close();
});

$("clip-screen").addEventListener("click", () =>
  act(() => send("clipShot", { tab, region: false, fields: fields() })));

$("flush").addEventListener("click", () => act(() => send("flush")));

// Enter from any of the three text fields clips the page — the field you are in
// is a detail *about* that clip, never a separate destination.
for (const id of ["caption", "tags", "wall"]) {
  $(id).addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); $("clip-page").click(); }
  });
}

(async function init() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await refresh();
  $("page-title").textContent = tab.title || "";
  $("page-host").textContent = host(tab.url);
  if (!/^https?:/i.test(tab.url || "")) {
    status("This page cannot be clipped — Chrome blocks extensions here.", "warn");
    for (const id of ["clip-page", "clip-region", "clip-screen", "clip-selection", "clip-og"]) {
      $(id).disabled = true;
    }
    return;
  }
  meta = await send("meta", { tab });
  if (meta) {
    $("page-title").textContent = meta.title || tab.title || "";
    if (meta.og && meta.og.image) {
      $("thumb").src = meta.og.image;
      $("thumb").hidden = false;
    }
    if (meta.selection) $("caption").placeholder = meta.selection.slice(0, 60);
    // Two of the five actions only mean anything on some pages. Saying which
    // beats a button that answers "nothing is selected" after the click.
    if (!meta.selection) {
      $("clip-selection").disabled = true;
      $("clip-selection").title = "Select some text on the page first";
    }
    if (!(meta.og && meta.og.image)) {
      $("clip-og").disabled = true;
      $("clip-og").title = "This page offers no image of its own";
    }
  }
  $("caption").focus();
})();
