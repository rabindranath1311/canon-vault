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
//   connected  the folder, the one setting, and the log
//
// **Every action here reports what actually happened.** That is not a nicety:
// Unlock used to say "Unlocked." in green whatever the write pump replied, so a
// flush that had refused all eight clips looked identical to one that wrote
// them, and pressing the button again looked like pressing a dead button. The
// rules that came out of that:
//
//   - no await may run between the click and `requestAccess` (see writer.js);
//   - every handler is wrapped, because an unhandled rejection IS the silence;
//   - `ok === false` is never reported as success, and the reason is shown;
//   - a message that cannot be acted on carries the control that can.

import { settings, saveSettings, pending, clear, drop } from "./store.js";
import { rememberHandle, forgetHandle, storedHandle, permission, requestAccess, openVault }
  from "./writer.js";

const $ = (id) => document.getElementById(id);

/** The stored handle, held so a click can spend its gesture immediately. */
let HANDLE = null;

/**
 * Talk to the service worker.
 *
 * A worker that failed to start, or died on an import error, makes every
 * `sendMessage` reject — and an uncaught rejection here is a button that does
 * nothing at all. So the failure becomes an ordinary answer with a reason the
 * page can print.
 */
async function send(type, extra = {}) {
  try {
    const r = await chrome.runtime.sendMessage({ type, ...extra });
    return r ?? { ok: false, reason: "no-reply",
                  message: "The clipper's background worker did not answer." };
  } catch (e) {
    return { ok: false, reason: "worker",
             message: "The clipper's background worker is not responding — reload the "
                    + "extension at chrome://extensions and try again. "
                    + `(${(e && e.message) || e})` };
  }
}

/** Two status lines — one per visible state — so the message always lands
 *  where the user is looking. They are never on screen at the same time. */
function status(text, tone = "") {
  for (const el of [$("status"), $("status-connected")]) {
    el.textContent = text;
    el.className = `status ${tone}`;
  }
}

/**
 * Wrap a handler so a thrown error becomes a message rather than silence, and
 * so the button it belongs to shows that it is working.
 *
 * The second half matters more than it looks: opening the vault rebuilds the
 * index, which reads every markdown file in the folder. On a large vault that
 * is several seconds during which the old page said nothing at all — and a
 * button that looks idle while it works is a button people press again.
 */
function guard(fn, busy = null) {
  return async (event) => {
    const btn = event && event.currentTarget;
    const label = btn ? btn.textContent : null;
    if (btn && busy) { btn.textContent = busy; btn.disabled = true; }
    try {
      await fn(event);
    } catch (e) {
      status(`That did not work: ${(e && e.message) || e}`, "bad");
      await refresh().catch(() => {});
    } finally {
      if (btn && busy) { btn.textContent = label; btn.disabled = false; }
    }
  };
}

function when(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(+d) ? "" : d.toLocaleString();
}

/** The permission state, in words, always on screen. The complaint that led
 *  here was not "it failed" — it was "I cannot tell what it is doing". */
function accessWord(state) {
  return state === "granted" ? "connected"
    : state === "denied" ? "blocked by Chrome"
    : state === "prompt" ? "locked"
    : "no folder";
}

async function paintVault() {
  HANDLE = await storedHandle();
  const handle = HANDLE;
  const state = await permission(handle);
  const locked = Boolean(handle) && state !== "granted";
  const waiting = await pending();

  $("onboard").classList.toggle("hidden", Boolean(handle));
  $("connected").classList.toggle("hidden", !handle);
  $("lock").classList.toggle("hidden", !locked);

  if (locked) {
    $("lock-title").textContent = `${handle.name} is locked`;
    $("lock-why").textContent = state === "denied"
      ? "Chrome is refusing access to this folder. Choose it again — picking a folder "
        + "always grants access, where Unlock only asks."
      : "Chrome hands out folder access for the session, and this one has lapsed. "
        + "One click restores it and writes everything waiting.";
    $("unlock").textContent = "Unlock";
    $("unlock").disabled = state === "denied";
  }

  $("vault-name").textContent = handle ? handle.name : "Not connected";
  $("vault-state").textContent = handle
    ? `${accessWord(state)}${waiting.length ? ` · ${waiting.length} waiting` : ""}`
    : "";
  $("vault-state").className = `pill ${state === "granted" ? "ok" : "warn"}`;
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
  // Nothing waiting is the normal state, and it has nothing to say: the section
  // appears only when there is a clip the user thinks is saved and is not.
  $("queue-sec").classList.toggle("hidden", !items.length);
  if (!items.length) return;
  $("queue-title").textContent = items.length === 1 ? "1 waiting" : `${items.length} waiting`;
  const box = $("queue");
  box.textContent = "";
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
    sub.textContent = `${rec.type} · ${when(rec.queuedAt)}`;
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
    del.addEventListener("click", guard(async () => { await drop(rec.id); await refresh(); }));
    row.append(main, del);
    box.appendChild(row);
  }
}

async function paintRecent() {
  const st = await send("state");
  const items = ((st && st.recent) || []).slice(0, 10);
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
}

async function refresh() {
  await paintVault();
  await paintQueue();
  await paintRecent();
  await paintWalls();
  await send("badge");
}

// ── saying what the write pump did ──────────────────────────────────────────

/**
 * One place that turns a flush result into a sentence, because the two buttons
 * that flush used to disagree about what counted as success.
 *
 * `different-vault` gets its own treatment: it is the one failure the user
 * cannot fix with the button they just pressed, so it names the one that works.
 */
