// The setup page: where the folder is chosen and a stuck queue is unstuck.
//
// It is a page, not the popup, for one reason: `showDirectoryPicker` opens a
// native dialog, and a popup closes the instant it loses focus — the folder
// would be picked into a window that no longer exists. It is also the only
// surface with a user gesture to spend on `requestPermission`, which is why
// "Unlock" lives here and the popup only links to it.
//
// The page has three states and shows exactly one of them at a time:
//
//   onboard    no folder yet — one button, and nothing else to read
//   locked     a folder whose grant lapsed — a banner whose only button fixes it
//   connected  the settings, the queue and the log
//
// The reason is what first run used to look like: five sections, four of them
// empty, and the one decision that mattered competing with a Defaults form the
// user could not yet have an opinion about.

import { settings, saveSettings, pending, clear, drop } from "./store.js";
import { rememberHandle, forgetHandle, storedHandle, permission, openVault } from "./writer.js";

const $ = (id) => document.getElementById(id);
const send = (type, extra = {}) => chrome.runtime.sendMessage({ type, ...extra });

/** Two status lines — one per visible state — so the message always lands
 *  where the user is looking. They are never on screen at the same time. */
function status(text, tone = "") {
  for (const el of [$("status"), $("status-connected")]) {
    el.textContent = text;
    el.className = `status ${tone}`;
  }
}

function when(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(+d) ? "" : d.toLocaleString();
}

async function paintVault() {
  const handle = await storedHandle();
  const state = await permission(handle);
  const locked = Boolean(handle) && state !== "granted";

  $("onboard").classList.toggle("hidden", Boolean(handle));
  $("connected").classList.toggle("hidden", !handle);
  $("lock").classList.toggle("hidden", !locked);

  if (locked) {
    $("lock-title").textContent = `${handle.name} is locked`;
    $("lock-why").textContent = state === "denied"
      ? "Chrome is refusing access to this folder. Choose it again below."
      : "Chrome hands out folder access for the session, and this one has lapsed. "
        + "One click restores it and writes everything waiting.";
    $("unlock").textContent = state === "denied" ? "Try again" : `Unlock ${handle.name}`;
  }

  $("vault-name").textContent = handle ? handle.name : "Not connected";
  $("vault-why").textContent = !handle ? ""
    : state === "granted" ? "Connected. Clips are written as they are made."
    : state === "denied" ? "Chrome is refusing access to this folder. Choose it again."
    : "Access has lapsed. Unlock to write the clips waiting below.";
  return { handle, state };
}

async function paintWalls() {
  const dl = $("walls");
  dl.textContent = "";
  const st = await send("state");
  for (const w of (st && st.walls) || []) {
    dl.appendChild(Object.assign(document.createElement("option"), { value: w.title }));
  }
}

async function paintQueue() {
  const items = await pending();
  $("queue-title").textContent = items.length
    ? (items.length === 1 ? "1 waiting" : `${items.length} waiting`)
    : "Nothing waiting";
  $("flush").disabled = !items.length;
  $("clear").disabled = !items.length;
  const box = $("queue");
  box.textContent = "";
  if (!items.length) {
    box.appendChild(Object.assign(document.createElement("div"), {
      className: "item muted", textContent: "Every clip has been written.",
    }));
    return;
  }
  for (const rec of items) {
    const row = document.createElement("div");
    row.className = "item";
    const main = document.createElement("div");
    main.className = "grow stack";
    const t = document.createElement("div");
    t.className = "truncate";
    t.textContent = rec.title || rec.url || rec.type;
    const sub = document.createElement("div");
    sub.className = "tiny muted truncate";
    sub.textContent = `${rec.type}${rec.wall ? ` → ${rec.wall}` : ""} · ${when(rec.queuedAt)}`;
    main.append(t, sub);
    if (rec.error) {
      const e = document.createElement("div");
      e.className = "err";
      e.textContent = rec.error;
      main.appendChild(e);
    }
    const del = document.createElement("button");
    del.className = "ghost tiny";
    del.textContent = "Discard";
    del.addEventListener("click", async () => { await drop(rec.id); await refresh(); });
    row.append(main, del);
    box.appendChild(row);
  }
}

