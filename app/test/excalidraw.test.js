// The `.excalidraw.md` interop contract. If these pass, the Obsidian Excalidraw
// plugin opens what we write and we open what it wrote.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseExcalidraw, serializeExcalidraw, compressScene, decompressScene,
  textElementsOf, isExcalidrawPath, textOfExcalidraw, cleanScene, BLANK_SCENE,
} from "../vault/excalidraw.js";
import { Vault, MemoryBackend } from "../vault/vault.js";
import { Data } from "../vault/data.js";

const SCENE = {
  type: "excalidraw",
  version: 2,
  source: "https://github.com/zsviczian/obsidian-excalidraw-plugin/releases",
  elements: [
    {
      id: "abc123", type: "text", x: 10, y: 20, width: 100, height: 25,
      text: "quire structures", rawText: "quire structures",
      originalText: "quire structures", isDeleted: false,
    },
    { id: "rect1", type: "rectangle", x: 0, y: 0, width: 50, height: 50 },
  ],
  appState: { gridSize: null, viewBackgroundColor: "#ffffff" },
  files: {},
};

test("a path is Excalidraw only with the double extension", () => {
  assert.equal(isExcalidrawPath("canvas/Board.excalidraw.md"), true);
  assert.equal(isExcalidrawPath("notes/Ordinary.md"), false);
  assert.equal(isExcalidrawPath("canvas/Board.canvas"), false);
  assert.equal(isExcalidrawPath(""), false);
});

// ── Compression ──────────────────────────────────────────────────────────
// Deterministic pseudo-random text: a run of one repeated character compresses
// to well under one chunk, which would make the chunking assertion vacuous.
function noisy(n) {
  const alpha = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "", seed = 7;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    s += alpha[seed % alpha.length];
  }
  return s;
}

test("compression matches the plugin: 256-char chunks, blank line between", () => {
  const big = JSON.stringify({ pad: noisy(6000) });
  const packed = compressScene(big);
  const lines = packed.split("\n\n");
  assert.ok(lines.length > 1, "a large scene must be chunked, not one long line");
  for (const l of lines.slice(0, -1)) {
    assert.equal(l.length, 256, `chunk was ${l.length} chars, not 256`);
  }
  assert.ok(lines[lines.length - 1].length <= 256);
  assert.equal(packed, packed.trim(), "the plugin trims the result");
});

test("decompression strips the chunk newlines before decoding", () => {
  const json = JSON.stringify(SCENE);
  const packed = compressScene(json);
  assert.equal(decompressScene(packed), json);
  // Newlines are formatting: re-wrapping differently must not change the result.
  assert.equal(decompressScene(packed.replace(/\n\n/g, "\n")), json);
  assert.equal(decompressScene(packed.replace(/\n/g, "\r\n")), json);
});

test("undecodable data returns null rather than throwing", () => {
  assert.equal(decompressScene(""), null);
  assert.equal(decompressScene(null), null);
});

// ── Round trip ───────────────────────────────────────────────────────────
test("serialize → parse returns the same scene", () => {
  const p = parseExcalidraw(serializeExcalidraw(SCENE));
  assert.equal(p.error, null);
  assert.deepEqual(p.scene, SCENE);
  assert.equal(p.compressed, true);
});