function reportFlush(r, prefix = "") {
  if (!r || r.ok === false) {
    const reason = r && r.reason;
    if (reason === "permission") {
      status(`${prefix}The folder is still locked — Chrome did not grant access.`, "warn");
    } else if (reason === "no-vault") {
      status(`${prefix}No folder is connected yet.`, "warn");
    } else if (reason === "different-vault") {
      status(`${prefix}${(r && r.message) || "That is a different folder."} `
             + "Press “Change folder…” and pick it again to adopt it.", "bad");
    } else {
      status(`${prefix}${(r && (r.message || reason)) || "Could not write."}`, "bad");
    }
    return false;
  }
  const bits = [];
  if (r.vault) bits.push(`read ${r.vault}${r.pages != null ? ` (${r.pages} pages)` : ""}`);
  if (r.wrote) bits.push(`wrote ${r.wrote} clip${r.wrote === 1 ? "" : "s"}`);
  if (r.failed) bits.push(`${r.failed} failed — the reason is on each one below`);
  if (!r.wrote && !r.failed) bits.push("nothing was waiting");
  status(prefix + bits.join(", ") + ".", r.failed ? "warn" : "ok");
  return !r.failed;
}

// ── actions ─────────────────────────────────────────────────────────────────

/** Pick the folder. Shared by the first-run button, "Change folder…" and the
 *  locked banner's escape hatch — they are one act seen from three states. */
const chooseFolder = guard(async () => {
  status("Waiting for the folder dialog…");
  let handle;
  try {
    handle = await showDirectoryPicker({ mode: "readwrite", id: "canon-vault" });
  } catch (e) {
    if (e && e.name === "AbortError") { status(""); return; }   // dismissed: say nothing
    status(`Could not open that folder: ${(e && e.message) || e}`, "bad");
    return;
  }
  status(`Opening ${handle.name}…`);
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
  const head = known
    ? `${handle.name} · ${known} pages. `
    : `${handle.name} looks empty — open it in the app once to set it up. `;
  await send("refreshWalls");
  const waiting = (await pending()).length;
  if (waiting) reportFlush(await send("flush"), head);
  else status(head + "Ready.", known ? "ok" : "warn");
  await refresh();
});

$("connect").addEventListener("click", chooseFolder);
$("choose").addEventListener("click", chooseFolder);
$("lock-repick").addEventListener("click", chooseFolder);

/**
 * Unlock. The handle is already in hand and `requestAccess` is the first thing
 * the click does, so the gesture is still warm when Chrome checks for one.
 */
$("unlock").addEventListener("click", guard(async () => {
  if (!HANDLE) { status("No folder is connected yet.", "warn"); return; }
  let asked;
  try {
    asked = requestAccess(HANDLE);          // no await before this line
    status("Asking Chrome for access…");
    asked = await asked;
  } catch (e) {
    // NotAllowedError here means the dialog never opened. Say that, rather
    // than leaving the user to press a button that appears to do nothing.
    status(`Chrome would not show the access dialog (${(e && e.name) || "error"}: `
           + `${(e && e.message) || e}). Press “Choose folder again” instead — `
           + "picking a folder always grants access.", "bad");
    await refresh();
    return;
  }
  if (asked !== "granted") {
    status(asked === "denied"
      ? "Chrome is blocking access to this folder. Press “Choose folder again” and pick it."
      : "The dialog was dismissed, so access was not granted. Press Unlock and choose Allow, "
        + "or use “Choose folder again”.", "warn");
    await refresh();
    return;
  }
  status(`Access granted — reading ${HANDLE.name}…`);
  reportFlush(await send("flush"), `Unlocked ${HANDLE.name} — `);
  await refresh();
}, "Unlocking…"));

$("check").addEventListener("click", guard(async () => {
  status("Reading the folder…");
  const r = await send("check");
  if (!r || r.ok === false) {
    reportFlush(r, "Not connected — ");
    await refresh();
    return;
  }
  status(`${r.name} · ${r.pages} pages · ${r.notes} notes · ${r.walls} walls`
         + `${r.ms != null ? ` · read in ${(r.ms / 1000).toFixed(1)}s` : ""}`, "ok");
  await refresh();
}, "Reading…"));

$("forget").addEventListener("click", guard(async () => {
  await forgetHandle();
  status("Forgotten. Nothing on disk was touched.");
  await refresh();
}));

$("flush").addEventListener("click", guard(async () => {
  status("Reading the folder, then writing…");
  reportFlush(await send("flush"));
  await refresh();
}, "Writing…"));

$("clear").addEventListener("click", guard(async () => {
  const n = (await pending()).length;
  if (!confirm(`Discard ${n} unwritten clip${n === 1 ? "" : "s"}? They are not in the vault yet.`)) return;
  await clear();
  status("Queue discarded.");
  await refresh();
}));

// The one setting. Blank means the default, which is why `settings()` drops
// empty values rather than storing them.
$("wall").addEventListener("change", guard(async () => {
  await saveSettings({ wall: $("wall").value.trim() });
  status(`Pictures now land on “${$("wall").value.trim() || "Interface Inspiration"}”.`, "ok");
}));

/** Arriving from the popup's locked chip. The button is already the only thing
 *  in the banner; focusing it means the whole recovery is one keystroke. */
function honourHash() {
  if (location.hash !== "#unlock" || $("lock").classList.contains("hidden")) return;
  $("lock").scrollIntoView({ block: "center" });
  $("unlock").focus();
}

paintSettings()
  .then(refresh)
  .then(honourHash)
  .catch((e) => status(`The setup page could not read its own state: ${(e && e.message) || e}`, "bad"));
