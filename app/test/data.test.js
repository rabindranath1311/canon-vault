// Task 6.8: the endpoints that survive, computed from the vault with no server.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Vault, MemoryBackend } from "../vault/vault.js";
import {
  Data, layoutFromCanvas, edgesFromCanvas, edgeGeometry, facingSide,
} from "../vault/data.js";
import { serialize } from "../vault/mdfile.js";

const TS = (d) => `2026-07-${String(d).padStart(2, "0")}T12:00:00+00:00`;
const md = (fm, body = "") => serialize(fm, body);
const P = (id, over = {}) => ({
  id, kind: "note", title: `Page ${id.slice(-2)}`,
  created: TS(1), updated: TS(20), ...over,
});

async function fixture() {
  const files = {
    "notes/Alpha.md": md(P("01AAAAAAAAAAAAAAAAAAAAAAAA", { title: "Alpha", tags: ["cartography", "lanterns"], updated: TS(28) }), "Alpha body mentions [[Beta]] and #inline"),
    "notes/Beta.md": md(P("01BBBBBBBBBBBBBBBBBBBBBBBB", { title: "Beta", tags: ["cartography"], updated: TS(27) }), "Beta body. " + "filler ".repeat(80) + " needle_xyz sits well past the excerpt."),
    "topics/Gamma.md": md(P("01CCCCCCCCCCCCCCCCCCCCCCCC", { title: "Gamma", kind: "topic", tags: ["bookbinding"], aliases: ["Gee"], updated: TS(26) }), "Gamma body"),
    "canvas/Delta.md": md(P("01DDDDDDDDDDDDDDDDDDDDDDDD", { title: "Delta", kind: "canvas", updated: TS(25) }), "![[Delta.canvas]]"),
    "canvas/Delta.canvas": '{"nodes":[],"edges":[]}',
    "inspo/Epsilon.md": md(P("01EEEEEEEEEEEEEEEEEEEEEEEE", { title: "Epsilon", kind: "inspo", updated: TS(24) }), "Epsilon"),
    "context/about-me.md": md(P("context-about-me", { title: "About me", updated: TS(23) }), "## Taste\n\nrestrained"),
  };
  const v = new Vault(new MemoryBackend(files), { now: () => TS(30) });
  await v.buildIndex();
  return new Data(v, { now: () => new Date(TS(30)), renderMarkdown: (m) => `<p>${m}</p>` });
}

test("6.18 counts match list() per kind", async () => {
  const d = await fixture();
  assert.deepEqual((await d.counts()).counts, { note: 3, topic: 1, canvas: 1, inspo: 1 });
});

test("6.18 tags aggregate client-side, inline tags included", async () => {
  const d = await fixture();
  const tags = (await d.tags()).tags;
  assert.deepEqual(tags.find((t) => t.tag === "cartography"), { tag: "cartography", count: 2 });
  assert.ok(tags.some((t) => t.tag === "inline"), "inline #tags must be aggregated too");
});

test("6.18 mention-suggest works offline and ranks prefixes first", async () => {
  const d = await fixture();
  const items = (await d.suggestMentions("be")).items;
  assert.ok(items.length >= 1, "typing [[ must offer at least one suggestion offline");
  assert.equal(items[0].title, "Beta");
  // aliases are suggestable
  assert.ok((await d.suggestMentions("gee")).items.some((i) => i.title === "Gee"));
});

test("pages() filters by kind, tag and query, newest first", async () => {
  const d = await fixture();
  assert.equal((await d.pages({ kind: "topic" })).count, 1);
  assert.equal((await d.pages({ tag: "cartography" })).count, 2);
  assert.equal((await d.pages({ q: "gam" })).items[0].title, "Gamma");
  const all = await d.pages({});
  assert.deepEqual(all.items.map((i) => i.title),
    ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "About me"]);
  assert.equal((await d.pages({ limit: 2 })).count, 2);
});

