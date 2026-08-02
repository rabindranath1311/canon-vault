// The `.excalidraw.md` interop contract. If these pass, the Obsidian Excalidraw
// plugin opens what we write and we open what it wrote.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseExcalidraw, serializeExcalidraw, compressScene, decompressScene,
  textElementsOf, isExcalidrawPath, BLANK_SCENE,
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
  const md = serializeExcalidraw(SCENE, {
    elementLinks: [{ key: "rect1", value: "[[Quire Structures]]" }],
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

test("a .excalidraw.md is its own kind, from the extension", async () => {
  const v = new Vault(new MemoryBackend({ "canvas/Board.excalidraw.md": drawing }));
  await v.buildIndex();
  const [e] = v.list();
  assert.equal(e.kind, "excalidraw");
  assert.equal(e.title, "Board", "the .excalidraw half must come off the title too");
});

test("a stray kind: in the frontmatter cannot demote a drawing to a note", async () => {
  const withKind = drawing.replace("excalidraw-plugin: parsed", "kind: note\nexcalidraw-plugin: parsed");
  const v = new Vault(new MemoryBackend({ "canvas/Mislabelled.excalidraw.md": withKind }));
  await v.buildIndex();
  assert.equal(v.list()[0].kind, "excalidraw");
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
