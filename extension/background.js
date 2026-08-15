// The clipper's service worker: menus, shortcuts, and the queue → vault pump.
//
// Two rules shape everything here.
//
// **Queue first, write second.** A capture is durable in IndexedDB before any
// attempt to write it. A service worker can be shut down between two lines, a
// vault folder can be on an unplugged disk, and Chrome hands out File System
// Access permission per session — none of which should ever cost the user the
// thing they just clipped.
//
// **A worker has no user gesture**, so it can never call `requestPermission`.
// When the grant has lapsed the clip stays queued and the badge says so; the
// permission is paid for by a click in the popup or the setup page, which then
// flushes everything at once.

import { enqueue, pending, drop, patch, count, settings, logWrite, recent, setMeta, getMeta } from "./store.js";
import { openVault, writeCapture, walls, storedHandle, permission } from "./writer.js";
import { readPageMeta, fetchImageInPage, selectRegion } from "./injected.js";

const WALLS_KEY = "walls";
const iso = () => new Date().toISOString().replace(/\.\d+Z$/, "+00:00");

// ── menus ───────────────────────────────────────────────────────────────────

const MENUS = [
  { id: "clip-page", title: "Clip this page", contexts: ["page", "frame"] },
  { id: "clip-page-wall", title: "Add this page to the wall", contexts: ["page", "frame"] },
  { id: "clip-region", title: "Clip a region…", contexts: ["page", "frame"] },
  { id: "clip-image", title: "Save this image to the wall", contexts: ["image"] },
  { id: "clip-link", title: "Clip this link", contexts: ["link"] },
  { id: "clip-link-wall", title: "Add this link to the wall", contexts: ["link"] },
  { id: "clip-selection", title: "Clip selection", contexts: ["selection"] },
  { id: "clip-selection-wall", title: "Add selection to the wall", contexts: ["selection"] },
];

function buildMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "canon", title: "Canon Clip",
                                 contexts: ["page", "frame", "image", "link", "selection"] });
    for (const m of MENUS) chrome.contextMenus.create({ ...m, parentId: "canon" });
  });
}

chrome.runtime.onInstalled.addListener((details) => {
  buildMenus();
  // First install opens the setup page, because the picker needs a real page
  // and a real click — a popup closes the moment the folder dialog opens.
  if (details.reason === "install") chrome.runtime.openOptionsPage();
});
chrome.runtime.onStartup.addListener(buildMenus);

// ── the badge ───────────────────────────────────────────────────────────────

async function paintBadge(flash = null) {
  if (flash) {
    await chrome.action.setBadgeBackgroundColor({ color: flash === "ok" ? "#16a34a" : "#dc2626" });
    await chrome.action.setBadgeText({ text: flash === "ok" ? "✓" : "!" });
    setTimeout(() => { paintBadge().catch(() => {}); }, 2000);
    return;
  }
  const n = await count();
  await chrome.action.setBadgeBackgroundColor({ color: "#d97706" });
  await chrome.action.setBadgeText({ text: n ? String(n) : "" });
}

// ── capture ─────────────────────────────────────────────────────────────────

/** Ask the page about itself. Fails soft: a clip from a page that refuses
 *  injection still has its URL and its tab title. */
async function tabMeta(tab, imgSrc = null) {
  const fallback = { url: tab.url || "", title: tab.title || "", selection: "", alt: "", og: {} };
  if (!tab.id || !/^https?:/i.test(tab.url || "")) return fallback;
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [0] },
      func: readPageMeta,
      args: [imgSrc],
    });
    return (res && res.result) || fallback;
  } catch {
    return fallback;
  }
}

/** Image bytes, first from the worker, then — for anything hotlink-protected
 *  or cookie-gated — from inside the page itself. */
async function imageBytes(src, tabId) {
  if (/^data:/i.test(src)) {
    const blob = await (await fetch(src)).blob();
    return { blob, mime: blob.type };
  }
  try {
    const r = await fetch(src, { credentials: "omit" });
    if (r.ok) {
      const blob = await r.blob();
      if (blob.size) return { blob, mime: blob.type || r.headers.get("content-type") || "" };
    }
  } catch { /* fall through to the page */ }
  if (!tabId) return { error: "could not fetch that image" };
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId }, func: fetchImageInPage, args: [src],
    });
    const out = res && res.result;
    if (out && out.dataUrl) {
      const blob = await (await fetch(out.dataUrl)).blob();
      return { blob, mime: out.mime || blob.type };
    }
    return { error: (out && out.error) || "could not fetch that image" };
  } catch (e) {
    return { error: String((e && e.message) || e) };
  }
}

