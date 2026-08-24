// The vault's own problems, and the fixes the resolve dialog runs.
//
// A warning that cannot be acted on is a dead end — this is the half that acts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Vault, MemoryBackend } from "../vault/vault.js";
import { Data, suggestStem } from "../vault/data.js";
import { serialize, parse } from "../vault/mdfile.js";

const TS = (d) => `2026-07-${String(d).padStart(2, "0")}T12:00:00+00:00`;
const md = (fm, body = "") => serialize(fm, body);
const P = (id, over = {}) => ({
  id, kind: "note", title: "Page", created: TS(1), updated: TS(20), ...over,
});

function stand(files) {
  const v = new Vault(new MemoryBackend(files), { now: () => TS(30) });
  return v;
}

async function withDupes() {
  const v = stand({
    "canvas/Untitled.md": md(P("01AAAAAAAAAAAAAAAAAAAAAAAA", { title: "Loose sketches", kind: "canvas" })),
    "inspo/Untitled.md": md(P("01BBBBBBBBBBBBBBBBBBBBBBBB", { title: "Untitled", kind: "inspo" })),
    "notes/Keep.md": md(P("01CCCCCCCCCCCCCCCCCCCCCCCC", { title: "Keep" })),
  });
  await v.buildIndex();
  return { v, d: new Data(v, { renderMarkdown: (m) => m }) };
}

test("a duplicate filename is reported as a problem, not only as a sentence", async () => {
  const { v } = await withDupes();
  assert.equal(v.warnings.length, 1);
  const p = v.problems.find((x) => x.type === "duplicate-filename");
  assert.ok(p, "the warning has a structured twin");
  assert.equal(p.name, "Untitled");
  assert.deepEqual(p.paths.sort(), ["canvas/Untitled.md", "inspo/Untitled.md"]);
  assert.equal(p.text, v.warnings[0], "both say the same thing");
});

test("the suggested name is the page's own title, then its folder", async () => {
  const { v } = await withDupes();
  // A page whose title says what it is gets its title back.
  assert.equal(suggestStem(v, "canvas/Untitled.md", v.byPath.get("canvas/Untitled.md")),
    "Loose sketches");
  // One whose title is also "Untitled" is qualified by where it lives, rather
  // than by a number that says only that it lost a race.
  assert.equal(suggestStem(v, "inspo/Untitled.md", v.byPath.get("inspo/Untitled.md")),
    "Untitled (inspo)");
});

test("renaming one of the two settles the collision, with no alias to rebuild it", async () => {
  const { v, d } = await withDupes();
  const r = await d.renameFile("canvas/Untitled.md", "Loose sketches");
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.path, "canvas/Loose sketches.md");
  assert.deepEqual(v.warnings, []);
  const [fm] = parse(await v.be.readText("canvas/Loose sketches.md"));
  assert.ok(!(fm.aliases || []).includes("Untitled"),
    "an alias claiming the contested name would rebuild the ambiguity");
});

test("a rename into a name that is also taken is refused, and says so", async () => {
  const { d } = await withDupes();
  const r = await d.renameFile("inspo/Untitled.md", "Keep");
  assert.equal(r.ok, false);
  assert.equal(r.reason, "name-taken");
  assert.match(r.message, /\[\[Keep\]\]/);
});

test("a name the filesystem cannot take is refused before anything moves", async () => {
  const { v, d } = await withDupes();
  const r = await d.renameFile("inspo/Untitled.md", "///");
  assert.equal(r.ok, false);
  assert.equal(r.reason, "bad-name");
  assert.ok(v.byPath.has("inspo/Untitled.md"), "the file stayed where it was");
});

test("a .canvas is named as the other half of a collision but never offered as the fix", async () => {
  const v = stand({
    "notes/Sketches.md": md(P("01AAAAAAAAAAAAAAAAAAAAAAAA", { title: "Sketches" })),
    "Sketches.canvas": '{"nodes":[],"edges":[]}',
  });
  await v.buildIndex();
  const d = new Data(v, { renderMarkdown: (m) => m });
  const p = d.vaultProblems().find((x) => x.type === "duplicate-filename");
  assert.ok(p);
  const canvas = p.files.find((f) => f.path === "Sketches.canvas");
  assert.equal(canvas.fixable, false, "Obsidian owns that file");
  assert.equal(p.files.find((f) => f.path === "notes/Sketches.md").fixable, true);
});

