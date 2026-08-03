// A project is a folder that holds pages of every kind. These pin the
// container behaviour: creation files INTO the folder, membership IS the
// folder, and a drawing created here is a file Obsidian's plugin owns.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Vault, MemoryBackend } from "../vault/vault.js";
import { Data } from "../vault/data.js";
import { parseExcalidraw } from "../vault/excalidraw.js";
import { serialize } from "../vault/mdfile.js";

const TS = "2026-07-01T00:00:00+00:00";

async function data(files = {}) {
  const v = new Vault(new MemoryBackend(files));
  await v.buildIndex();
  return new Data(v, { renderMarkdown: (m) => m, now: () => new Date(TS) });
}

test("createPage with project files into the project folder, any kind", async () => {
  const d = await data();
  const note = await d.createPage({ kind: "note", title: "Brief", project: "Rebrand" });
  const topic = await d.createPage({ kind: "topic", title: "Voice", project: "Rebrand" });
  const bm = await d.createPage({ kind: "bookmark", title: "Ref", project: "Rebrand" });
  assert.equal(note.path, "projects/Rebrand/Brief.md");
  assert.equal(topic.path, "projects/Rebrand/Voice.md");
  assert.equal(bm.path, "projects/Rebrand/Ref.md");
  // the file keeps its true kind — the folder is the membership
  assert.equal(topic.kind, "topic");
  assert.equal(bm.kind, "note");
});

test("a drawing created in a project is the plugin's own file format", async () => {
  const d = await data();
  const p = await d.createPage({ kind: "drawing", title: "Wireframe", project: "Rebrand" });
  assert.equal(p.path, "projects/Rebrand/Wireframe.excalidraw.md");
  assert.equal(p.kind, "canvas", "a drawing IS a canvas");
  // The on-disk file must be recognisable to the Obsidian plugin and to us.
  assert.equal(p.frontmatter["excalidraw-plugin"], "parsed");
  assert.ok(p.meta.excalidraw, "the drawing editor gets a scene to mount");
  assert.equal(p.meta.excalidraw.error, null);
  assert.deepEqual(p.meta.excalidraw.scene.elements, []);
});

test("a drawing can be created outside a project too", async () => {
  const d = await data();
  const p = await d.createPage({ kind: "drawing", title: "Sketch" });
  assert.equal(p.path, "canvas/Sketch.excalidraw.md");
});

test("projectMembers is the folder minus its own note", async () => {
  const d = await data({
    "projects/Rebrand/Rebrand.md": serialize({
      id: "01PPPPPPPPPPPPPPPPPPPPPPPP", kind: "note", title: "Rebrand",
      created: TS, updated: TS }, "the folder note"),
  });
  await d.createPage({ kind: "note", title: "Brief", project: "Rebrand" });
  await d.createPage({ kind: "drawing", title: "Wireframe", project: "Rebrand" });
  const { items, count } = d.projectMembers("Rebrand");
  assert.equal(count, 2);
  assert.ok(!items.some((p) => p.path === "projects/Rebrand/Rebrand.md"),
    "the folder note is the container, not a member");
  assert.deepEqual(items.map((p) => p.kind).sort(), ["canvas", "note"]);
});

test("two quick untitled creates do not overwrite each other", async () => {
  const d = await data();
  const a = await d.createPage({ kind: "note", project: "Rebrand" });
  const b = await d.createPage({ kind: "note", project: "Rebrand" });
  assert.notEqual(a.path, b.path);
  assert.equal(d.projectMembers("Rebrand").count, 2);
});

test("the round trip: a project-created drawing parses back byte-safe", async () => {
  const d = await data();
  const p = await d.createPage({ kind: "drawing", title: "W", project: "R" });
  const raw = await d.v.be.readText(p.path);
  const ex = parseExcalidraw(raw);
  assert.equal(ex.error, null);
  assert.equal(ex.compressed, true, "the default write is the plugin's default");
});