test("6.5 full-text search finds a string only present beyond the excerpt", async () => {
  const d = await fixture();
  const quick = await d.pages({ q: "needle_xyz" });
  assert.equal(quick.count, 0, "the index excerpt must not contain it");
  const deep = await d.searchFullText("needle_xyz");
  assert.equal(deep.count, 1);
  assert.equal(deep.items[0].title, "Beta");
});

test("list results carry the excerpt, not full bodies (§7)", async () => {
  const d = await fixture();
  const beta = (await d.pages({ q: "beta" })).items[0];
  assert.ok(beta.body.length <= 300);
  const full = await d.page("01BBBBBBBBBBBBBBBBBBBBBBBB");
  assert.ok(full.body.length > 300, "page(id) must return the real body");
});

test("pages?mention= resolves via the target's title", async () => {
  const d = await fixture();
  const r = await d.pages({ mention: "01BBBBBBBBBBBBBBBBBBBBBBBB" });
  assert.deepEqual(r.items.map((i) => i.title), ["Alpha"]);
});

test("batch returns only the ids asked for", async () => {
  const d = await fixture();
  const r = await d.batch("01AAAAAAAAAAAAAAAAAAAAAAAA,01CCCCCCCCCCCCCCCCCCCCCCCC,nope");
  assert.deepEqual(r.items.map((i) => i.title), ["Alpha", "Gamma"]);
});

test("create, update and delete round-trip through the vault", async () => {
  const d = await fixture();
  const made = await d.createPage({ kind: "note", title: "Zeta", body: "new", tags: ["fresh"] });
  assert.equal(made.title, "Zeta");
  assert.equal(made.path, "notes/Zeta.md");
  const edited = await d.updatePage(made.id, { body: "changed", title: "Zeta II" });
  assert.equal(edited.title, "Zeta II");
  // The file follows the title, so `[[Zeta II]]` resolves and the old name is
  // freed rather than kept forever.
  assert.equal(edited.path, "notes/Zeta II.md");
  assert.equal(await d.v.be.exists("notes/Zeta.md"), false);
  assert.equal((await d.page(made.id)).body, "changed");
  const gone = await d.deletePage(made.id);
  assert.ok(gone.ok);
  assert.equal(await d.page(made.id), null);
  assert.ok(await d.v.be.exists(".trash/notes/Zeta II.md"));
});

test("about-me reads context/about-me.md", async () => {
  const d = await fixture();
  assert.match((await d.aboutMe()).body, /restrained/);
});

test("dashboard runs off the index", async () => {
  const d = await fixture();
  const dash = await d.dashboard();
  assert.equal(dash.stats.pages_total, 6);
  assert.ok(dash.obsessions.some((o) => o.title === "cartography"));
});

test("6.8 the path routers cover every surviving endpoint", async () => {
  const d = await fixture();
  const ok = [
    "counts", "tags", "dashboard", "about-me", "mentions/suggest?q=a",
    "pages", "pages?limit=2", "pages?kind=topic", "pages?tag=cartography",
    "pages?q=alpha", "pages?mention=01BBBBBBBBBBBBBBBBBBBBBBBB",
    "pages/batch?ids=01AAAAAAAAAAAAAAAAAAAAAAAA",
    "pages/01AAAAAAAAAAAAAAAAAAAAAAAA",
    "export/01AAAAAAAAAAAAAAAAAAAAAAAA",
  ];
  for (const p of ok) assert.ok(await d.get(p) !== undefined, p);
  assert.match((await d.post("render/markdown", { md: "hi" })).html, /<p>hi<\/p>/);
});

test("6.8 removed endpoints fail loudly instead of silently returning nothing", async () => {
  const d = await fixture();
  for (const p of ["graph?mode=x", "settings", "voice/profile", "export/resume", "export/all"]) {
    await assert.rejects(() => d.get(p), /no local implementation/, p);
  }
  for (const p of ["chat/page", "links/fetch", "import/notion", "backup/run"]) {
    await assert.rejects(() => d.post(p, {}), /no local implementation/, p);
  }
});

