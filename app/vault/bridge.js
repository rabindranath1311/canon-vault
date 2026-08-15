// Task 6.1 / 6.4: stand the vault up, expose it as `window.SB_DATA`, then load
// app.js. app.js is a classic script and cannot import modules, so this is the
// seam between the ES-module data layer and the existing app.
//
// SPEC §7: the app must ALWAYS open to content. So the order is
//   restore handle (no gesture) → granted? render live
//                               → otherwise render the cached index read-only
//                                 behind a persistent reconnect banner.
// A cold open never shows an empty shell, because an empty shell reads as broken.

import { connectVault, reconnectOutcome, vaultNotices, Vault, FSABackend, MemoryBackend, WriterElection, PERSIST_KEY } from "./vault.js";
import { Data, noteChrome, edgeGeometry } from "./data.js";
import { parseExcalidraw, serializeExcalidraw } from "./excalidraw.js";
import { parseInspoBody, serializeInspoBody, inspoTags, itemsFromCanvasLayout } from "./inspo.js";
import * as links from "./links.js";
import { scaffold } from "./scaffold.js";

// Deliberately not renamed to "canon-vault": this database holds the saved
// directory handle, so changing the name would make every existing install
// forget its vault and re-prompt for the folder picker. The name is private to
// IndexedDB and never shown.
const DB = "second-brain";
const STORE = "handles";

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

const store = {
  async get(key) {
    const db = await idb();
    return new Promise((res, rej) => {
      const rq = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      rq.onsuccess = () => res(rq.result || null);
      rq.onerror = () => rej(rq.error);
    });
  },
  async set(key, value) {
    const db = await idb();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  },
};

function markdownRenderer() {
  const mk = window.markdownit;
  if (typeof mk !== "function") return (md) => md;
  // The server's exact configuration — see S9. Output is byte-identical.
  const md = mk("default", { html: false, linkify: false, typographer: true });
  return (src) => md.render(src || "");
}

// Third copy of the cache-bust, and the worst placed: app.js is the largest
// file in the app and this pinned it to one version forever. A module knows its
// own URL, and boot.js already passes ours through, so read it from there.
const ASSET_V = new URL(import.meta.url).searchParams.get("v") || "0";

function loadApp() {
  if (window.__SB_APP_LOADED) return;
  window.__SB_APP_LOADED = true;
  for (const src of ["app.js"]) {
    const s = document.createElement("script");
    s.src = `${src}?v=${ASSET_V}`;
    s.async = false;
    document.head.appendChild(s);
  }
}

function banner(text, actionLabel, onAction) {
  let el = document.getElementById("sb-vault-banner");
  if (!el) {
    el = document.createElement("div");
    el.id = "sb-vault-banner";
    el.className = "sb-vault-banner";
    document.body.appendChild(el);
  }
  el.textContent = "";
  el.appendChild(document.createTextNode(text + " "));
  if (actionLabel) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "sb-vault-banner-action";
    b.textContent = actionLabel;
    b.addEventListener("click", onAction);
    el.appendChild(b);
  }
  return el;
}

function clearBanner() {
  const el = document.getElementById("sb-vault-banner");
  if (el) el.remove();
}

function firstRun(onPick, onDemo) {
  const root = document.getElementById("root") || document.body;
  root.innerHTML = "";
  const wrap = document.createElement("main");
  wrap.className = "sb-connect";
  const h = document.createElement("h1");
  h.textContent = "Open your vault";
  const p = document.createElement("p");
  p.textContent = "Pick the folder your notes live in. They stay on your disk — "
    + "nothing is uploaded, and Obsidian or any editor can open the same files.";
  const b = document.createElement("button");
  b.type = "button";
  b.className = "sb-connect-cta";
  b.textContent = "Choose folder";
  b.addEventListener("click", onPick);
  wrap.append(h, p, b);

  // Handing over a folder is a real decision, and nobody makes it for software
  // they have not seen work. The demo runs the whole app against an in-memory
  // vault of invented pages — no picker, no permission prompt, nothing written.
  if (onDemo) {
    const alt = document.createElement("p");
    alt.className = "sb-connect-alt";
    const link = document.createElement("button");
    link.type = "button";
    link.className = "sb-connect-demo";
    link.textContent = "Try a demo vault";
    link.addEventListener("click", onDemo);
    alt.append(document.createTextNode("Not ready? "), link,
               document.createTextNode(" — invented pages, nothing touches your disk."));
    wrap.appendChild(alt);
  }
  root.appendChild(wrap);
}

/**
 * Stand the app up against an in-memory vault of invented pages.
 *
 * Dynamically imported so its bytes are not on the critical path for someone
 * opening their own vault. Writes work and are simply lost on reload, which is
 * the honest behaviour for a demo — the banner says so.
 */