/** A screenshot of the visible tab, cropped to `rect` if one is given. */
async function shoot(tab, rect = null) {
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  const full = await (await fetch(dataUrl)).blob();
  if (!rect) return { blob: full, mime: "image/png" };
  const bmp = await createImageBitmap(full);
  // Scale from the viewport width the page reported, not devicePixelRatio:
  // browser zoom moves one and not the other, and a crop that trusts the wrong
  // one is off by a third with no way for the user to tell why.
  const scale = bmp.width / Math.max(1, rect.viewportWidth || bmp.width);
  const x = Math.max(0, Math.round(rect.x * scale));
  const y = Math.max(0, Math.round(rect.y * scale));
  const w = Math.max(1, Math.min(Math.round(rect.w * scale), bmp.width - x));
  const h = Math.max(1, Math.min(Math.round(rect.h * scale), bmp.height - y));
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext("2d").drawImage(bmp, x, y, w, h, 0, 0, w, h);
  bmp.close();
  return { blob: await canvas.convertToBlob({ type: "image/png" }), mime: "image/png" };
}

/**
 * Queue a capture, then try to write it. The return value describes both
 * halves, because "saved" and "queued until you unlock the folder" are
 * genuinely different outcomes and the UI says which.
 */
async function save(capture) {
  const rec = await enqueue(capture);
  await paintBadge();
  const s = await settings();
  if (!s.autoSave) return { queued: rec.id, ok: true, wrote: 0, failed: 0, left: await count() };
  const out = await flush();
  if (out.wrote) await paintBadge("ok");
  else if (out.failed) await paintBadge("bad");
  return { queued: rec.id, ...out };
}

// ── the pump ────────────────────────────────────────────────────────────────

let flushing = null;

/** Write everything queued, oldest first. Never requests permission — see the
 *  file header — so it is safe to call from any event. */
export async function flush() {
  if (flushing) return flushing;
  flushing = (async () => {
    const q = await pending();
    if (!q.length) return { ok: true, wrote: 0, failed: 0, left: 0 };
    const ctx = await openVault();
    if (!ctx.ok) return { ok: false, reason: ctx.reason, message: ctx.message, left: q.length };

    // Cache the wall list while the vault is open, so the popup can offer real
    // names without paying for an index rebuild every time it opens.
    await setMeta(WALLS_KEY, walls(ctx));

    const s = await settings();
    let wrote = 0, failed = 0;
    for (const rec of q) {
      try {
        const r = await writeCapture(ctx, rec, {
          settings: s,
          onAsset: (assetPath) => patch(rec.id, { assetPath }),
        });
        if (r.ok) {
          await logWrite({ path: r.path, wall: r.wall, title: r.title || rec.title,
                           type: rec.type, skipped: r.skipped || null });
          await drop(rec.id);
          wrote++;
        } else {
          await patch(rec.id, { error: r.message || r.reason });
          failed++;
        }
      } catch (e) {
        await patch(rec.id, { error: String((e && e.message) || e) });
        failed++;
      }
    }
    await paintBadge();
    return { ok: true, wrote, failed, left: await count(), vault: ctx.name };
  })();
  try { return await flushing; } finally { flushing = null; }
}

// ── the actions the UI and the menus share ──────────────────────────────────

// `fields` is what the popup had on screen — caption, tags, wall. A clip from
// the context menu simply has none, which is why every one of these takes it
// last and defaults it away.

async function clipPage(tab, target, fields = {}) {
  const m = await tabMeta(tab);
  return save({
    type: "page", target, url: m.url || tab.url, pageUrl: m.url || tab.url,
    title: m.title || tab.title || "", og: m.og || {}, capturedAt: iso(), ...fields,
  });
}

async function clipLink(tab, url, target, fields = {}) {
  const m = await tabMeta(tab);
  return save({
    // No title on purpose: a link picked out of a context menu has no name
    // anyone chose, and clip.js names it from the url better than `title: url`
    // would — that filename would be the whole href, slashes and all.
    type: "link", target, url, pageUrl: m.url || tab.url,
    title: "", og: {}, capturedAt: iso(), ...fields,
  });
}