test("two files claiming one id: the loser can be given a new one", async () => {
  const v = stand({
    "notes/One.md": md(P("01AAAAAAAAAAAAAAAAAAAAAAAA", { title: "One" }), "first"),
    "notes/Two.md": md(P("01AAAAAAAAAAAAAAAAAAAAAAAA", { title: "Two" }), "second"),
  });
  await v.buildIndex();
  const d = new Data(v, { renderMarkdown: (m) => m });
  assert.ok(v.problems.some((p) => p.type === "duplicate-id"));

  // notes/Two.md is the half the index does NOT hold under that id — reading
  // by id would rewrite the other file.
  const r = await d.newIdFor("notes/Two.md");
  assert.ok(r.ok, JSON.stringify(r));
  const [fm, body] = parse(await v.be.readText("notes/Two.md"));
  assert.notEqual(fm.id, "01AAAAAAAAAAAAAAAAAAAAAAAA");
  assert.equal(fm.title, "Two", "the right file was rewritten");
  assert.match(body, /second/);
  assert.deepEqual(v.problems.filter((p) => p.type === "duplicate-id"), []);
});

test("two pages sharing a title can be retitled from here", async () => {
  const v = stand({
    "notes/A.md": md(P("01AAAAAAAAAAAAAAAAAAAAAAAA", { title: "Same" })),
    "notes/B.md": md(P("01BBBBBBBBBBBBBBBBBBBBBBBB", { title: "Same" })),
  });
  await v.buildIndex();
  const d = new Data(v, { renderMarkdown: (m) => m });
  assert.ok(v.problems.some((p) => p.type === "duplicate-title"));
  const r = await d.retitle("notes/B.md", "Different");
  assert.ok(r.ok, JSON.stringify(r));
  assert.deepEqual(v.problems.filter((p) => p.type === "duplicate-title"), []);
});

test("a file that cannot be parsed is a problem, and is not counted as a warning", async () => {
  const v = stand({ "notes/Broken.md": "---\nid: 01A\ntitle: no end\n\nbody" });
  await v.buildIndex();
  assert.deepEqual(v.warnings, [], "the banner counts collisions");
  const p = v.problems.find((x) => x.type === "unreadable");
  assert.ok(p, "the dialog still has to show it");
  assert.equal(p.paths[0], "notes/Broken.md");
});

test("prevention: a new file may not take a name another file already answers to", async () => {
  const v = stand({ "notes/Taken.md": md(P("01AAAAAAAAAAAAAAAAAAAAAAAA", { title: "Taken" })) });
  await v.buildIndex();
  const r = await v.put({ path: "inspo/Taken.md", kind: "inspo", title: "Taken",
                          frontmatter: { kind: "inspo", title: "Taken" }, body: "" });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "name-taken");
  assert.equal(r.held, "notes/Taken.md");
  assert.equal(await v.be.exists("inspo/Taken.md"), false, "nothing was written");
});

test("prevention: an existing file keeps saving even while its name is contested", async () => {
  const v = stand({
    "canvas/Untitled.md": md(P("01AAAAAAAAAAAAAAAAAAAAAAAA", { title: "A", kind: "canvas" })),
    "inspo/Untitled.md": md(P("01BBBBBBBBBBBBBBBBBBBBBBBB", { title: "B", kind: "inspo" })),
  });
  await v.buildIndex();
  const r = await v.put({ path: "inspo/Untitled.md", id: "01BBBBBBBBBBBBBBBBBBBBBBBB",
                          kind: "inspo", frontmatter: { kind: "inspo", title: "B" },
                          body: "still editable" });
  assert.ok(r.ok, "refusing this would strand an edit over a problem the user did not just cause");
});

test("prevention: a project folder note takes a name free across the whole vault", async () => {
  const v = stand({ "notes/Research.md": md(P("01AAAAAAAAAAAAAAAAAAAAAAAA", { title: "Research" })) });
  await v.buildIndex();
  const d = new Data(v, { renderMarkdown: (m) => m });
  const r = await d.createProject("Research");
  assert.ok(!(r && r.ok === false), JSON.stringify(r));
  assert.equal(await v.be.exists("projects/Research/Research.md"), false);
  assert.ok(await v.be.exists("projects/Research 2/Research 2.md"));
  // The names no longer collide. The two TITLES still read "Research", which is
  // the user's own choice and stays reported as the cosmetic thing it is.
  assert.deepEqual(v.problems.filter((x) => x.type === "duplicate-filename"), []);
});
