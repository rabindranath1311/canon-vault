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

// The brand lockup, duplicated here because this screen renders before app.js
// exists — bridge.js is what stands the vault up, and app.js only loads once a
// vault is open. app.js owns the canonical copy (BRAND_MARK / BRAND_WORD);
// keep the two in step if the artwork changes.
function brandLockup() {
  const el = document.createElement("div");
  el.className = "sb-connect-brand";
  el.setAttribute("aria-label", "Canon Vault");
  el.innerHTML =
    '<span class="brand-mark"><svg viewBox="0 0 144 100" fill="currentColor" aria-hidden="true">'
    + "<path d=\"M49.6426 11.3103C58.0084 10.2422 66.4938 11.9487 73.7959 16.1687C79.489 19.4587 84.2172 24.1354 87.5654 29.7243C89.1394 32.3521 87.7727 35.6274 84.9463 36.8083C82.1207 37.9888 78.9145 36.6121 77.1885 34.0827C72.2514 26.8472 63.9417 22.0965 54.5215 22.0964C39.3753 22.0964 27.0967 34.375 27.0967 49.5212C27.0967 64.6673 39.3753 76.946 54.5215 76.946C61.1452 76.9459 67.2197 74.5962 71.959 70.6862C74.3225 68.7365 77.7872 68.3119 80.1709 70.237C82.5557 72.1631 82.9517 75.6935 80.7031 77.7771C75.9253 82.2042 70.0782 85.3689 63.6933 86.9343C55.5022 88.9424 46.8782 88.2067 39.1455 84.8405C31.4128 81.4742 24.998 75.6632 20.8867 68.2995C16.7755 60.9358 15.1949 52.4258 16.3867 44.0769C17.5787 35.7279 21.4779 28.0009 27.4853 22.0817C33.4929 16.1626 41.2768 12.3784 49.6426 11.3103ZM118.446 34.2038C120.06 31.4092 123.681 30.5291 126.397 32.2712C128.903 33.8786 129.734 37.1532 128.297 39.7605L104.945 82.1384C102.861 85.9205 97.4132 85.8849 95.3789 82.0759L82.4726 57.9099C80.797 54.7724 77.4572 52.8875 73.9053 53.0749L64.3369 53.5788C62.7427 57.431 58.9497 60.1421 54.5215 60.1423C48.6556 60.1423 43.9004 55.387 43.9004 49.5212C43.9004 43.6553 48.6556 38.9001 54.5215 38.9001C59.1359 38.9003 63.0619 41.8435 64.5273 45.9548H82.7578C86.0319 45.9549 89.0572 47.7014 90.6943 50.5368L99.8555 66.404L118.446 34.2038Z\" fill=\"currentColor\"/>"
    + '</svg></span>'
    + '<span class="brand-word"><svg viewBox="0 0 1712 91" fill="currentColor" aria-hidden="true">'
    + "<path d=\"M58.9241 90.7148C22.4681 90.7148 0 73.4966 0 45.327C0 17.3398 22.8178 0 58.487 0C81.8294 0 100.276 7.6052 108.581 20.4428C109.98 22.4505 110.679 24.5191 110.679 26.3444C110.679 30.5425 106.745 33.2195 100.713 33.2195C95.555 33.2195 92.1455 31.5159 89.6976 27.6829C83.8401 18.2525 72.3875 13.3243 58.6619 13.3243C36.9806 13.3243 23.0801 25.736 23.0801 45.327C23.0801 65.0396 36.8932 77.3905 58.7493 77.3905C73.1744 77.3905 84.2773 73.0099 90.0473 63.762C92.3203 60.1723 95.2053 58.7121 100.101 58.7121C106.308 58.7121 110.592 61.5717 110.592 65.7089C110.592 67.7167 109.893 69.5419 108.494 71.6105C100.451 83.5355 82.5288 90.7148 58.9241 90.7148Z\" fill=\"currentColor\"/> <path d=\"M181.228 90.2889C174.321 90.2889 169.862 87.4902 169.862 83.0487C169.862 81.8319 170.3 80.1283 171.349 78.2422L207.98 8.94371C211.039 3.10292 216.11 0.425891 224.328 0.425891C232.633 0.425891 237.704 2.98124 240.851 8.88287L277.569 78.2422C278.619 80.25 279.056 81.6494 279.056 83.0487C279.056 87.3076 274.335 90.2889 267.778 90.2889C261.658 90.2889 258.249 88.3419 256.238 83.6571L247.933 66.8649H200.811L192.505 83.5355C190.407 88.2811 187.085 90.2889 181.228 90.2889ZM206.144 54.4532H242.425L224.503 16.9748H223.891L206.144 54.4532Z\" fill=\"currentColor\"/> <path d=\"M354.762 90.2889C347.943 90.2889 343.834 87.3685 343.834 82.3795V8.51782C343.834 3.46797 348.292 0.425891 355.549 0.425891C360.532 0.425891 363.592 1.64272 367.264 5.11069L426.013 62.971H426.8V8.33529C426.8 3.34629 430.909 0.425891 437.64 0.425891C444.459 0.425891 448.481 3.34629 448.481 8.33529V82.4403C448.481 87.4293 444.372 90.2889 437.028 90.2889C431.87 90.2889 428.898 89.1329 425.313 85.6041L366.389 27.6829H365.602V82.3795C365.602 87.3685 361.494 90.2889 354.762 90.2889Z\" fill=\"currentColor\"/> <path d=\"M574.719 90.7148C537.913 90.7148 514.833 73.3141 514.833 45.3878C514.833 17.4615 537.913 0 574.719 0C611.437 0 634.517 17.4615 634.517 45.3878C634.517 73.3141 611.437 90.7148 574.719 90.7148ZM574.719 77.3296C597.187 77.3296 611.524 64.9179 611.524 45.3878C611.524 25.7968 597.187 13.3851 574.719 13.3851C552.163 13.3851 537.913 25.7968 537.913 45.3878C537.913 64.9179 552.163 77.3296 574.719 77.3296Z\" fill=\"currentColor\"/> <path d=\"M711.797 90.2889C704.978 90.2889 700.869 87.3685 700.869 82.3795V8.51782C700.869 3.46797 705.327 0.425891 712.584 0.425891C717.567 0.425891 720.627 1.64272 724.298 5.11069L783.048 62.971H783.835V8.33529C783.835 3.34629 787.944 0.425891 794.675 0.425891C801.494 0.425891 805.516 3.34629 805.516 8.33529V82.4403C805.516 87.4293 801.407 90.2889 794.063 90.2889C788.905 90.2889 785.933 89.1329 782.348 85.6041L723.424 27.6829H722.637V82.3795C722.637 87.3685 718.528 90.2889 711.797 90.2889Z\" fill=\"currentColor\"/> <path d=\"M884.369 60.3548C878.424 60.3548 873.966 57.7995 873.966 53.6014C873.966 49.4033 878.424 46.848 884.369 46.848H923.885C929.917 46.848 934.289 49.4033 934.289 53.6014C934.289 57.7995 929.917 60.3548 923.885 60.3548H884.369Z\" fill=\"currentColor\"/> <path d=\"M1045.58 90.2889C1037.18 90.2889 1032.38 87.7944 1029.14 81.7102L991.461 12.0466C990.587 10.5256 990.237 9.06539 990.237 7.66604C990.237 3.34629 994.958 0.425891 1001.95 0.425891C1007.81 0.425891 1011.39 2.25114 1013.23 6.38836L1045.66 72.4015H1046.19L1078.54 6.26668C1080.46 2.12945 1083.69 0.425891 1089.55 0.425891C1096.37 0.425891 1101.09 3.34629 1101.09 7.48351C1101.09 8.88287 1100.65 10.2822 1099.87 11.7424L1061.93 81.7711C1058.78 87.7944 1053.97 90.2889 1045.58 90.2889Z\" fill=\"currentColor\"/> <path d=\"M1157.04 90.2889C1150.13 90.2889 1145.67 87.4902 1145.67 83.0487C1145.67 81.8319 1146.11 80.1283 1147.16 78.2422L1183.79 8.94371C1186.85 3.10292 1191.92 0.425891 1200.14 0.425891C1208.45 0.425891 1213.52 2.98124 1216.66 8.88287L1253.38 78.2422C1254.43 80.25 1254.87 81.6494 1254.87 83.0487C1254.87 87.3076 1250.15 90.2889 1243.59 90.2889C1237.47 90.2889 1234.06 88.3419 1232.05 83.6571L1223.74 66.8649H1176.62L1168.32 83.5355C1166.22 88.2811 1162.9 90.2889 1157.04 90.2889ZM1181.96 54.4532H1218.24L1200.31 16.9748H1199.7L1181.96 54.4532Z\" fill=\"currentColor\"/> <path d=\"M1369.91 90.7148C1338 90.7148 1318.07 77.4513 1318.07 58.2862V8.57866C1318.07 3.40713 1322.36 0.425891 1329.35 0.425891C1336.43 0.425891 1340.63 3.40713 1340.63 8.57866V56.8869C1340.63 68.8726 1351.21 77.0254 1369.91 77.0254C1388.62 77.0254 1399.29 68.8726 1399.29 56.8869V8.57866C1399.29 3.40713 1403.49 0.425891 1410.57 0.425891C1417.56 0.425891 1421.76 3.40713 1421.76 8.57866V58.2862C1421.76 77.4513 1401.91 90.7148 1369.91 90.7148Z\" fill=\"currentColor\"/> <path d=\"M1503.76 89.2546C1496.76 89.2546 1492.48 86.2125 1492.48 81.1018V8.57866C1492.48 3.40713 1496.76 0.425891 1503.76 0.425891C1510.84 0.425891 1515.04 3.40713 1515.04 8.57866V75.9911H1563.38C1569.5 75.9911 1573.7 78.5465 1573.7 82.6228C1573.7 86.6992 1569.59 89.2546 1563.38 89.2546H1503.76Z\" fill=\"currentColor\"/> <path d=\"M1661.56 90.2889C1654.56 90.2889 1650.37 87.3076 1650.37 82.1361V14.7237H1621.52C1615.4 14.7237 1611.2 12.1683 1611.2 8.09193C1611.2 4.01554 1615.31 1.4602 1621.52 1.4602H1701.68C1707.89 1.4602 1712 4.01554 1712 8.09193C1712 12.1683 1707.8 14.7237 1701.68 14.7237H1672.83V82.1361C1672.83 87.3076 1668.64 90.2889 1661.56 90.2889Z\" fill=\"currentColor\"/>"
    + '</svg></span>';
  return el;
}

function firstRun(onPick, onDemo) {
  const root = document.getElementById("root") || document.body;
  root.innerHTML = "";
  const wrap = document.createElement("main");
  wrap.className = "sb-connect";
  const brand = brandLockup();
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
  wrap.append(brand, h, p, b);

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
