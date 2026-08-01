// Tasks 9.2 / 9.3 / 9.9: the inspo grid over the whole vault, and a thumbnail
// cache that never touches the vault and stays under a declared cap.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Vault, MemoryBackend } from "../vault/vault.js";
import { listImages, filterImages, isImagePath, ThumbCache, memoryThumbStore } from "../vault/images.js";
import { serialize } from "../vault/mdfile.js";

const TS = (d) => `2026-07-${String(d).padStart(2, "0")}T12:00:00+00:00`;
const pg = (id, title, kind, tags, body) =>
  serialize({ id, kind, title, created: TS(1), updated: TS(20), tags }, body);

async function vaultWithImages() {
  const be = new MemoryBackend({
    // 9.2: images in three different places, only one of them attachments/
    "notes/Lantern Notes.md": pg("01AAAAAAAAAAAAAAAAAAAAAAAA", "Lantern Notes", "note",
      ["cartography"], "Inline: ![[loose-in-notes.png]]"),
    "topics/sub/Deep Topic.md": pg("01BBBBBBBBBBBBBBBBBBBBBBBB", "Deep Topic", "topic",
      ["bookbinding"], "Nested: ![[nested.jpg]]"),
    "canvas/Board.md": pg("01CCCCCCCCCCCCCCCCCCCCCCCC", "Board", "canvas", [], "![[Board.canvas]]"),
    "canvas/Board.canvas": '{"nodes":[],"edges":[]}',
  });
  await be.writeBytes("notes/loose-in-notes.png", new Uint8Array([1, 2, 3]));
  await be.writeBytes("topics/sub/nested.jpg", new Uint8Array([4, 5, 6]));
  await be.writeBytes("attachments/in-attachments.webp", new Uint8Array([7, 8, 9]));
  await be.writeBytes("attachments/a-document.pdf", new Uint8Array([10]));
  await be.writeBytes(".trash/deleted.png", new Uint8Array([11]));
  const v = new Vault(be);
  await v.buildIndex();
  return v;
}

test("9.2 the grid covers the whole vault, not just attachments/", async () => {
  const v = await vaultWithImages();
  const images = listImages(await v.be.listAll(), v.list());
  const names = images.map((i) => i.name).sort();
  assert.deepEqual(names, ["in-attachments.webp", "loose-in-notes.png", "nested.jpg"]);
  assert.equal(images.length, 3, "3 of 3 — notes/, topics/sub/ and attachments/");
});

test("9.2 a .pdf appears zero times", async () => {
  const v = await vaultWithImages();
  const images = listImages(await v.be.listAll(), v.list());
  assert.equal(images.filter((i) => i.name.endsWith(".pdf")).length, 0);
  assert.ok(!isImagePath("a-document.pdf"));
});

test("images inside the ignore list are not shown", async () => {
  const v = await vaultWithImages();
  const images = listImages(await v.be.listAll(), v.list());
  assert.equal(images.filter((i) => i.path.startsWith(".trash")).length, 0);
});

test("9.2 the containing-page filter resolves each image to its page", async () => {
  const v = await vaultWithImages();
  const images = listImages(await v.be.listAll(), v.list());
  const loose = images.find((i) => i.name === "loose-in-notes.png");
  const nested = images.find((i) => i.name === "nested.jpg");
  const orphan = images.find((i) => i.name === "in-attachments.webp");
  assert.deepEqual(loose.pages.map((p) => p.title), ["Lantern Notes"]);
  assert.deepEqual(nested.pages.map((p) => p.title), ["Deep Topic"]);
  assert.deepEqual(orphan.pages, [], "an image nothing embeds has no containing page");
  assert.deepEqual(loose.tags, ["cartography"]);

  assert.equal(filterImages(images, { pageId: "01AAAAAAAAAAAAAAAAAAAAAAAA" }).length, 1);
  assert.equal(filterImages(images, { tag: "bookbinding" })[0].name, "nested.jpg");
  assert.equal(filterImages(images, { kind: "topic" })[0].name, "nested.jpg");
});

// ── 9.3 / 9.9: the cache ────────────────────────────────────────────────────

test("9.3 caching thumbnails writes nothing into the vault", async () => {
  const v = await vaultWithImages();
  const before = new Set(v.be.files.keys());
  const cache = await new ThumbCache(memoryThumbStore()).init();
  for (const im of listImages(await v.be.listAll(), v.list())) {
    await cache.put(im.path, im.mtime, "thumb-bytes", 1000);
  }
  assert.deepEqual([...v.be.files.keys()].sort(), [...before].sort(),
    "no new file may appear in the vault");
});

