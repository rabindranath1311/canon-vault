// Filenames. Obsidian resolves `[[Link]]` by filename, so a name is a piece of
// addressing, not decoration: two files sharing one make every link to it
// ambiguous, and a file that never follows its title keeps answering to the
// name it was born with. Both were reachable from the app — a blank page was
// called `Untitled` in every folder, and the uniqueness check only looked in
// one of them.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Vault, MemoryBackend } from "../vault/vault.js";
import { Data, pageStem, stemFor, renamePlan } from "../vault/data.js";
import { serialize } from "../vault/mdfile.js";

const TS = "2026-08-15T12:00:00+00:00";
const md = (fm, body = "") => serialize(fm, body);
const P = (id, over = {}) => ({
  id, kind: "note", title: "Page", created: TS, updated: TS, ...over,
});

async function data(files = {}) {
  const v = new Vault(new MemoryBackend(files), { now: () => TS });
  await v.buildIndex();
  return new Data(v, { renderMarkdown: (m) => m });
}

// ── the default name ────────────────────────────────────────────────────────

test("a blank page is named for its kind and the day, not Untitled", async () => {
  const d = await data();
  const note = await d.createPage({ kind: "note" });
  assert.equal(note.path, "notes/Note 2026-08-15.md");
  assert.equal(note.title, "Note 2026-08-15");
  assert.equal((await d.createPage({ kind: "topic" })).path, "topics/Topic 2026-08-15.md");
  assert.equal((await d.createPage({ kind: "inspo" })).path, "inspo/Wall 2026-08-15.md");
});

test("a bookmark is named for the kind that was asked for, not the one on disk", async () => {
  const d = await data();
  const p = await d.createPage({ kind: "bookmark", url: "" });
  assert.equal(p.path, "notes/Bookmark 2026-08-15.md");
  assert.equal(p.kind, "note", "still stored as a note with a url");
});

// ── uniqueness ──────────────────────────────────────────────────────────────

test("a new page never takes a name a page in another folder already holds", async () => {
  const d = await data({ "topics/Note 2026-08-15.md": md(P("01AAAAAAAAAAAAAAAAAAAAAAAA", { title: "Note 2026-08-15", kind: "topic" })) });
  const made = await d.createPage({ kind: "note" });
  assert.equal(made.path, "notes/Note 2026-08-15 2.md",
    "the folder differs but `[[Note 2026-08-15]]` does not");
});

test("a bare .canvas holds its name against a new page too", async () => {
  const d = await data({ "Sketches.canvas": '{"nodes":[],"edges":[]}' });
  const made = await d.createPage({ kind: "note", title: "Sketches" });
  assert.equal(made.path, "notes/Sketches 2.md");
  await d.v.buildIndex();
  assert.equal(d.v.warnings.filter((w) => w.startsWith("duplicate filename")).length, 0,
    "no link is made ambiguous — the title the user asked for is another matter");
});

test("two quick blank creates land on different names", async () => {
  const d = await data();
  const a = await d.createPage({ kind: "note" });
  const b = await d.createPage({ kind: "note" });
  assert.notEqual(a.path, b.path);
  assert.equal(b.path, "notes/Note 2026-08-15 2.md");
});

// ── the file follows the title ──────────────────────────────────────────────

test("titling a default-named page renames the file", async () => {
  const d = await data();
  const made = await d.createPage({ kind: "note" });
  const named = await d.updatePage(made.id, { title: "Ferry timetables" });
  assert.equal(named.path, "notes/Ferry timetables.md");
  assert.equal(await d.v.be.exists("notes/Note 2026-08-15.md"), false);
  assert.equal(named.id, made.id, "the id is the identity, and it does not move");
});

test("a canvas takes its .canvas sibling along", async () => {
  const d = await data({
    "canvas/Board 2026-08-15.md": md(P("01BBBBBBBBBBBBBBBBBBBBBBBB", { title: "Board 2026-08-15", kind: "canvas" }), "![[Board 2026-08-15.canvas]]"),
    "canvas/Board 2026-08-15.canvas": '{"nodes":[],"edges":[]}',
  });
  await d.updatePage("01BBBBBBBBBBBBBBBBBBBBBBBB", { title: "Route planning" });
  assert.ok(await d.v.be.exists("canvas/Route planning.canvas"),
    "a board left behind is a board Obsidian shows and the app cannot find");
  assert.equal(await d.v.be.exists("canvas/Board 2026-08-15.canvas"), false);
});

test("a file the user named deliberately is left alone", async () => {
  const d = await data({ "notes/2026-08-15-ferries.md": md(P("01CCCCCCCCCCCCCCCCCCCCCCCC", { title: "Ferry timetables" })) });
  const r = await d.updatePage("01CCCCCCCCCCCCCCCCCCCCCCCC", { title: "Ferry timetables, revised" });
  assert.equal(r.path, "notes/2026-08-15-ferries.md");
});

test("an inbound link survives the rename as an alias", async () => {
  const d = await data({
    "notes/Note 2026-08-15.md": md(P("01DDDDDDDDDDDDDDDDDDDDDDDD", { title: "Note 2026-08-15" })),
    "notes/Other.md": md(P("01EEEEEEEEEEEEEEEEEEEEEEEE", { title: "Other" }), "see [[Note 2026-08-15]]"),
  });
  const r = await d.updatePage("01DDDDDDDDDDDDDDDDDDDDDDDD", { title: "Ferry timetables" });
  assert.equal(r.path, "notes/Ferry timetables.md");
  assert.deepEqual(r.frontmatter.aliases, ["Note 2026-08-15"],
    "Obsidian matches basename then aliases, so the old link still lands");
});