test("6.3 a changed-on-disk edit returns a conflict, and force keeps both versions", async () => {
  const d = await fixture();
  const id = "01AAAAAAAAAAAAAAAAAAAAAAAA";
  // Obsidian edits the file behind our back
  await d.v.be.writeText("notes/Alpha.md",
    md(P(id, { title: "Alpha", updated: TS(30) }), "edited in obsidian"));
  const refused = await d.updatePage(id, { body: "mine" });
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, "conflict");
  assert.match(await d.v.be.readText("notes/Alpha.md"), /obsidian/, "their work must survive");

  const forced = await d.updatePage(id, { body: "mine", force: true });
  assert.ok(forced && forced.ok !== false, "force must succeed");
  assert.match(await d.v.be.readText("notes/Alpha.md"), /mine/);
  const copies = [...d.v.be.files.keys()].filter((p) => p.includes("(conflict"));
  assert.equal(copies.length, 1, `disk version must be preserved: ${copies}`);
  assert.match(await d.v.be.readText(copies[0]), /obsidian/);
});

test("6.2 an app edit is visible to any other reader of the file", async () => {
  const d = await fixture();
  const id = "01CCCCCCCCCCCCCCCCCCCCCCCC";
  await d.updatePage(id, { body: "written through put()" });
  // read the raw bytes the way Obsidian would
  const raw = await d.v.be.readText("topics/Gamma.md");
  assert.match(raw, /written through put\(\)/);
  assert.match(raw, /^---\nid: 01CCCCCCCCCCCCCCCCCCCCCCCC$/m, "frontmatter intact");
  assert.equal((await d.v.be.listDir(`.history/${id}`)).length, 1, "history snapshot taken");
});

test("list results are marked as carrying an excerpt, not a full body", async () => {
  const d = await fixture();
  const listed = (await d.pages({ q: "beta" })).items[0];
  assert.equal(listed.bodyIsFull, false, "a list result must declare its body is partial");
  const full = await d.page("01BBBBBBBBBBBBBBBBBBBBBBBB");
  assert.equal(full.bodyIsFull, true);
  assert.ok(full.body.length > listed.body.length,
    "and the full body must actually be longer than the excerpt");
});

