// The clipper's rules, exercised without a browser.
//
// Two things are being defended here. The first is the round trip: whatever a
// web page calls itself, an item written from it must parse back as ONE item
// with the same caption — a page that titles itself `## Attachments` does not
// get to grow a section in someone's vault. The second is that a clip is an
// ordinary vault write: same serializer, same history, same conflict gate.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  addItemToWall, applyCapture, attachmentName, canonicalUrl, captureToBookmark,
  captureToItem, captureToQuote, clipFrontmatter, itemKey, normalizeTags,
  safeCaption, safeStem, safeUrl, targetFor, wallPath,
} from "../vault/clip.js";
import { parseInspoBody } from "../vault/inspo.js";
import { parse } from "../vault/mdfile.js";
import { MemoryBackend, Vault } from "../vault/vault.js";
import { Data } from "../vault/data.js";

// ── the untrusted half ──────────────────────────────────────────────────────

test("only http(s) urls survive", () => {
  assert.equal(safeUrl("https://example.com/a"), "https://example.com/a");
  assert.equal(safeUrl("http://example.com"), "http://example.com/");
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd",
                     "chrome://settings", "", null, undefined, "example.com"]) {
    assert.equal(safeUrl(bad), null, `${bad} must not be stored`);
  }
});

test("canonicalUrl ignores tracking noise, not identity", () => {
  assert.equal(
    canonicalUrl("https://www.Example.com/a/?utm_source=x&id=7#frag"),
    canonicalUrl("https://example.com/a?id=7"));
  assert.notEqual(canonicalUrl("https://example.com/a"), canonicalUrl("https://example.com/b"));
});

test("a caption is one line, whatever the page said", () => {
  const cap = safeCaption("Two\n\nparagraphs\tand   spaces");
  assert.equal(cap, "Two paragraphs and spaces");
  assert.ok(!cap.includes("\n"));
});

test("a caption cannot forge a heading, a tag line or an embed", () => {
  assert.equal(safeCaption("## Attachments"), "\\## Attachments");
  assert.equal(safeCaption("#ui #gradient"), "\\#ui #gradient");
  assert.equal(safeCaption("![[secret.png]]"), "\\![[secret.png]]");
  assert.equal(safeCaption("https://evil.example/x"), "<https://evil.example/x>");
});

test("tags are normalised, deduped and capped", () => {
  assert.deepEqual(normalizeTags(["#UI", "ui", "Nav Bar", "  ", "#a/b"]),
                   ["ui", "nav", "bar", "a/b"]);
  assert.deepEqual(normalizeTags("#one #two"), ["one", "two"]);
  assert.equal(normalizeTags(Array.from({ length: 40 }, (_, i) => `t${i}`)).length, 12);
});

test("a stem is a filename, and a title that is only punctuation has none", () => {
  assert.equal(safeStem('a/b:c*d?e"f<g>h|i'), "a b c d e f g h i");
  assert.equal(safeStem("...leading dots"), "leading dots");
  assert.equal(safeStem("/\\:*?"), "");
  assert.equal(wallPath("///"), null);
  assert.equal(wallPath("Interface Inspiration"), "inspo/Interface Inspiration.md");
});

test("the attachment extension comes from the MIME type, not the url", () => {
  assert.equal(
    attachmentName({ src: "https://x.test/img/hero.php?w=9", mime: "image/webp",
                     capturedAt: "2026-08-15T10:00:00+00:00" }),
    "hero 2026-08-15.webp");
  // No usable name anywhere: still a file, never an empty one.
  assert.match(attachmentName({ mime: "image/png" }), /^clip\.png$/);
});

test("clipFrontmatter drops anything the convention does not know", () => {
  const fm = clipFrontmatter({
    url: "https://x.test", og_image: "https://x.test/a.png", og_title: "",
    kind: "note", id: "01J", title: "no", evil: "<script>",
  });
  assert.deepEqual(fm, { url: "https://x.test", og_image: "https://x.test/a.png" });
});

// ── items ───────────────────────────────────────────────────────────────────

test("an item needs an image or a link", () => {
  assert.equal(captureToItem({ title: "just words" }), null);
  assert.ok(captureToItem({ url: "https://x.test" }));
  assert.ok(captureToItem({ }, "attachments/a.png"));
});

test("a hostile capture round-trips as exactly one item", () => {
  const item = captureToItem({
    title: "## Thread\n\n![[../../etc/passwd]]\n#not-a-tag",
    url: "https://x.test/a",
    tags: ["#UI"],
  }, "attachments/shot.png");
  const { body } = addItemToWall("", item);
  const back = parseInspoBody(body);
  const items = back.groups.flatMap((g) => g.items);
  assert.equal(items.length, 1, "one capture is one card");
  assert.equal(back.groups.length, 1, "no group was forged");
  assert.equal(items[0].image, "attachments/shot.png");
  assert.equal(items[0].url, "https://x.test/a");
  assert.deepEqual(items[0].tags, ["ui"]);
  assert.ok(items[0].caption.includes("Thread"));
});