async function paintRecent() {
  const st = await send("state");
  const items = (st && st.recent) || [];
  const box = $("recent");
  box.textContent = "";
  if (!items.length) {
    box.appendChild(Object.assign(document.createElement("div"), {
      className: "item muted", textContent: "Nothing yet.",
    }));
    return;
  }
  for (const r of items) {
    const row = document.createElement("div");
    row.className = "item";
    const main = document.createElement("div");
    main.className = "grow truncate";
    main.textContent = r.title || r.path;
    const path = document.createElement("div");
    path.className = "tiny muted mono truncate";
    path.style.maxWidth = "280px";
    path.textContent = r.skipped ? `already in ${r.path}` : r.path;
    const at = document.createElement("div");
    at.className = "tiny muted";
    at.textContent = when(r.at);
    row.append(main, path, at);
    box.appendChild(row);
  }
}

async function paintSettings() {
  const s = await settings();
  $("wall").value = s.wall || "";
  $("group").value = s.group || "";
  $("linkTarget").value = s.linkTarget || "bookmark";
  $("autoSave").checked = s.autoSave !== false;
  $("dedupe").checked = s.dedupe !== false;
}

async function refresh() {
  await paintVault();
  await paintQueue();
  await paintRecent();
  await paintWalls();
  await send("badge");
}

// ── actions ─────────────────────────────────────────────────────────────────

/** Pick the folder. Shared by the first-run button and "Change folder…", which
 *  are the same act seen from two different states. */
async function chooseFolder() {
  let handle;
  try {
    handle = await showDirectoryPicker({ mode: "readwrite", id: "canon-vault" });
  } catch (e) {
    if (e && e.name === "AbortError") return;              // dismissed: say nothing
    status("Could not open that folder.", "bad");
    return;
  }
  await rememberHandle(handle);
  // A vault is a folder someone already made — with the app, or by hand, or by
  // cloning one. The clipper writes *into* it and never conjures one, so a
  // folder with no CONVENTION.md is worth saying out loud before the first clip
  // lands somewhere surprising.
  const opened = await openVault({ request: true });
  if (!opened.ok) {
    status(opened.message || `Could not open that folder: ${opened.reason}`, "bad");
    await refresh();
    return;
  }
  const known = opened.vault.list().length;
  status(known
    ? `Connected to ${handle.name} — ${known} pages. Clip anything and it lands here.`
    : `Connected to ${handle.name}. It looks empty — open it in the app once to set it up.`,
    known ? "ok" : "warn");
  await send("refreshWalls");
  await send("flush");
  await refresh();
}

$("connect").addEventListener("click", chooseFolder);
$("choose").addEventListener("click", chooseFolder);

$("unlock").addEventListener("click", async () => {
  const handle = await storedHandle();
  const state = await permission(handle, { request: true });
  if (state !== "granted") { status("Chrome did not grant access.", "warn"); return; }
  const r = await send("flush");
  status(r && r.wrote ? `Unlocked — wrote ${r.wrote} clip${r.wrote === 1 ? "" : "s"}.` : "Unlocked.", "ok");
  await refresh();
});

$("forget").addEventListener("click", async () => {
  await forgetHandle();
  status("Forgotten. Nothing on disk was touched.");
  await refresh();
});

$("flush").addEventListener("click", async () => {
  status("Writing…");
  const r = await send("flush");
  if (!r || r.ok === false) {
    status(r && r.reason === "permission"
      ? "The folder is locked — press Unlock at the top of the page."
      : (r && (r.message || r.reason)) || "Could not write.", "warn");
  } else {
    status(`Wrote ${r.wrote}${r.failed ? `, ${r.failed} failed` : ""}.`, r.failed ? "warn" : "ok");
  }
  await refresh();
});

$("clear").addEventListener("click", async () => {
  const n = (await pending()).length;
  if (!confirm(`Discard ${n} unwritten clip${n === 1 ? "" : "s"}? They are not in the vault yet.`)) return;
  await clear();
  status("Queue discarded.");
  await refresh();
});

for (const [id, key, read] of [
  ["wall", "wall", (el) => el.value.trim()],
  ["group", "group", (el) => el.value.trim()],
  ["linkTarget", "linkTarget", (el) => el.value],
  ["autoSave", "autoSave", (el) => el.checked],
  ["dedupe", "dedupe", (el) => el.checked],
]) {
  const el = $(id);
  el.addEventListener("change", async () => { await saveSettings({ [key]: read(el) }); });
}

/** Arriving from the popup's locked chip. The button is already the only thing
 *  in the banner; focusing it means the whole recovery is one keystroke. */
function honourHash() {
  if (location.hash !== "#unlock" || $("lock").classList.contains("hidden")) return;
  $("lock").scrollIntoView({ block: "center" });
  $("unlock").focus();
}

paintSettings().then(refresh).then(honourHash);