test("the uncompressed form round-trips too, and is readable in the file", () => {
  const md = serializeExcalidraw(SCENE, { compressed: false });
  assert.match(md, /```json\n/);
  assert.ok(md.includes('"quire structures"'), "parsed mode must stay legible");
  const p = parseExcalidraw(md);
  assert.deepEqual(p.scene, SCENE);
  assert.equal(p.compressed, false);
});

test("we can read a compressed file even though we default to writing one", () => {
  // Both fence languages must parse — a vault holds files from either setting.
  const asJson = parseExcalidraw(serializeExcalidraw(SCENE, { compressed: false }));
  const asPacked = parseExcalidraw(serializeExcalidraw(SCENE, { compressed: true }));
  assert.deepEqual(asJson.scene, asPacked.scene);
});

// ── The drawing, legible in the markdown ─────────────────────────────────
// A link or an image added inside the editor used to live only in the base64:
// Obsidian could not see it, the backlink graph could not see it, and an agent
// reading the file could not see it. All three index sections are regenerated
// from the scene now, so the markdown describes what the drawing contains.
const LINKED = {
  ...SCENE,
  elements: [
    ...SCENE.elements,
    { id: "box1", type: "rectangle", x: 0, y: 0, link: "[[Quire Structures]]" },
    { id: "box2", type: "rectangle", x: 0, y: 0, link: "https://example.com/folding" },
    { id: "gone", type: "rectangle", x: 0, y: 0, link: "[[Deleted]]", isDeleted: true },
    { id: "plain", type: "rectangle", x: 0, y: 0 },
  ],
};

test("a link drawn on a shape is written out as a wikilink", () => {
  const md = serializeExcalidraw(LINKED);
  assert.match(md, /^box1: \[\[Quire Structures\]\]$/m);
  assert.match(md, /^box2: https:\/\/example\.com\/folding$/m, "a URL is a link too");
  assert.ok(!md.includes("gone:"), "a deleted shape's link is not a link");
  assert.ok(!md.includes("plain:"), "a shape with no link contributes nothing");
});

test("element links are derived from the scene, never passed through stale", () => {
  // The old serializer took these as an argument, so a link added in this app
  // never reached the markdown and a link deleted in it never left.
  const md = serializeExcalidraw(LINKED, {
    elementLinks: [{ key: "ghost", value: "[[Removed Long Ago]]" }],
  });
  assert.ok(!md.includes("ghost"), "the scene is the truth, not the caller");
  assert.match(md, /^box1: \[\[Quire Structures\]\]$/m);
});

test("links survive the round trip and reach the mention scanner", () => {
  const p = parseExcalidraw(serializeExcalidraw(LINKED));
  assert.deepEqual(p.elementLinks.find((l) => l.key === "box1"),
    { key: "box1", value: "[[Quire Structures]]" });
});

test("an embedded image is named by the vault file it was written to", () => {
  const withImage = {
    ...SCENE,
    elements: [...SCENE.elements, { id: "img1", type: "image", fileId: "f00" }],
    files: { f00: { id: "f00", mimeType: "image/png", dataURL: "data:image/png;base64,AAAA" } },
  };
  const md = serializeExcalidraw(withImage, {
    embeddedFiles: new Map([["f00", "attachments/Sewing Order.png"]]),
  });
  assert.match(md, /^f00: \[\[attachments\/Sewing Order\.png\]\]$/m);
  const p = parseExcalidraw(md);
  assert.equal(p.embeddedFiles[0].value, "[[attachments/Sewing Order.png]]");
});

test("an image with nowhere in the vault is left out, not guessed at", () => {
  const withImage = {
    ...SCENE,
    files: { f00: { id: "f00", mimeType: "image/png", dataURL: "data:image/png;base64,AAAA" } },
  };
  assert.ok(!serializeExcalidraw(withImage).includes("Embedded Files"),
    "a broken wikilink is worse than no wikilink");
});

test("an entry for an image no longer in the drawing is dropped", () => {
  const md = serializeExcalidraw(SCENE, {
    embeddedFiles: [{ key: "f00", value: "[[attachments/deleted.png]]" }],
  });
  assert.ok(!md.includes("deleted.png"), "the index cannot outlive what it indexes");
});

test("a path already wrapped is not wrapped twice on the way back out", () => {
  // The parse hands back `[[path]]`; feeding that straight in used to yield
  // `[[[[path]]]]`, which resolves to nothing at all.
  const withImage = {
    ...SCENE, files: { f00: { id: "f00", mimeType: "image/png", dataURL: "data:image/png;base64,AA" } },
  };
  const once = serializeExcalidraw(withImage, {
    embeddedFiles: [{ key: "f00", value: "[[attachments/pic.png]]" }],
  });
  const twice = serializeExcalidraw(withImage, { embeddedFiles: parseExcalidraw(once).embeddedFiles });
  assert.match(twice, /^f00: \[\[attachments\/pic\.png\]\]$/m);
});

// ── Session state never makes the trip through a file ────────────────────
// `collaborators` is a Map in the live editor, so JSON writes it as `{}` — and
// Excalidraw's restore() hands a supplied value straight to the editor, which
// calls .forEach on it. A drawing that had ever been saved from this app then
// threw on every render while still painting, so the only symptom was an
// uncaught TypeError behind a canvas that looked fine.
test("the editor's session state is stripped on the way out", () => {
  const live = {
    ...SCENE,
    appState: {
      ...SCENE.appState, scrollX: -40, scrollY: 88, zoom: { value: 1 },
      collaborators: new Map(), fileHandle: {},
    },
  };
  const md = serializeExcalidraw(live);
  assert.ok(!md.includes("collaborators"), "a Map cannot survive JSON — do not write it");
  const p = parseExcalidraw(md);
  assert.ok(!("collaborators" in p.scene.appState));
  assert.ok(!("fileHandle" in p.scene.appState));
  // The framing is the whole reason this is a denylist: a drawing must reopen
  // where the user left it.
  assert.equal(p.scene.appState.scrollX, -40);
  assert.equal(p.scene.appState.scrollY, 88);
  assert.deepEqual(p.scene.appState.zoom, { value: 1 });
});

test("a file that already carries them opens without them", () => {
  // Every drawing this app saved before the fix has `"collaborators":{}` on
  // disk; reading one must not hand the editor the shape that throws.
  const poisoned = serializeExcalidraw(SCENE).replace(
    /## Drawing\n```compressed-json\n[\s\S]*?```/,
    "## Drawing\n```json\n" + JSON.stringify({
      ...SCENE,
      appState: { ...SCENE.appState, collaborators: {}, fileHandle: {} },
    }) + "\n```",
  );
  const p = parseExcalidraw(poisoned);
  assert.equal(p.error, null);
  assert.ok(!("collaborators" in p.scene.appState));
  assert.ok(!("fileHandle" in p.scene.appState));
  assert.deepEqual(p.scene.elements, SCENE.elements);
});