test("newest first, and a named group is created on demand", () => {
  let body = "";
  ({ body } = addItemToWall(body, captureToItem({ url: "https://a.test" })));
  ({ body } = addItemToWall(body, captureToItem({ url: "https://b.test" }), { group: "Nav" }));
  ({ body } = addItemToWall(body, captureToItem({ url: "https://c.test" }), { group: "Nav" }));
  const model = parseInspoBody(body);
  assert.deepEqual(model.groups.map((g) => g.name), ["", "Nav"]);
  assert.deepEqual(model.groups[1].items.map((i) => i.url),
                   ["https://c.test/", "https://b.test/"]);
});

test("the same reference twice is refused, tracking parameters and all", () => {
  const first = addItemToWall("", captureToItem({ url: "https://x.test/a" }));
  const again = addItemToWall(first.body, captureToItem({ url: "https://www.x.test/a?utm_source=n" }));
  assert.equal(again.added, false);
  assert.equal(again.reason, "duplicate");
  assert.equal(parseInspoBody(again.body).groups[0].items.length, 1);
  // …and turning dedupe off is honoured, because a wall of near-duplicates is
  // a legitimate thing to want.
  const forced = addItemToWall(first.body, captureToItem({ url: "https://x.test/a" }),
                               { dedupe: false });
  assert.equal(forced.added, true);
});

test("itemKey prefers the image, then the link", () => {
  assert.equal(itemKey({ image: "attachments/A.png" }), "image:attachments/a.png");
  assert.equal(itemKey({ url: "https://x.test/a/" }), "url:x.test/a");
});

// ── pages ───────────────────────────────────────────────────────────────────

test("a bookmark carries the og_* keys that make it a card", () => {
  const b = captureToBookmark({
    url: "https://x.test/piece?utm_medium=rss",
    title: "A piece",
    og: { image: "https://x.test/card.png", description: "Long\ndescription", siteName: "X" },
    capturedAt: "2026-08-15T10:00:00+00:00",
  });
  assert.equal(b.kind, "bookmark");
  assert.equal(b.frontmatter.url, "https://x.test/piece?utm_medium=rss");   // stored as found
  assert.equal(b.frontmatter.og_image, "https://x.test/card.png");
  assert.equal(b.frontmatter.og_description, "Long description");
  assert.equal(b.frontmatter.captured, "2026-08-15T10:00:00+00:00");
});

test("a bookmark with a poisoned og:image keeps the page and drops the image", () => {
  const b = captureToBookmark({ url: "https://x.test", og: { image: "javascript:alert(1)" } });
  assert.equal(b.frontmatter.url, "https://x.test/");
  assert.ok(!("og_image" in b.frontmatter));
});

test("an unnamed link is named from its url, not by its href", () => {
  const b = captureToBookmark({ url: "https://www.stripe.com/docs/getting-started/" });
  assert.equal(b.title, "getting started — stripe.com");
  assert.equal(safeStem(b.title), "getting started — stripe.com");
  assert.equal(captureToBookmark({ url: "https://stripe.com" }).title, "stripe.com");
});

test("a selection becomes a quotation, not a paraphrase", () => {
  const q = captureToQuote({ text: "Taste is a moat.\nIt compounds.", title: "Essay" });
  assert.equal(q.kind, "note");
  assert.equal(q.body, "> Taste is a moat.\n> It compounds.");
  assert.equal(captureToQuote({ text: "  " }), null);
});

test("targetFor: bytes go to the wall, a bare selection becomes a quote", () => {
  assert.equal(targetFor({ blob: {} }, {}), "wall");
  assert.equal(targetFor({ type: "selection", text: "x" }, {}), "quote");
  assert.equal(targetFor({ type: "page", url: "https://x.test" }, {}), "bookmark");
  assert.equal(targetFor({ type: "page", url: "https://x.test" }, { linkTarget: "wall" }), "wall");
  assert.equal(targetFor({ target: "bookmark", blob: {} }, {}), "bookmark");
});

// ── the whole write, against a real vault ───────────────────────────────────

function stand(files = {}) {
  const be = new MemoryBackend(files);
  const vault = new Vault(be);
  return { be, vault, data: new Data(vault) };
}

const blobOf = (text) => new Blob([text], { type: "image/png" });

test("the first image clip creates the wall, the attachment and the card", async () => {
  const { be, vault, data } = stand();
  await vault.buildIndex();
  const r = await applyCapture(data, vault, {
    type: "image", blob: blobOf("PNG"), mime: "image/png",
    src: "https://x.test/shots/nav.png", url: "https://x.test/page",
    title: "Someone's nav", capturedAt: "2026-08-15T10:00:00+00:00",
  }, { settings: { wall: "Interface Inspiration" } });

  assert.equal(r.ok, true);
  assert.equal(r.path, "inspo/Interface Inspiration.md");
  assert.equal(r.assetPath, "attachments/nav 2026-08-15.png");
  assert.equal(await be.readText("attachments/nav 2026-08-15.png"), "PNG");

  const [fm, body] = parse(await be.readText("inspo/Interface Inspiration.md"));
  assert.equal(fm.kind, "inspo");
  assert.match(fm.id, /^[0-9A-HJKMNP-TV-Z]{26}$/);            // a real ULID
  const items = parseInspoBody(body).groups.flatMap((g) => g.items);
  assert.equal(items.length, 1);
  assert.equal(items[0].image, "attachments/nav 2026-08-15.png");
  assert.equal(items[0].caption, "Someone's nav");
  assert.equal(items[0].url, "https://x.test/page");
});