async function clipSelection(tab, text, target, fields = {}) {
  const m = await tabMeta(tab);
  const said = text || m.selection || "";
  return save({
    type: "selection", target, url: m.url || tab.url, pageUrl: m.url || tab.url,
    title: m.title || tab.title || "", text: said, caption: said,
    og: m.og || {}, capturedAt: iso(), ...fields,
  });
}

async function clipImage(tab, src, fields = {}) {
  const m = await tabMeta(tab, src);
  const got = await imageBytes(src, tab.id);
  if (got.error) { await paintBadge("bad"); return { ok: false, reason: got.error }; }
  return save({
    type: "image", target: "wall", src, mime: got.mime, blob: got.blob,
    url: m.url || tab.url, pageUrl: m.url || tab.url,
    title: m.title || tab.title || "", alt: m.alt || "", capturedAt: iso(), ...fields,
  });
}

async function clipShot(tab, { region = false } = {}, fields = {}) {
  let rect = null;
  if (region) {
    if (!/^https?:/i.test(tab.url || "")) return { ok: false, reason: "that page cannot be clipped" };
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [0] }, func: selectRegion,
    });
    rect = res && res.result;
    if (!rect) return { ok: false, reason: "cancelled" };
  }
  const shot = await shoot(tab, rect);
  const m = await tabMeta(tab);
  return save({
    type: "screenshot", target: "wall", mime: shot.mime, blob: shot.blob,
    src: null, url: m.url || tab.url, pageUrl: m.url || tab.url,
    title: m.title || tab.title || "", capturedAt: iso(), ...fields,
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab) return;
  try {
    if (info.menuItemId === "clip-page") await clipPage(tab);
    else if (info.menuItemId === "clip-page-wall") await clipPage(tab, "wall");
    else if (info.menuItemId === "clip-region") await clipShot(tab, { region: true });
    else if (info.menuItemId === "clip-image") await clipImage(tab, info.srcUrl);
    else if (info.menuItemId === "clip-link") await clipLink(tab, info.linkUrl);
    else if (info.menuItemId === "clip-link-wall") await clipLink(tab, info.linkUrl, "wall");
    else if (info.menuItemId === "clip-selection") await clipSelection(tab, info.selectionText);
    else if (info.menuItemId === "clip-selection-wall") await clipSelection(tab, info.selectionText, "wall");
  } catch (e) {
    await paintBadge("bad");
    console.error("Canon Clip:", e);
  }
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (!tab) return;
  if (command === "clip-page") await clipPage(tab);
  if (command === "clip-region") await clipShot(tab, { region: true });
});

// ── what the popup and the setup page ask for ───────────────────────────────

async function state() {
  const handle = await storedHandle();
  return {
    vault: {
      name: handle ? handle.name : null,
      permission: await permission(handle),
    },
    settings: await settings(),
    pending: (await pending()).map((r) => ({
      id: r.id, type: r.type, title: r.title, url: r.url,
      target: r.target || null, error: r.error || null, queuedAt: r.queuedAt,
    })),
    walls: (await getMeta(WALLS_KEY)) || [],
    recent: await recent(),
  };
}

const HANDLERS = {
  state,
  flush: () => flush(),
  clipPage: ({ tab, target, fields }) => clipPage(tab, target, fields),
  clipLink: ({ tab, url, target, fields }) => clipLink(tab, url, target, fields),
  clipSelection: ({ tab, text, target, fields }) => clipSelection(tab, text, target, fields),
  clipImage: ({ tab, src, fields }) => clipImage(tab, src, fields),
  clipShot: ({ tab, region, fields }) => clipShot(tab, { region }, fields),
  meta: ({ tab }) => tabMeta(tab),
  dropOne: async ({ id }) => { await drop(id); await paintBadge(); return { ok: true }; },
  refreshWalls: async () => {
    const ctx = await openVault();
    if (!ctx.ok) return { ok: false, reason: ctx.reason };
    const list = walls(ctx);
    await setMeta(WALLS_KEY, list);
    return { ok: true, walls: list };
  },
  badge: () => paintBadge(),
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const fn = HANDLERS[msg && msg.type];
  if (!fn) return false;
  Promise.resolve(fn(msg))
    .then((r) => sendResponse(r ?? { ok: true }))
    .catch((e) => sendResponse({ ok: false, reason: String((e && e.message) || e) }));
  return true;                     // the response is async
});

paintBadge().catch(() => {});