test("a body longer than the excerpt keeps its section headings", async () => {
  // The excerpt is whitespace-collapsed, so a '## Thread' inside it stops being
  // a heading. This is what made long threads vanish from the page view.
  const long = "Intro paragraph.\n\n" + "filler ".repeat(60) + "\n\n## Thread\n\n**user** 2026-01-01\nhi";
  const be = new MemoryBackend({
    "topics/T.md": md(P("01TTTTTTTTTTTTTTTTTTTTTTTT", { kind: "topic", title: "T" }), long),
  });
  const v = new Vault(be, { now: () => TS(30) });
  await v.buildIndex();
  const d = new Data(v);
  const listed = (await d.pages({})).items[0];
  const full = await d.page("01TTTTTTTTTTTTTTTTTTTTTTTT");
  assert.ok(!/^## Thread$/m.test(listed.body), "the excerpt cannot carry the heading");
  assert.match(full.body, /^## Thread$/m, "the full body must");
});

// ── Boards must reach the view ───────────────────────────────────────────
// Found in a browser: a canvas page's `.canvas` sibling was attached only for
// the *bare* case, so an ordinary two-file board rendered empty. SPEC §10 asks
// for read-only boards, which is not the same as no boards.
test("layoutFromCanvas inverts the migration's node mapping", () => {
  const canvas = JSON.stringify({
    nodes: [
      { id: "n1", type: "text", text: "foil vs twin-tip", x: 0, y: 0, width: 240, height: 120 },
      { id: "n2", type: "link", url: "https://example.com/k", x: 300, y: 0, width: 300, height: 160 },
      { id: "n3", type: "file", file: "attachments/kite.png", x: 0, y: 200, width: 200, height: 200 },
    ],
    edges: [],
  });
  const l = layoutFromCanvas(canvas);
  assert.deepEqual(l.map((i) => i.type), ["text", "link", "image"]);
  assert.equal(l[0].text, "foil vs twin-tip");
  assert.equal(l[1].url, "https://example.com/k");
  assert.equal(l[2].asset, "attachments/kite.png");
  assert.deepEqual(
    l.map((i) => [i.x, i.y, i.w, i.h]),
    [[0, 0, 240, 120], [300, 0, 300, 160], [0, 200, 200, 200]]);
});

test("a malformed .canvas yields an empty board, never a crash", () => {
  assert.deepEqual(layoutFromCanvas("{not json"), []);
  assert.deepEqual(layoutFromCanvas("{}"), []);
});

// ── Edges ────────────────────────────────────────────────────────────────
// Nodes alone made a board look like a pile of unrelated cards: every arrow
// drawn in Obsidian was parsed away and never reached the view.
test("edgesFromCanvas keeps endpoints, sides, ends, color and label", () => {
  const e = edgesFromCanvas(JSON.stringify({
    nodes: [],
    edges: [{
      id: "e1", fromNode: "n1", fromSide: "right", toNode: "n2", toSide: "left",
      color: "4", label: "supersedes",
    }],
  }));
  assert.equal(e.length, 1);
  assert.deepEqual(e[0], {
    id: "e1", fromNode: "n1", toNode: "n2",
    fromSide: "right", toSide: "left",
    fromEnd: "none", toEnd: "arrow",
    color: "4", label: "supersedes",
  });
});

test("edge ends follow the JSON Canvas defaults", () => {
  const [plain] = edgesFromCanvas(JSON.stringify({
    edges: [{ id: "e", fromNode: "a", toNode: "b" }],
  }));
  // An edge points at its target unless told otherwise.
  assert.equal(plain.toEnd, "arrow");
  assert.equal(plain.fromEnd, "none");

  const [both] = edgesFromCanvas(JSON.stringify({
    edges: [{ id: "e", fromNode: "a", toNode: "b", fromEnd: "arrow", toEnd: "none" }],
  }));
  assert.equal(both.fromEnd, "arrow");
  assert.equal(both.toEnd, "none");
});

test("an omitted or bogus side is null, so the renderer picks the facing one", () => {
  const [e] = edgesFromCanvas(JSON.stringify({
    edges: [{ id: "e", fromNode: "a", toNode: "b", toSide: "sideways" }],
  }));
  assert.equal(e.fromSide, null);
  assert.equal(e.toSide, null);
});

test("an edge missing an endpoint is dropped, not drawn from nowhere", () => {
  const e = edgesFromCanvas(JSON.stringify({
    edges: [
      { id: "ok", fromNode: "a", toNode: "b" },
      { id: "no-to", fromNode: "a" },
      { id: "no-from", toNode: "b" },
      null,
    ],
  }));
  assert.deepEqual(e.map((x) => x.id), ["ok"]);
});

test("a malformed .canvas yields no edges, never a crash", () => {
  assert.deepEqual(edgesFromCanvas("{not json"), []);
  assert.deepEqual(edgesFromCanvas("{}"), []);
  assert.deepEqual(edgesFromCanvas(JSON.stringify({ nodes: [] })), []);
});

// ── Edge geometry ────────────────────────────────────────────────────────
// Pure math, kept out of the DOM so it can be checked here rather than by eye.
const BOX = (x, y, w = 200, h = 100) => ({ x, y, w, h });

test("facingSide picks the side pointing at the other box", () => {
  const origin = BOX(0, 0);
  assert.equal(facingSide(origin, BOX(400, 0)), "right");
  assert.equal(facingSide(origin, BOX(-400, 0)), "left");
  assert.equal(facingSide(origin, BOX(0, 400)), "bottom");
  assert.equal(facingSide(origin, BOX(0, -400)), "top");
});

test("an anchor sits on its box edge, not at the corner or the centre", () => {
  const g = edgeGeometry(
    { fromSide: "right", toSide: "left", toEnd: "arrow", fromEnd: "none" },
    BOX(0, 0), BOX(400, 0));
  // right edge of a 200x100 box at the origin → (200, 50)
  assert.deepEqual([g.from.x, g.from.y], [200, 50]);
  // left edge of the far box → (400, 50)
  assert.deepEqual([g.to.x, g.to.y], [400, 50]);
  assert.match(g.d, /^M 200 50 C /);
});

test("omitted sides fall back to the facing pair", () => {
  const g = edgeGeometry(
    { fromSide: null, toSide: null, toEnd: "arrow", fromEnd: "none" },
    BOX(0, 0), BOX(0, 400));
  assert.equal(g.fromSide, "bottom");
  assert.equal(g.toSide, "top");
});

test("negative coordinates survive — Obsidian boards routinely sit left of 0", () => {
  const g = edgeGeometry(
    { fromSide: "right", toSide: "left", toEnd: "arrow", fromEnd: "none" },
    BOX(-800, -600), BOX(-300, -600));
  assert.deepEqual([g.from.x, g.from.y], [-600, -550]);
  assert.deepEqual([g.to.x, g.to.y], [-300, -550]);
});

test("arrowheads follow fromEnd/toEnd, not the edge's existence", () => {
  const boxes = [BOX(0, 0), BOX(400, 0)];
  const heads = (e) => edgeGeometry(e, ...boxes).arrows.length;
  assert.equal(heads({ toEnd: "arrow", fromEnd: "none" }), 1);
  assert.equal(heads({ toEnd: "arrow", fromEnd: "arrow" }), 2);
  assert.equal(heads({ toEnd: "none", fromEnd: "none" }), 0);
});

test("a label lands between the two boxes, never on top of either", () => {
  const g = edgeGeometry(
    { fromSide: "right", toSide: "left", toEnd: "arrow", fromEnd: "none", label: "cites" },
    BOX(0, 0), BOX(600, 0));
  assert.equal(g.label.text, "cites");
  assert.ok(g.label.x > 200 && g.label.x < 600, `label at x=${g.label.x} is inside a card`);
});

test("no label means no label object to draw", () => {
  const g = edgeGeometry({ toEnd: "arrow", fromEnd: "none", label: "" }, BOX(0, 0), BOX(400, 0));
  assert.equal(g.label, null);
});

test("an edge with a missing box yields nothing to draw", () => {
  const e = { toEnd: "arrow", fromEnd: "none" };
  assert.equal(edgeGeometry(e, undefined, BOX(0, 0)), null);
  assert.equal(edgeGeometry(e, BOX(0, 0), undefined), null);
});

test("a canvas page carries its edges into meta.edges", async () => {
  const be = new MemoryBackend({
    "canvas/Wired.md":
      "---\nid: 01EEEEEEEEEEEEEEEEEEEEEEEE\nkind: canvas\ntitle: Wired\n"
      + "created: 2026-07-01T00:00:00+00:00\nupdated: 2026-07-01T00:00:00+00:00\n---\n\n![[Wired.canvas]]\n",
    "canvas/Wired.canvas": JSON.stringify({
      nodes: [
        { id: "n1", type: "text", text: "a", x: 0, y: 0, width: 200, height: 100 },
        { id: "n2", type: "text", text: "b", x: 400, y: 0, width: 200, height: 100 },
      ],
      edges: [{ id: "e1", fromNode: "n1", toNode: "n2" }],
    }),
  });
  const v = new Vault(be); await v.buildIndex();
  const d = new Data(v, { renderMarkdown: (m) => m });
  const p = await d.page("01EEEEEEEEEEEEEEEEEEEEEEEE");
  assert.ok(Array.isArray(p.meta.edges), "the connections never reached the view");
  assert.equal(p.meta.edges.length, 1);
  assert.equal(p.meta.edges[0].fromNode, "n1");
  // The nodes must still be there — edges are an addition, not a replacement.
  assert.equal(p.meta.layout.length, 2);
});

test("a two-file canvas page carries its board into meta.layout", async () => {
  const be = new MemoryBackend({
    "canvas/Board.md":
      "---\nid: 01DDDDDDDDDDDDDDDDDDDDDDDD\nkind: canvas\ntitle: Board\n"
      + "created: 2026-07-01T00:00:00+00:00\nupdated: 2026-07-01T00:00:00+00:00\n---\n\n![[Board.canvas]]\n",
    "canvas/Board.canvas": JSON.stringify({
      nodes: [{ id: "n1", type: "text", text: "hello", x: 1, y: 2, width: 3, height: 4 }], edges: [],
    }),
  });
  const v = new Vault(be); await v.buildIndex();
  const d = new Data(v, { renderMarkdown: (m) => m });
  const p = await d.page("01DDDDDDDDDDDDDDDDDDDDDDDD");
  assert.ok(Array.isArray(p.meta.layout), "the board never reached the view");
  assert.equal(p.meta.layout.length, 1);
  assert.equal(p.meta.layout[0].text, "hello");
});

// ── Projects are folders, not a kind ─────────────────────────────────────
// The screen asked for `kind: "project"`, which nothing can ever be, so it
// reported an empty vault however many projects were on disk — and its "+ new
// project" button wrote notes/<Title>.md carrying `kind: project`.
function projectVault() {
  const pg = (id, title) =>
    `---\nid: ${id}\nkind: note\ntitle: ${title}\n`
    + `created: 2026-07-01T00:00:00+00:00\nupdated: 2026-07-02T00:00:00+00:00\n---\n\nBody of ${title}.\n`;
  return new MemoryBackend({
    "notes/Loose.md": pg("01LLLLLLLLLLLLLLLLLLLLLLLL", "Loose"),
    "projects/Kite Build/Kite Build.md": pg("01PPPPPPPPPPPPPPPPPPPPPPPP", "Kite Build"),
    "projects/Kite Build/Spars.md": pg("01QQQQQQQQQQQQQQQQQQQQQQQQ", "Spars"),
    "projects/Kite Build/Lines.md": pg("01RRRRRRRRRRRRRRRRRRRRRRRR", "Lines"),
  });
}

test("projects are derived from folders under projects/", async () => {
  const v = new Vault(projectVault()); await v.buildIndex();
  const d = new Data(v, { renderMarkdown: (m) => m });
  const { items, count } = await d.projects();
  assert.equal(count, 1);
  assert.equal(items[0].title, "Kite Build");
  assert.equal(items[0].id, "01PPPPPPPPPPPPPPPPPPPPPPPP", "the folder note supplies the id");
  assert.equal(items[0].memberCount, 2, "the folder note is not its own member");
  assert.deepEqual(items[0].members.map((m) => m.title).sort(), ["Lines", "Spars"]);
});

test("creating a project writes projects/<Title>/<Title>.md", async () => {
  const be = projectVault();
  const v = new Vault(be); await v.buildIndex();
  const d = new Data(v, { renderMarkdown: (m) => m });
  const p = await d.createProject("Second Kite");
  assert.equal(p.path, "projects/Second Kite/Second Kite.md");
  assert.equal(p.kind, "note", "project is a folder, not a kind");
  assert.equal((await d.projects()).count, 2);
});

test("createPage refuses a kind that does not exist", async () => {
  const v = new Vault(projectVault()); await v.buildIndex();
  const d = new Data(v, { renderMarkdown: (m) => m });
  const r = await d.createPage({ kind: "project", title: "Nope", body: "" });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "unknown-kind");
  assert.equal(await v.be.exists("notes/Nope.md"), false, "must not mis-file it into notes/");
});