test("a second clip lands on the same wall and snapshots the first", async () => {
  const { be, vault, data } = stand();
  await vault.buildIndex();
  const opts = { settings: { wall: "Wall" } };
  await applyCapture(data, vault, { url: "https://a.test", target: "wall" }, opts);
  await applyCapture(data, vault, { url: "https://b.test", target: "wall" }, opts);

  const [, body] = parse(await be.readText("inspo/Wall.md"));
  assert.equal(parseInspoBody(body).groups[0].items.length, 2);
  // Straight from the backend's map: listAll() hides dot directories, which is
  // the whole point of them.
  const history = [...be.files.keys()].filter((p) => p.startsWith(".history/"));
  assert.equal(history.length, 1, "the overwrite was snapshotted, the create was not");
});

test("a page clip is a note with a url — what the convention calls a bookmark", async () => {
  const { be, vault, data } = stand();
  await vault.buildIndex();
  const r = await applyCapture(data, vault, {
    type: "page", url: "https://x.test/piece", title: "A piece",
    og: { image: "https://x.test/c.png", title: "A piece" },
    tags: ["#ui"],
  }, { settings: { linkTarget: "bookmark" } });

  assert.equal(r.ok, true);
  assert.equal(r.path, "notes/A piece.md");
  const [fm] = parse(await be.readText("notes/A piece.md"));
  assert.equal(fm.kind, "note");
  assert.equal(fm.url, "https://x.test/piece");
  assert.equal(fm.og_image, "https://x.test/c.png");
  assert.deepEqual(fm.tags, ["ui"]);
});

test("clipping a link the vault already holds writes nothing", async () => {
  const { be, vault, data } = stand();
  await vault.buildIndex();
  const cap = { type: "page", url: "https://x.test/piece", title: "A piece" };
  await applyCapture(data, vault, cap, {});
  const before = (await be.listAll()).length;
  const again = await applyCapture(data, vault, { ...cap, url: "https://x.test/piece?utm_source=x" }, {});
  assert.equal(again.ok, true);
  assert.equal(again.skipped, "duplicate");
  assert.equal((await be.listAll()).length, before, "no file, no history, no second note");
});

test("a wall the user renamed by hand is found by title, not by filename", async () => {
  const { vault, data } = stand();
  await vault.buildIndex();
  await data.createPage({ kind: "inspo", title: "Interface Inspiration" });
  await vault.rename([...vault.index.values()][0].id, "inspo/Refs.md");
  await vault.buildIndex();
  const r = await applyCapture(data, vault, { url: "https://x.test", target: "wall" },
                               { settings: { wall: "Interface Inspiration" } });
  assert.equal(r.ok, true);
  assert.equal(r.path, "inspo/Refs.md", "the existing wall was used, not a second one");
});

test("a clip never overwrites a page that changed on disk", async () => {
  const { be, vault, data } = stand();
  await vault.buildIndex();
  const opts = { settings: { wall: "Wall" } };
  await applyCapture(data, vault, { url: "https://a.test", target: "wall" }, opts);

  // Obsidian edits the same wall while the clipper is not looking.
  const path = "inspo/Wall.md";
  await be.writeText(path, `${await be.readText(path)}\n\nsomeone else's line\n`);

  const r = await applyCapture(data, vault, { url: "https://b.test", target: "wall" }, opts);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "conflict");
  assert.match(await be.readText(path), /someone else's line/);
});

test("bytes are written once, even when the page write has to be retried", async () => {
  const { be, vault, data } = stand();
  await vault.buildIndex();
  const seen = [];
  const capture = {
    type: "image", blob: blobOf("PNG"), mime: "image/png", src: "https://x.test/a.png",
    url: "https://x.test", target: "wall", wall: "Wall",
  };
  await applyCapture(data, vault, capture, { onAsset: (p) => seen.push(p) });
  await be.writeText("inspo/Wall.md", `${await be.readText("inspo/Wall.md")}\n\nedited\n`);
  const failed = await applyCapture(data, vault, { ...capture, url: "https://y.test" }, {
    onAsset: (p) => seen.push(p),
  });
  assert.equal(failed.ok, false);

  // The retry carries the asset path the failed attempt reported.
  await vault.buildIndex();
  const retried = await applyCapture(data, vault,
    { ...capture, url: "https://y.test", assetPath: failed.assetPath }, {});
  assert.equal(retried.ok, true);
  const pngs = (await be.listAll()).filter((f) => f.path.endsWith(".png"));
  assert.equal(pngs.length, 2, "one file per clip, not one per attempt");
  assert.equal(seen.length, 2);
});
