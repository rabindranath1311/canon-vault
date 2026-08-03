// Bookmarks are a VIEW over notes-with-url, not a storage kind — the file says
// `kind: note` and Obsidian sees nothing new. These pin the seams that made
// bookmarks look unimplemented: pageOut dropped `url`, so chrome could never
// fire; and updatePage dropped `patch.meta`, so a url edited in the app
// reverted on reload.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Vault, MemoryBackend } from "../vault/vault.js";
import { Data, noteChrome } from "../vault/data.js";
import { serialize } from "../vault/mdfile.js";

const TS = "2026-07-01T00:00:00+00:00";
const note = (id, fm = {}, body = "") => serialize({
  id, kind: "note", title: fm.title || "Note", created: TS, updated: TS, ...fm,
}, body);

const VAULT = () => new MemoryBackend({
  "notes/Article.md": note("01AAAAAAAAAAAAAAAAAAAAAAAA", { title: "Article" }, "prose"),
  "notes/Saved.md": note("01BBBBBBBBBBBBBBBBBBBBBBBB",
    { title: "Saved", url: "https://example.com/a" }, "why I saved it"),
  "notes/Card.md": note("01CCCCCCCCCCCCCCCCCCCCCCCC",
    { title: "Card", url: "https://example.com/b", og_image: "https://img.example/x.png" }),
  "topics/T.md": serialize({ id: "01DDDDDDDDDDDDDDDDDDDDDDDD", kind: "topic",
    title: "T", created: TS, updated: TS }, ""),
});

async function data() {
  const v = new Vault(VAULT()); await v.buildIndex();
  return new Data(v, { renderMarkdown: (m) => m });
}

test("kind=bookmark lists exactly the notes with a url", async () => {
  const d = await data();
  const { items } = d.pages({ kind: "bookmark" });
  assert.deepEqual(items.map((p) => p.title).sort(), ["Card", "Saved"]);
  // and they are still notes on disk
  assert.ok(items.every((p) => p.kind === "note"));
});

test("kind=note still includes bookmarks — that is what they are", async () => {
  const d = await data();
  const { items } = d.pages({ kind: "note" });
  assert.equal(items.length, 3);
});

test("counts gains a bookmark tally without shrinking note", async () => {
  const d = await data();
  const { counts } = d.counts();
  assert.equal(counts.bookmark, 2);
  assert.equal(counts.note, 3);
});

test("a full page carries url + meta the bookmark editor reads", async () => {
  const d = await data();
  const p = await d.page("01CCCCCCCCCCCCCCCCCCCCCCCC");
  assert.equal(p.url, "https://example.com/b");
  assert.equal(p.meta.url, "https://example.com/b");
  assert.equal(p.meta.og.image, "https://img.example/x.png");
  assert.equal(p.meta.links.length, 1);
  assert.equal(noteChrome(p), "bookmark card");
});

test("a url-less note renders as an article, unchanged", async () => {
  const d = await data();
  const p = await d.page("01AAAAAAAAAAAAAAAAAAAAAAAA");
  assert.equal(noteChrome(p), "article");
  assert.equal(p.meta.url, undefined);
});

test("createPage('bookmark') writes kind: note with a url key", async () => {
  const d = await data();
  const p = await d.createPage({ kind: "bookmark", title: "Fresh", url: "" });
  assert.equal(p.kind, "note");
  assert.ok(p.path.startsWith("notes/"));
  // The empty url key is what makes a new bookmark open with a url field.
  assert.equal(noteChrome(p), "link with source line");
});

test("editing the url through page.meta persists to frontmatter", async () => {
  const d = await data();
  const before = await d.page("01BBBBBBBBBBBBBBBBBBBBBBBB");
  const meta = { ...before.meta, url: "https://example.com/moved",
    links: [{ url: "https://example.com/moved", og: null }] };
  await d.updatePage("01BBBBBBBBBBBBBBBBBBBBBBBB", { meta });
  const after = await d.page("01BBBBBBBBBBBBBBBBBBBBBBBB");
  assert.equal(after.url, "https://example.com/moved");
  assert.equal(after.frontmatter.url, "https://example.com/moved");
});

test("multi-link bookmarks round-trip through fm.links", async () => {
  const d = await data();
  const meta = { links: [
    { url: "https://example.com/1", og: null },
    { url: "https://example.com/2", og: null },
  ] };
  await d.updatePage("01BBBBBBBBBBBBBBBBBBBBBBBB", { meta });
  const p = await d.page("01BBBBBBBBBBBBBBBBBBBBBBBB");
  assert.deepEqual(p.meta.links.map((l) => l.url),
    ["https://example.com/1", "https://example.com/2"]);
  assert.equal(p.frontmatter.url, "https://example.com/1",
    "links[0] mirrors into url so older readers still work");
});