test("9.3 a second pass is served from cache, not recomputed", async () => {
  const cache = await new ThumbCache(memoryThumbStore()).init();
  const items = Array.from({ length: 200 }, (_, i) => ({ path: `a/${i}.png`, mtime: i }));
  let computed = 0;
  const load = async (im) => {
    const hit = await cache.get(im.path, im.mtime);
    if (hit) return hit;
    computed++;
    const blob = `thumb-${im.path}`;
    await cache.put(im.path, im.mtime, blob, 2000);
    return blob;
  };
  for (const im of items) await load(im);
  assert.equal(computed, 200, "first pass computes every thumbnail");
  computed = 0;
  for (const im of items) await load(im);
  assert.equal(computed, 0, "second pass computes none — every one is a cache hit");
  assert.equal(cache.hits, 200);
});

test("a changed file invalidates its thumbnail", async () => {
  const cache = await new ThumbCache(memoryThumbStore()).init();
  await cache.put("a.png", 1, "old", 10);
  assert.equal(await cache.get("a.png", 1), "old");
  assert.equal(await cache.get("a.png", 2), null, "a newer mtime must miss");
});

test("9.9 the store stays under its declared cap after 500 images", async () => {
  const store = memoryThumbStore();
  const cache = await new ThumbCache(store, { capBytes: 100_000 }).init();
  for (let i = 0; i < 500; i++) await cache.put(`img-${i}.png`, i, `t${i}`, 1000);
  assert.ok(store._bytes <= 100_000, `store holds ${store._bytes}B, cap is 100,000B`);
  assert.ok(store._size < 500, "eviction must have happened");
});

test("9.9 eviction is least-recently-used, not arbitrary", async () => {
  const store = memoryThumbStore();
  const cache = await new ThumbCache(store, { capBytes: 3000 }).init();
  await cache.put("a", 1, "A", 1000);
  await cache.put("b", 1, "B", 1000);
  await cache.put("c", 1, "C", 1000);
  await cache.get("a", 1);                 // touch a, making b the oldest
  await cache.put("d", 1, "D", 1000);      // pushes over the cap
  assert.ok(await store.get("a"), "recently used must survive");
  assert.ok(await store.get("d"), "the newest must survive");
  assert.equal(await store.get("b"), null, "the least recently used goes first");
});

test("9.9 a QuotaExceededError degrades the cache but leaves the grid working", async () => {
  const store = memoryThumbStore({ failAfterBytes: 2500 });
  const cache = await new ThumbCache(store).init();
  const results = [];
  for (let i = 0; i < 5; i++) results.push(await cache.put(`q${i}`, i, "t", 1000));
  assert.deepEqual(results, [true, true, false, false, false],
    "it stops caching rather than throwing");
  assert.equal(cache.degraded, true);
  // and reads still work for whatever did land
  assert.equal(await cache.get("q0", 0), "t");
});

test("9.2 images() on a Data instance returns the whole-vault grid", async () => {
  const { Data } = await import("../vault/data.js");
  const v = await vaultWithImages();
  const d = new Data(v);
  const all = await d.images();
  assert.equal(all.count, 3);
  const filtered = await d.images({ tag: "cartography" });
  assert.equal(filtered.items.length, 1);
  assert.equal(filtered.items[0].name, "loose-in-notes.png");
});

test("9.9 a cached second pass is far faster — measured, not asserted in the abstract", async () => {
  // The "expensive" step is the real Lanczos resample from dhash.js, not a
  // sleep, so the speedup reflects actual avoided work.
  const { dhashFromGrey } = await import("../vault/dhash.js");
  const cache = new ThumbCache(memoryThumbStore(), { capBytes: 50_000_000 });
  await cache.init();

  const N = 200;
  const src = new Uint8ClampedArray(256 * 256);
  for (let i = 0; i < src.length; i++) src[i] = (i * 31) % 256;

  const thumbnail = (i) => {
    // real work: resample a 256x256 plane, as generating a thumbnail would
    const h = dhashFromGrey(src, 256, 256);
    return `${h}-${i}`;
  };
  const load = async (i) => {
    const hit = await cache.get(`g/${i}.png`, i);
    if (hit) return hit;
    const t = thumbnail(i);
    await cache.put(`g/${i}.png`, i, t, 2048);
    return t;
  };

  let t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i++) await load(i);
  const cold = Number(process.hrtime.bigint() - t0) / 1e6;

  t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i++) await load(i);
  const warm = Number(process.hrtime.bigint() - t0) / 1e6;

  console.log(`      ${N} thumbnails · cold ${cold.toFixed(1)}ms · warm ${warm.toFixed(1)}ms · ${(cold / warm).toFixed(1)}x`);
  assert.equal(cache.hits, N, "the second pass must be all hits");
  assert.ok(cold / warm >= 5,
    `expected the cached pass to be >=5x faster, got ${(cold / warm).toFixed(1)}x`);
});