async function openDemo() {
  let DEMO_FILES;
  try {
    ({ DEMO_FILES } = await import(`./demo-vault.js?v=${ASSET_V}`));
  } catch {
    banner("Could not load the demo — you may be offline. Choosing a folder still works.");
    return;
  }
  const be = new MemoryBackend(DEMO_FILES);
  // build() reads this for the Obsidian vault name. Not a hardcoded vault name
  // in the SPEC §14 sense: there is no folder here to derive one from.
  be.root = { name: "demo-vault" };
  const vault = new Vault(be);
  clearBanner();
  await build(vault);
  loadApp();
  window.SB_DEMO = true;
  banner("Demo vault — invented pages, held in memory. Edits are lost on reload.",
         "Open my own vault", () => location.reload());
  window.dispatchEvent(new CustomEvent("sb:vault-connected"));
}

async function build(handleVault) {
  // 10.7 / 10.2: first run into an empty folder writes the skeleton — the
  // convention doc, the agent contract, the context templates and the vault
  // directories. This call was missing entirely: scaffold.js was written and
  // unit-tested but never imported, so a real first run produced an empty
  // vault with no CONVENTION.md — which is both the format authority and the
  // anchor `vaultFingerprint` reads, leaving the S7 guard nothing to compare.
  //
  // No extra guard needed here: scaffold() refuses any folder that already
  // holds notes, so SPEC §6's "never write on adoption" still holds.
  try {
    await scaffold(handleVault.be);
  } catch { /* a read-only or full folder must not block opening the vault */ }

  const election = new WriterElection(
    "BroadcastChannel" in window ? new BroadcastChannel("sb-writer") : null);
  handleVault.election = election;
  const data = new Data(handleVault, { renderMarkdown: markdownRenderer() });
  await handleVault.buildIndex();
  window.SB_LINKS = links;
  window.SB_CHROME = noteChrome;   // 2.7      // 6.10: wikilink resolution for app.js
  window.SB_EDGE_GEOM = edgeGeometry;          // canvas edge curves, drawn by app.js
  window.SB_EXCALIDRAW = { parse: parseExcalidraw, serialize: serializeExcalidraw };
  window.SB_INSPO = {
    parse: parseInspoBody, serialize: serializeInspoBody,
    tags: inspoTags, fromCanvas: itemsFromCanvasLayout,
  };
  window.SB_VAULT = handleVault;
  // 6.6: the Obsidian vault name is the folder the user picked. Never a
  // constant — SPEC §14 forbids a hardcoded vault name anywhere.
  window.SB_VAULT_NAME = (handleVault.be && handleVault.be.root && handleVault.be.root.name) || '';
  window.SB_DATA = data;
  window.SB_WARNINGS = handleVault.warnings;

  // SPEC §7: re-scan on focus to pick up Obsidian's edits.
  window.addEventListener("focus", () => {
    handleVault.watchExternal().then((r) => {
      if (r.created.length || r.removed.length || r.changed.length) {
        window.dispatchEvent(new CustomEvent("sb:vault-changed", { detail: r }));
      }
    }).catch(() => {});
  });

  const notices = vaultNotices(election.isWriter, handleVault.warnings);
  if (notices.length) banner(notices.join(" · "));
  return data;
}

async function boot() {
  const deps = {
    store,
    picker: () => window.showDirectoryPicker({ mode: "readwrite" }),
    queryPermission: (h) => h.queryPermission({ mode: "readwrite" }),
    requestPermission: (h) => h.requestPermission({ mode: "readwrite" }),
  };

  let r;
  try {
    r = await connectVault({ ...deps, interactive: false });
  } catch (e) {
    r = { state: "prompt", vault: null };
  }

  if (r.state === "granted" && r.vault) {
    // Clear BEFORE building. build() raises its own banner when this tab lost
    // the writer election, and clearing afterwards wiped it — so a second tab
    // went read-only in silence: every save was refused with `not-writer` and
    // nothing on screen said why.
    clearBanner();
    await build(r.vault);
    loadApp();
    return;
  }

  const reconnect = async () => {
    let again = null, err = null;
    try {
      again = await connectVault({ ...deps, interactive: true });
    } catch (e) {
      err = e;
    }
    const outcome = reconnectOutcome(again, err);
    if (outcome.act === "nothing") return;      // picker dismissed: leave the screen alone
    if (outcome.act === "banner") {
      banner(outcome.text, "Try again", reconnect);
      return;
    }
    clearBanner();                 // same ordering as the cold path above
    await build(again.vault);
    loadApp();
    window.dispatchEvent(new CustomEvent("sb:vault-connected"));
  };

  const stored = await store.get(PERSIST_KEY).catch(() => null);
  if (!stored) {
    firstRun(reconnect, openDemo);  // never seen a vault: onboarding, not an error
  } else {
    // We had a vault and lost the grant. Show content, disable writing.
    banner("Vault disconnected — showing the last known state, read-only.",
           "Reconnect vault", reconnect);
    loadApp();
  }
}

boot();