test("a scene with nothing to strip is left exactly as it is", () => {
  assert.equal(cleanScene(SCENE), SCENE, "no needless copy");
  assert.equal(cleanScene(null), null);
  assert.equal(cleanScene({ elements: [] }).appState, undefined);
});

// ── The literal markers ──────────────────────────────────────────────────
test("the file carries every marker the plugin looks for", () => {
  const md = serializeExcalidraw(SCENE);
  assert.match(md, /^---\nexcalidraw-plugin: parsed\ntags: \[excalidraw\]\n---\n/);
  assert.match(md, /\n%%\n# Excalidraw Data\n\n## Text Elements\n/);
  assert.match(md, /## Drawing\n```compressed-json\n/);
  assert.match(md, /\n```\n%%\n$/, "the plugin block must close with ```\\n%%");
});

test("text elements are emitted as `<raw> ^<id>` for Obsidian's indexer", () => {
  const md = serializeExcalidraw(SCENE);
  assert.match(md, /^quire structures \^abc123$/m);
  // Only text elements — a rectangle has nothing to index.
  assert.doesNotMatch(md, /\^rect1/);
});

test("deleted and empty text elements stay out of the index", () => {
  const scene = {
    ...SCENE,
    elements: [
      { id: "gone", type: "text", rawText: "removed", isDeleted: true },
      { id: "blank", type: "text", rawText: "" },
      { id: "keep", type: "text", rawText: "kept" },
    ],
  };
  assert.deepEqual(textElementsOf(scene), [{ id: "keep", raw: "kept" }]);
});

test("rawText wins over text, as the plugin stores wrapped lines separately", () => {
  const scene = { elements: [
    { id: "t", type: "text", text: "wrap\nped", rawText: "wrapped", originalText: "wrapped" },
  ] };
  assert.deepEqual(textElementsOf(scene), [{ id: "t", raw: "wrapped" }]);
});

// ── The words inside the picture ─────────────────────────────────────────
test("textOfExcalidraw reads the words out of a drawing, without the anchors", () => {
  const md = serializeExcalidraw(SCENE);
  const words = textOfExcalidraw(md);
  assert.equal(words, "quire structures");
  // The `^elementId` is addressing, not language: leaving it in would let a
  // search for a stray id string "match" the drawing.
  assert.doesNotMatch(words, /abc123/);
});

test("textOfExcalidraw stays cheap — it never decompresses the scene", () => {
  // Corrupt the compressed payload. The words still come back, which is the
  // proof: this reads the plain `## Text Elements` section and nothing else.
  const md = serializeExcalidraw(SCENE).replace(/```compressed-json\n[\s\S]*?```/, "```compressed-json\n!!!broken!!!\n```");
  assert.equal(parseExcalidraw(md).scene, null, "the scene really is unreadable");
  assert.equal(textOfExcalidraw(md), "quire structures");
});

test("a file with no drawing data yields no words rather than throwing", () => {
  assert.equal(textOfExcalidraw("---\ntitle: x\n---\n\njust prose"), "");
  assert.equal(textOfExcalidraw(""), "");
  assert.equal(textOfExcalidraw(null), "");
});

test("a drawing is findable by a word inside it", async () => {
  const scene = { ...SCENE, elements: [
    { id: "t1", type: "text", rawText: "Fold", isDeleted: false },
    { id: "t2", type: "text", rawText: "unmaking the ones before it", isDeleted: false },
  ] };
  const v = new Vault(new MemoryBackend({
    "canvas/Sewing.excalidraw.md": serializeExcalidraw(scene, {
      frontmatter: "id: 01SEWING0000000000000000AA\nkind: canvas\ntitle: Sewing",
      backOfNote: "A sketch I keep redrawing.",
    }),
  }));
  await v.buildIndex();
  const d = new Data(v, { renderMarkdown: (m) => m });
  const titles = (q) => d.pages({ q }).items.map((p) => p.title);
  assert.deepEqual(titles("unmaking"), ["Sewing"], "the drawing's own words must be searchable");
  assert.deepEqual(titles("Fold"), ["Sewing"]);
  // The excerpt is what a list row prints, and it stays the user's prose —
  // a row reading "Fold unmaking the ones before it" describes the picture.
  assert.equal(v.index.get("01SEWING0000000000000000AA").excerpt, "A sketch I keep redrawing.");
});

// ── The user's own writing ───────────────────────────────────────────────
test("back-of-the-note prose survives a round trip", () => {
  const prose = "Reading notes on gathering structure.\n\nSee [[Quire Structures]].";
  const md = serializeExcalidraw(SCENE, { backOfNote: prose });
  const p = parseExcalidraw(md);
  assert.equal(p.backOfNote, prose);
  assert.deepEqual(p.scene, SCENE);
});

test("the plugin's switch-view notice is not mistaken for the user's prose", () => {
  const md = [
    "---", "excalidraw-plugin: parsed", "tags: [excalidraw]", "---",
    "==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠== You can decompress Drawing data with the command palette: 'Decompress current Excalidraw file'.",
    "", "%%", "# Excalidraw Data", "", "## Text Elements", "",
    "## Drawing", "```json", JSON.stringify(BLANK_SCENE), "```", "%%",
  ].join("\n");
  const p = parseExcalidraw(md);
  assert.equal(p.backOfNote, "", "the notice is the plugin's, not the user's");
  assert.equal(p.error, null);
});

// ── Sections ─────────────────────────────────────────────────────────────
test("element links and embedded files parse back out", () => {
  const scene = {
    ...SCENE,
    elements: SCENE.elements.map((el) =>
      el.id === "rect1" ? { ...el, link: "[[Quire Structures]]" } : el),
    files: { f1: { id: "f1", mimeType: "image/png", dataURL: "data:image/png;base64,AAAA" } },
  };
  const md = serializeExcalidraw(scene, {
    embeddedFiles: [{ key: "f1", value: "[[attachments/leaf.png]]" }],
  });
  const p = parseExcalidraw(md);
  assert.deepEqual(p.elementLinks, [{ key: "rect1", value: "[[Quire Structures]]" }]);
  assert.deepEqual(p.embeddedFiles, [{ key: "f1", value: "[[attachments/leaf.png]]" }]);
});

test("the sections are omitted entirely when empty, as the plugin omits them", () => {
  const md = serializeExcalidraw(SCENE);
  assert.doesNotMatch(md, /## Element Links/);
  assert.doesNotMatch(md, /## Embedded Files/);
});

test("the plugin's dummy text element is ignored on the way in", () => {
  const md = serializeExcalidraw(SCENE).replace(
    "## Text Elements\n", "## Text Elements\n\n^_dummy!_\n\n");
  const p = parseExcalidraw(md);
  assert.ok(!p.textElements.some((t) => t.id === "_dummy!_"));
});

// ── Failure is reported, never thrown ────────────────────────────────────
test("a file with no Drawing section is flagged, not crashed on", () => {
  const p = parseExcalidraw("---\nfoo: bar\n---\njust an ordinary note\n");
  assert.equal(p.scene, null);
  assert.match(p.error, /not an Excalidraw file/);
});

test("malformed drawing JSON is reported with the reason", () => {
  const p = parseExcalidraw("\n## Drawing\n```json\n{not json\n```\n%%");
  assert.equal(p.scene, null);
  assert.match(p.error, /malformed/);
});

test("undecodable compressed data is reported, and the file is not lost", () => {
  const p = parseExcalidraw(
    "---\nexcalidraw-plugin: parsed\n---\nmy notes\n%%\n# Excalidraw Data\n\n"
    + "## Drawing\n```compressed-json\n!!!not-base64!!!\n```\n%%");
  assert.equal(p.scene, null);
  assert.ok(p.error);
  assert.equal(p.backOfNote, "my notes", "the prose must survive a broken drawing");
});

test("an empty scene serializes to something the plugin can open", () => {
  const p = parseExcalidraw(serializeExcalidraw(null));
  assert.deepEqual(p.scene, BLANK_SCENE);
});

// ── Reaching the app ─────────────────────────────────────────────────────
// A correct parser the rest of the app never calls is worth nothing, so these
// go through the real Vault and Data.
const drawing = serializeExcalidraw(SCENE, { backOfNote: "Notes on the board." });

test("a .excalidraw.md is a canvas — a drawing is not a separate kind", async () => {
  const v = new Vault(new MemoryBackend({ "canvas/Board.excalidraw.md": drawing }));
  await v.buildIndex();
  const [e] = v.list();
  assert.equal(e.kind, "canvas");
  assert.equal(e.title, "Board", "the .excalidraw half must come off the title too");
});

test("a stray kind: in the frontmatter cannot demote a drawing to a note", async () => {
  const withKind = drawing.replace("excalidraw-plugin: parsed", "kind: note\nexcalidraw-plugin: parsed");
  const v = new Vault(new MemoryBackend({ "canvas/Mislabelled.excalidraw.md": withKind }));
  await v.buildIndex();
  assert.equal(v.list()[0].kind, "canvas");
});

test("a drawing lives anywhere, not only in canvas/", async () => {
  const v = new Vault(new MemoryBackend({ "notes/Sketch.excalidraw.md": drawing }));
  await v.buildIndex();
  assert.equal(v.list()[0].kind, "canvas");
});

test("the excerpt is the prose, never the base64 blob", async () => {
  const v = new Vault(new MemoryBackend({ "canvas/Board.excalidraw.md": drawing }));
  await v.buildIndex();
  const [e] = v.list();
  assert.equal(e.excerpt, "Notes on the board.");
  assert.ok(!e.excerpt.includes("compressed-json"));
});

test("an ordinary note is untouched by any of this", async () => {
  const v = new Vault(new MemoryBackend({
    "notes/Plain.md": "---\nid: 01ZZZZZZZZZZZZZZZZZZZZZZZZ\nkind: note\ntitle: Plain\n"
      + "created: 2026-07-01T00:00:00+00:00\nupdated: 2026-07-01T00:00:00+00:00\n---\n\nprose\n",
  }));
  await v.buildIndex();
  assert.equal(v.list()[0].kind, "note");
});

test("the page hands the view a scene and the prose, not raw markdown", async () => {
  const v = new Vault(new MemoryBackend({ "canvas/Board.excalidraw.md": drawing }));
  await v.buildIndex();
  const d = new Data(v, { renderMarkdown: (m) => m });
  const p = await d.page(v.list()[0].id);
  assert.ok(p.meta.excalidraw, "the view had nothing to mount");
  assert.deepEqual(p.meta.excalidraw.scene, SCENE);
  assert.equal(p.meta.excalidraw.error, null);
  assert.equal(p.body, "Notes on the board.");
  assert.ok(!p.body.includes("# Excalidraw Data"));
});

test("a corrupt drawing still reaches the view, flagged", async () => {
  const v = new Vault(new MemoryBackend({
    "canvas/Broken.excalidraw.md":
      "---\nexcalidraw-plugin: parsed\n---\nkeep me\n%%\n# Excalidraw Data\n\n"
      + "## Drawing\n```compressed-json\n@@@not-base64@@@\n```\n%%\n",
  }));
  await v.buildIndex();
  const d = new Data(v, { renderMarkdown: (m) => m });
  const p = await d.page(v.list()[0].id);
  assert.equal(p.meta.excalidraw.scene, null);
  assert.ok(p.meta.excalidraw.error);
  assert.equal(p.body, "keep me", "the prose must survive an unreadable drawing");
});

// ── Images become files, not base64 ──────────────────────────────────────
// A 1×1 red PNG, small enough to read as a literal and real enough to prove
// the bytes survive the trip through base64.
const PNG_1PX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("a pasted image is written into attachments/ and named after the drawing", async () => {
  const v = new Vault(new MemoryBackend({ "canvas/Sewing Order.excalidraw.md": drawing }));
  await v.buildIndex();
  const d = new Data(v, { renderMarkdown: (m) => m });
  const scene = { ...SCENE, files: { abc: { id: "abc", mimeType: "image/png", dataURL: PNG_1PX } } };

  const paths = await d.adoptDrawingImages(scene, "Sewing Order");
  assert.equal(paths.get("abc"), "attachments/Sewing Order.png");
  const bytes = await v.readBlob("attachments/Sewing Order.png");
  assert.ok(bytes && bytes.length > 8, "the image must be real bytes on disk");
  assert.deepEqual([...bytes.slice(1, 4)], [0x50, 0x4e, 0x47], "and a real PNG");

  // …and the drawing that referenced it now says so in plain markdown.
  const md = serializeExcalidraw(scene, { embeddedFiles: paths });
  assert.match(md, /^abc: \[\[attachments\/Sewing Order\.png\]\]$/m);
});

test("an image already filed is not filed again on the next save", async () => {
  const v = new Vault(new MemoryBackend({ "canvas/Sewing Order.excalidraw.md": drawing }));
  await v.buildIndex();
  const d = new Data(v, { renderMarkdown: (m) => m });
  const scene = { ...SCENE, files: { abc: { id: "abc", mimeType: "image/png", dataURL: PNG_1PX } } };

  const first = await d.adoptDrawingImages(scene, "Sewing Order");
  const second = await d.adoptDrawingImages(scene, "Sewing Order", first);
  assert.deepEqual([...second], [...first], "a save per keystroke must not fill the vault");
  assert.equal(await v.be.exists("attachments/Sewing Order-2.png"), false);
});

test("the extension follows the image's own type", async () => {
  const v = new Vault(new MemoryBackend({ "canvas/D.excalidraw.md": drawing }));
  await v.buildIndex();
  const d = new Data(v, { renderMarkdown: (m) => m });
  const paths = await d.adoptDrawingImages({
    files: {
      j: { id: "j", mimeType: "image/jpeg", dataURL: "data:image/jpeg;base64,AAAA" },
      s: { id: "s", mimeType: "image/svg+xml", dataURL: "data:image/svg+xml;base64,AAAA" },
    },
  }, "D");
  assert.equal(paths.get("j"), "attachments/D.jpg");
  assert.equal(paths.get("s"), "attachments/D.svg");
});

test("an image the scene cannot describe costs nothing but itself", async () => {
  const v = new Vault(new MemoryBackend({ "canvas/D.excalidraw.md": drawing }));
  await v.buildIndex();
  const d = new Data(v, { renderMarkdown: (m) => m });
  const paths = await d.adoptDrawingImages({
    files: {
      bad: { id: "bad", mimeType: "image/png", dataURL: "https://example.com/not-a-data-url.png" },
      ok: { id: "ok", mimeType: "image/png", dataURL: PNG_1PX },
    },
  }, "D");
  assert.equal(paths.has("bad"), false, "skipped, not thrown on");
  assert.equal(paths.get("ok"), "attachments/D.png", "and the rest still saves");
});