test("no inbound link, no alias clutter", async () => {
  const d = await data();
  const made = await d.createPage({ kind: "note" });
  const r = await d.updatePage(made.id, { title: "Ferry timetables" });
  assert.equal(r.frontmatter.aliases, undefined);
});

test("a rename that would collide does not happen at all", async () => {
  const d = await data({ "topics/Ferry timetables.md": md(P("01FFFFFFFFFFFFFFFFFFFFFFFF", { title: "Ferry timetables", kind: "topic" })) });
  const made = await d.createPage({ kind: "note" });
  const r = await d.updatePage(made.id, { title: "Ferry timetables" });
  assert.equal(r.path, "notes/Note 2026-08-15.md", "better a stale name than somebody else's");
  assert.equal(r.title, "Ferry timetables");
});

test("a default name is drained even after a refused rename", async () => {
  const d = await data({ "topics/Ferry.md": md(P("01MMMMMMMMMMMMMMMMMMMMMMMM", { title: "Ferry", kind: "topic" })) });
  const made = await d.createPage({ kind: "note" });
  // The title saves on a timer, so a pause mid-word saves "Ferry" — which is
  // taken, so the file does not move and its name now matches nothing.
  const half = await d.updatePage(made.id, { title: "Ferry" });
  assert.equal(half.path, "notes/Note 2026-08-15.md");
  const done = await d.updatePage(made.id, { title: "Ferry timetables" });
  assert.equal(done.path, "notes/Ferry timetables.md", "and the default name is still shed");
});

test("Obsidian's own Untitled is drained on the first real title", async () => {
  const d = await data({ "Untitled.md": md(P("01NNNNNNNNNNNNNNNNNNNNNNNN", { title: "Untitled" })) });
  const r = await d.updatePage("01NNNNNNNNNNNNNNNNNNNNNNNN", { title: "Harbour notes" });
  assert.equal(r.path, "Harbour notes.md");
});

test("a rename does not read as somebody else's edit on the next save", async () => {
  const d = await data();
  const made = await d.createPage({ kind: "note" });
  const first = await d.updatePage(made.id, { title: "Ferry timetables", body: "one" });
  assert.equal(first.path, "notes/Ferry timetables.md");
  // FSA has no rename: move is a copy-and-delete, and the new file's mtime
  // would fail the 5.19 conflict gate if the index still held the old one.
  const second = await d.updatePage(made.id, { body: "two" });
  assert.equal(second.reason, undefined, second.message);
  assert.equal(second.body, "two");
});

// ── the primitive ───────────────────────────────────────────────────────────

test("rename refuses a name already on disk", async () => {
  const d = await data({
    "notes/A.md": md(P("01GGGGGGGGGGGGGGGGGGGGGGGG", { title: "A" })),
    "notes/B.md": md(P("01HHHHHHHHHHHHHHHHHHHHHHHH", { title: "B" })),
  });
  const r = await d.v.rename("01GGGGGGGGGGGGGGGGGGGGGGGG", "notes/B.md");
  assert.equal(r.ok, false);
  assert.equal(r.reason, "exists");
  assert.ok(await d.v.be.exists("notes/A.md"), "and leaves the original where it was");
});

// ── the warnings ────────────────────────────────────────────────────────────

test("two files sharing a filename warn about the ambiguous link", async () => {
  const v = new Vault(new MemoryBackend({
    "topics/Untitled.md": md(P("01JJJJJJJJJJJJJJJJJJJJJJJJ", { title: "Untitled", kind: "topic" })),
    "Untitled.canvas": '{"nodes":[],"edges":[]}',
  }), { now: () => TS });
  await v.buildIndex();
  const w = v.warnings.filter((x) => x.startsWith("duplicate filename"));
  assert.equal(w.length, 1, "one collision is one warning, not one per index pass");
  assert.match(w[0], /\[\[Untitled\]\] is ambiguous/);
  assert.equal(v.warnings.length, 1, "and not doubled up with a duplicate-title warning");
});

test("a shared title with distinct filenames is still only cosmetic", async () => {
  const v = new Vault(new MemoryBackend({
    "notes/A.md": md(P("01KKKKKKKKKKKKKKKKKKKKKKKK", { title: "Same" })),
    "topics/B.md": md(P("01LLLLLLLLLLLLLLLLLLLLLLLL", { title: "same", kind: "topic" })),
  }), { now: () => TS });
  await v.buildIndex();
  assert.equal(v.warnings.length, 1);
  assert.match(v.warnings[0], /^duplicate title "same"/);
});

// ── the helpers ─────────────────────────────────────────────────────────────

test("pageStem strips the whole extension, drawings included", () => {
  assert.equal(pageStem("canvas/Wireframe.excalidraw.md"), "Wireframe");
  assert.equal(pageStem("notes/A.md"), "A");
  assert.equal(pageStem("Board.canvas"), "Board");
});

test("stemFor drops what a filename cannot hold, including a leading dot", () => {
  assert.equal(stemFor('Slash/Colon: "Quote"'), "Slash Colon Quote");
  assert.equal(stemFor(".env notes"), "env notes", "a dotfile would be indexed as nothing at all");
  assert.equal(stemFor("   "), "");
});

test("renamePlan leaves a title-only change alone", async () => {
  const d = await data();
  const cur = { path: "notes/A.md", title: "A" };
  assert.equal(renamePlan(d.v, cur, "A"), null);
  assert.equal(renamePlan(d.v, cur, "   "), null);
  assert.equal(renamePlan(d.v, cur, "A/B").to, "notes/A B.md", "sanitised, and the alias carries the rest");
});

test("renamePlan keeps a drawing's double extension", async () => {
  const d = await data();
  const cur = { path: "canvas/Sketch.excalidraw.md", title: "Sketch" };
  assert.equal(renamePlan(d.v, cur, "Ferry deck").to, "canvas/Ferry deck.excalidraw.md");
});
