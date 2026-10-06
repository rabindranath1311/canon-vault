// Record what the JS data layer does, so any other implementation can be held
// to it.
//
// A second implementation of a file format is a second chance to write a file
// Obsidian, the web app or an agent reads differently — so a port's tests
// should not assert what the format *should* do, but what this code *does*,
// byte for byte, over a shared corpus:
//
//     conformance/cases/files/*.md   one file each, every edge we know of
//     conformance/cases/vault/**     a small vault: collisions, aliases, ids
//     conformance/cases/writes.json  the write path (Vault), op by op
//     conformance/cases/pure.json    naming, the tray, walls, captures, the
//                                    dashboard and the scaffold — input lists
//     conformance/cases/pages.json   the Data class — create, update, rename,
//                                    trash, problems — op by op
//     demo/**                        the demo vault, as it ships
//
// and write the answers to conformance/expected/*.json. A function that
// throws is recorded with its message: a throw is an answer too.
//
//     node scripts/export-conformance.mjs          # write
//     node scripts/export-conformance.mjs --check  # exit 1 if stale
//
// Invented content only — the same rule as demo/. See CLAUDE.md.

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parse, serialize, escapeUser, unescapeUser, roundtripOk, BLOCK_LISTS,
} from "../app/vault/mdfile.js";
import { splitSections, parseSections, joinBody } from "../app/vault/sections.js";
import { findWikilinks, maskCode, linkResolver, basenameOf } from "../app/vault/links.js";
import {
  Vault, MemoryBackend, extractInlineTags, inferKind, titleFromPath,
} from "../app/vault/vault.js";
import { stripExcalidrawData, textOfExcalidraw, isExcalidrawPath } from "../app/vault/excalidraw.js";
import { Data, pageStem, stemFor, suggestStem, renamePlan, tagSlug } from "../app/vault/data.js";
import {
  typeFor, serializeAttachments, parseAttachments, writeAttachments,
} from "../app/vault/attachments.js";
import { parseInspoBody, serializeInspoBody, inspoTags } from "../app/vault/inspo.js";
import {
  safeUrl, canonicalUrl, oneLine, safeCaption, normalizeMentions, mentionLine, normalizeTags,
  safeStem, attachmentName, captureToItem, itemKey, addItemToWall, captureToBookmark,
  urlsFromText, titleFromUrl, bookmarkBody, captureToQuote, noteBody, captureToNote,
  captureToBlock, clipFrontmatter, wallPath, targetFor, findByUrl, applyCapture,
} from "../app/vault/clip.js";
import { computeDashboard } from "../app/vault/dashboard.js";
import {
  assessFolder, scaffold, expectedEntries, CONVENTION_VERSION, VAULT_DIRS,
} from "../app/vault/scaffold.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CASES = join(ROOT, "conformance", "cases");
const OUT_DIR = join(ROOT, "conformance", "expected");

/** Every file under `dir`, as POSIX paths relative to it, sorted. */
function walk(dir) {
  const out = [];
  (function go(d) {
    for (const entry of readdirSync(d).sort()) {
      if (entry.startsWith(".")) continue;
      const p = join(d, entry);
      statSync(p).isDirectory() ? go(p) : out.push(relative(dir, p).split(sep).join("/"));
    }
  })(dir);
  return out.sort();
}

/** Frontmatter as ordered pairs: key order is part of the format. */
function frontmatterOut(fm) {
  const blocks = fm[BLOCK_LISTS] || {};
  return {
    pairs: Object.keys(fm).map((k) => [k, fm[k]]),
    blockLists: Object.fromEntries(Object.entries(blocks)
      .map(([k, v]) => [k, { text: v.text, values: v.values }])),
  };
}

function fileCase(name, text, path) {
  const [fm, body] = parse(text);
  let serialized;
  try { serialized = { ok: serialize(fm, body) }; }
  catch (e) { serialized = { error: e.message }; }
  const split = splitSections(body);
  return {
    name,
    text,
    parse: { frontmatter: frontmatterOut(fm), body },
    serialize: serialized,
    roundtrip: roundtripOk(text),
    escape: escapeUser(body),
    escapeStrict: escapeUser(body, true),
    unescape: unescapeUser(body),
    split,
    join: joinBody(split.prose, split.sections),
    sections: parseSections(split.sections),
    maskCode: maskCode(body),
    wikilinks: findWikilinks(body),
    inlineTags: extractInlineTags(body),
    kind: inferKind(path),
    titleFromPath: titleFromPath(path),
    basename: basenameOf(path),
    excalidraw: isExcalidrawPath(path)
      ? { stripped: stripExcalidrawData(body), text: textOfExcalidraw(body) } : null,
  };
}

function filesExpected() {
  const cases = [];
  const dir = join(CASES, "files");
  for (const f of walk(dir)) {
    cases.push(fileCase(`files/${f}`, readFileSync(join(dir, f), "utf8"), `notes/${f}`));
  }
  const demo = join(ROOT, "demo");
  for (const f of walk(demo).filter((p) => p.endsWith(".md"))) {
    cases.push(fileCase(`demo/${f}`, readFileSync(join(demo, f), "utf8"), f));
  }
  return { cases };
}

/** The index a Vault builds over a folder, and how links resolve inside it. */
async function vaultExpected(dir, targets) {
  const files = {};
  for (const f of walk(dir)) files[f] = readFileSync(join(dir, f), "utf8");
  const be = new MemoryBackend(files);
  const v = new Vault(be, { now: () => "2026-10-05T12:00:00+00:00" });
  await v.buildIndex();
  const entries = v.list()
    .map((e) => ({
      id: e.id, kind: e.kind, path: e.path, title: e.title, tags: e.tags,
      aliases: e.aliases, mentions: e.mentions, excerpt: e.excerpt,
      sceneText: e.sceneText ?? "", url: e.url ?? null, parent: e.parent,
      children: e.children, updated: e.updated, stamped: e.stamped,
      unparseable: e.unparseable,
    }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const resolve = linkResolver(v.list());
  const allTargets = [...new Set([
    ...targets,
    ...v.list().flatMap((e) => e.mentions),
  ])].sort();
  return {
    listOrder: (await be.listAll()).map((f) => f.path),
    entries,
    reservedNames: [...v.reservedNames].sort(),
    warnings: v.warnings,
    problems: v.problems.map(({ text, ...rest }) => ({ ...rest, text })),
    resolutions: allTargets.map((t) => [t, resolve(t)?.path ?? null]),
  };
}

/** Every file in a memory backend — `.history/` and `.trash/` included — with
 *  the backend clock that wrote it, so a write the other side makes one time
 *  too many (or too few) shows up as a moved mtime. */
function treeOf(be) {
  const decode = (b) => new TextDecoder().decode(b);
  return Object.fromEntries([...be.files.keys()].sort()
    .map((p) => [p, { mtime: be.files.get(p).mtime, text: decode(be.files.get(p).data) }]));
}

/** What the vault's write path does, op by op: conformance/cases/writes.json. */
async function writesExpected() {
  const spec = JSON.parse(readFileSync(join(CASES, "writes.json"), "utf8"));
  const scenarios = [];
  for (const sc of spec.scenarios) {
    const be = new MemoryBackend(Object.fromEntries(sc.files));
    let now = sc.now;
    let minted = 0;
    const v = new Vault(be, {
      now: () => now,
      historyKeep: sc.historyKeep,
      newId: () => "01KZ" + String(++minted).padStart(22, "0"),
    });
    await v.buildIndex();
    const labels = {};
    const idOf = (path) => v.byPath.get(path)?.id ?? "missing";
    const steps = [];
    for (const op of sc.ops) {
      now = op.now || sc.now;
      let result = null;
      switch (op.op) {
        case "get": {
          const p = await v.get(idOf(op.path));
          labels[op.as] = p;
          result = p && { id: p.id, path: p.path, title: p.title, body: p.body,
                          sections: p.sections, updated: p.updated, mtime: p.mtime, raw: p.raw };
          break;
        }
        case "put": {
          const page = { ...op.page };
          if (op.frontmatterFrom) {
            page.frontmatter = { ...labels[op.frontmatterFrom].frontmatter };
            for (const [k, value] of op.set || []) page.frontmatter[k] = value;
          }
          if (op.baseFrom) {
            const read = labels[op.baseFrom];
            page.base = { mtime: read.mtime, updated: read.updated };
          }
          result = await v.put(page);
          break;
        }
        case "external": await be.writeText(op.path, op.text); break;
        case "rescan": {
          const r = await v.watchExternal();
          result = { created: r.created, removed: r.removed, changed: r.changed, warnings: r.warnings };
          break;
        }
        case "history": result = await v.history(idOf(op.path)); break;
        case "readHistory": {
          const r = await v.readHistory(op.snapshot);
          result = r.ok ? { ok: true, text: r.text, body: r.body, sections: r.sections } : r;
          break;
        }
        case "rename": result = await v.rename(idOf(op.path), op.to); break;
        case "del":
          result = await v.del(idOf(op.path));
          if (op.as) labels[op.as] = result;
          break;
        case "untrash": {
          const d = labels[op.from];
          result = await v.untrash({ trashed: d.trashed, trashedCanvas: d.trashedCanvas,
                                     path: op.path, canvasPath: op.canvasPath });
          break;
        }
        case "writeBlob": result = await v.writeBlob(op.path, new TextEncoder().encode(op.text)); break;
        default: throw new Error(`writes.json: unknown op ${op.op}`);
      }
      steps.push({ op: op.op, result, files: treeOf(be) });
    }
    scenarios.push({ name: sc.name, steps });
  }
  return { scenarios };
}

// ── the pure half: conformance/cases/pure.json ──────────────────────────────

/** What a call returned, or the message it threw — a throw is an answer too. */
function attempt(f) {
  try { return { out: f() }; } catch (e) { return { error: e.message }; }
}

/** An object's own keys in order, as `[key, value]` — for plain objects whose
 *  key order is the answer (a capture's frontmatter). */
const pairs = (o) => Object.entries(o || {});

const attachmentOut = (a) => ({ type: a.type, title: a.title, source: a.source, body: a.body, url: a.url ?? null });

/** A capture plan — the `createPage` arguments a capture becomes. */
const planOut = (p) => p && {
  kind: p.kind, title: p.title, tags: p.tags, frontmatter: pairs(p.frontmatter), body: p.body,
};

async function pureExpected() {
  const spec = JSON.parse(readFileSync(join(CASES, "pure.json"), "utf8"));
  const map = (inputs, f) => inputs.map((input) => ({ input, ...attempt(() => f(input)) }));

  // Naming answers that need a vault use the small one under cases/vault.
  const files = {};
  for (const f of walk(join(CASES, "vault"))) files[f] = readFileSync(join(CASES, "vault", f), "utf8");
  const v = new Vault(new MemoryBackend(files), { now: () => "2026-10-05T12:00:00+00:00" });
  await v.buildIndex();
  const n = spec.naming;
  const naming = {
    stemFor: map(n.stemFor, stemFor),
    pageStem: map(n.pageStem, pageStem),
    tagSlug: map(n.tagSlug, tagSlug),
    suggestStem: [...v.byPath.keys(), ...v.reservedNames]
      .map((path) => ({ input: path, out: suggestStem(v, path, v.byPath.get(path) || null) })),
    renamePlan: map(n.renamePlans, ({ path, title }) => renamePlan(v, v.byPath.get(path), title)),
    // A title that no longer matches the file, so only DEFAULT_STEM can say yes.
    defaultStem: map(n.defaultStems, ({ path, title }) =>
      renamePlan(v, { path, title: "An unrelated old title" }, title)),
    problems: new Data(v).vaultProblems(),
  };

  const a = spec.attachments;
  const attachments = {
    typeFor: map(a.typeFor, ([s, u]) => typeFor(s, u)),
    serialize: map(a.serialize, serializeAttachments),
    parse: map(a.parse, (body) => parseAttachments(body).map(attachmentOut)),
    write: map(a.write, ([sections, list]) => writeAttachments(sections, list)),
  };

  const inspo = map(spec.inspo, (body) => {
    const model = parseInspoBody(body);
    return { model, serialized: serializeInspoBody(model), tags: inspoTags(model) };
  });

  const c = spec.capture;
  const capture = {
    safeUrl: map(c.safeUrl, safeUrl),
    canonicalUrl: map(c.canonicalUrl, canonicalUrl),
    oneLine: map(c.oneLine, ([t, max]) => (max == null ? oneLine(t) : oneLine(t, max))),
    safeCaption: map(c.safeCaption, (t) => safeCaption(t)),
    normalizeMentions: map(c.normalizeMentions, normalizeMentions),
    mentionLine: map(c.normalizeMentions, mentionLine),
    normalizeTags: map(c.normalizeTags, normalizeTags),
    safeStem: map(c.safeStem, ([t, max]) => (max == null ? safeStem(t) : safeStem(t, max))),
    attachmentName: map(c.attachmentName, attachmentName),
    titleFromUrl: map(c.titleFromUrl, titleFromUrl),
    urlsFromText: map(c.urlsFromText, urlsFromText),
    clipFrontmatter: map(c.clipFrontmatter, (fm) => pairs(clipFrontmatter(fm))),
    wallPath: map(c.wallPath, wallPath),
    walls: map(c.walls, ({ body, item, group, dedupe }) =>
      addItemToWall(body, item, { group, ...(dedupe === false && { dedupe: false }) })),
    // Every capture through every rule, with and without an asset on disk.
    captures: c.captures.map((capture) => ({
      input: capture,
      bookmark: attempt(() => planOut(captureToBookmark(capture))),
      quote: attempt(() => planOut(captureToQuote(capture))),
      bookmarkBody: attempt(() => bookmarkBody(capture)),
      targets: c.settings.map((s) => targetFor(capture, s)),
      byAsset: c.assetPaths.map((asset) => {
        const item = attempt(() => captureToItem(capture, asset));
        return {
          asset,
          item,
          itemKey: item.out ? itemKey(item.out) : null,
          note: attempt(() => planOut(captureToNote(capture, asset))),
          noteBody: attempt(() => noteBody(capture, asset)),
          noteBodyBare: attempt(() => noteBody(capture, asset, { withSource: false })),
          block: attempt(() => captureToBlock(capture, asset)),
        };
      }),
    })),
    findByUrl: map(["https://example.com/a", "https://www.example.com/a?utm_source=x", "https://nowhere.example/"],
      (url) => findByUrl(v, url)?.path ?? null),
  };

  const fixture = JSON.parse(readFileSync(join(ROOT, spec.dashboard.fixture), "utf8"));
  const dashboard = [fixture, ...spec.dashboard.lists]
    .map(({ now, pages }) => ({ now, out: computeDashboard(pages, new Date(now)) }));

  const s = spec.scaffold;
  const runs = [];
  for (const run of s.runs) {
    const be = new MemoryBackend(Object.fromEntries(run.files));
    let tick = 0;
    const r = await scaffold(be, {
      confirmed: run.confirmed,
      // A clock that moves on every call, so the order of the calls is checked too.
      now: () => `2026-10-06T09:00:${String(tick++).padStart(2, "0")}+00:00`,
    });
    runs.push({ name: run.name, result: r, files: treeOf(be) });
  }
  const scaffoldOut = {
    version: CONVENTION_VERSION,
    dirs: VAULT_DIRS,
    expectedEntries: expectedEntries(),
    assess: map(s.assess, (paths) => assessFolder(paths.map((path) => ({ path, mtime: 1 })))),
    runs,
  };

  return { naming, attachments, inspo, capture, dashboard, scaffold: scaffoldOut };
}

// ── the Data class: conformance/cases/pages.json ────────────────────────────

/** A page as the Data class hands one out (`pageOut`), minus what a port need
 *  not carry: `meta.layout` (the `.canvas` import) and `meta.excalidraw` (the
 *  scene, which boards.json covers). */
const pageJSON = (p) => p && {
  id: p.id, slug: p.slug, kind: p.kind, title: p.title, url: p.url ?? null,
  frontmatter: p.frontmatter ? frontmatterOut(p.frontmatter) : null,
  created: p.created ?? null, updated: p.updated ?? null,
  tags: p.tags, mentions: p.mentions, aliases: p.aliases,
  path: p.path, mtime: p.mtime, excerpt: p.excerpt, sceneText: p.sceneText ?? null,
  body: p.body, bodyIsFull: p.bodyIsFull, stamped: p.stamped, unparseable: p.unparseable,
  sections: p.sections ?? null,
  meta: {
    parent: p.meta.parent ?? null,
    children: p.meta.children ?? null,
    attachments: p.meta.attachments ? p.meta.attachments.map(attachmentOut) : null,
    url: "url" in p.meta ? p.meta.url : null,
    og: p.meta.og ?? null,
    links: p.meta.links ?? null,
  },
};

/** A refusal as it is, anything else as the page it is. */
const outcome = (r) => (r && r.ok === false ? r : pageJSON(r));

const projectJSON = (p) => ({
  id: p.id, name: p.name, title: p.title, path: p.path, notePath: p.notePath, excerpt: p.excerpt,
  updated: p.updated, memberCount: p.memberCount,
  members: p.members.map(pageJSON), inside: p.inside.map(pageJSON),
});

/** What the Data class does, op by op, to an in-memory vault. */
async function pagesExpected() {
  const spec = JSON.parse(readFileSync(join(CASES, "pages.json"), "utf8"));
  const scenarios = [];
  for (const sc of spec.scenarios) {
    const files = {};
    if (sc.filesFrom) {
      for (const f of walk(join(ROOT, sc.filesFrom))) files[f] = readFileSync(join(ROOT, sc.filesFrom, f), "utf8");
    }
    for (const [p, text] of sc.files || []) files[p] = text;
    const be = new MemoryBackend(files);
    let now = sc.now;
    let minted = 0;
    const v = new Vault(be, {
      now: () => now,
      historyKeep: sc.historyKeep,
      newId: () => "01KZ" + String(++minted).padStart(22, "0"),
    });
    await v.buildIndex();
    const d = new Data(v, { now: () => new Date(sc.dataNow) });
    const labels = {};
    const idOf = (path) => v.byPath.get(path)?.id ?? "missing";
    const fill = (text) => text.replace(/\{\{id:([^}]+)\}\}/g, (_, p) => idOf(p));
    const patchOf = (op) => {
      const patch = JSON.parse(fill(op.patch));
      if (op.baseFrom) {
        const read = labels[op.baseFrom];
        patch.base = { mtime: read.mtime, updated: read.updated };
      }
      return patch;
    };

    const run = async (op) => {
      switch (op.op) {
        case "page": {
          const p = await d.page(idOf(op.path));
          if (op.as) labels[op.as] = p;
          return pageJSON(p);
        }
        case "pages":
          return d.pages({
            q: op.query || "", kind: op.kind || "", tag: op.tag || "",
            mention: op.mention ? fill(op.mention) : "", limit: op.limit ?? 200,
          }).items.map(pageJSON);
        case "search": return (await d.searchFullText(op.q, { limit: op.limit ?? 50 })).items.map(pageJSON);
        case "backlinks": return d.backlinks(idOf(op.path)).items.map(pageJSON);
        case "orbit": {
          const o = d.orbit(idOf(op.path));
          return { items: o.items.map((i) => ({ page: pageJSON(i), via: i.via })), tag: o.tag };
        }
        case "projects": return (await d.projects()).items.map(projectJSON);
        case "projectMembers": return d.projectMembers(op.name).items.map(pageJSON);
        case "tags": return d.tags().tags;
        case "suggest": return d.suggestMentions(op.q, op.limit ?? 8).items;
        case "aboutMe": return await d.aboutMe();
        case "updateAboutMe": return outcome(await d.updateAboutMe(patchOf(op)));
        case "dashboard": return d.dashboard();
        case "create": return outcome(await d.createPage(JSON.parse(fill(JSON.stringify(op.page)))));
        case "update": return outcome(await d.updatePage(idOf(op.path), patchOf(op)));
        case "delete": {
          const r = await d.deletePage(idOf(op.path));
          if (op.as) labels[op.as] = r;
          return r;
        }
        case "restore": return await d.restorePage(labels[op.from]);
        case "createTag": return await d.createTag(op.name);
        case "createProject": return outcome(await d.createProject(op.title));
        case "addBookmarks": {
          const r = await d.addBookmarks(op.text, { tags: op.tags || [], project: op.project || null });
          return { added: r.added.map(pageJSON), duplicates: r.duplicates.map(pageJSON), found: r.found };
        }
        case "problems": return d.vaultProblems();
        case "renameFile": return await d.renameFile(op.path, op.stem);
        case "newIdFor": return await d.newIdFor(op.path);
        case "retitle": return await d.retitle(op.path, op.title);
        case "writeAsset": {
          const bytes = new TextEncoder().encode(op.text);
          const r = await d.writeAsset({ name: op.name, arrayBuffer: async () => bytes.buffer });
          return r.ok === false ? r : { path: r.path, name: r.name, bytes: r.bytes };
        }
        case "exportPage": return await d.exportPage(idOf(op.path));
        case "history": return await d.pageHistory(idOf(op.path));
        case "readSnapshot": {
          const r = await d.readSnapshot(op.snapshot);
          return r.ok
            ? { ok: true, text: r.text, body: r.body, sections: r.sections, attachments: r.attachments.map(attachmentOut) }
            : r;
        }
        case "capture": {
          const capture = JSON.parse(fill(JSON.stringify(op.capture)));
          // Picture bytes ride in the case file as text.
          if (capture.blobText != null) capture.blob = new Blob([capture.blobText]);
          const assets = [];
          const r = await applyCapture(d, v, capture, {
            settings: op.settings || {}, onAsset: async (path) => { assets.push(path); },
          });
          return { ...r, onAsset: assets };
        }
        case "external": await be.writeText(op.path, op.text); return null;
        case "rescan": {
          const r = await v.watchExternal();
          return { created: r.created, removed: r.removed, changed: r.changed, warnings: r.warnings };
        }
        default: throw new Error(`pages.json: unknown op ${op.op}`);
      }
    };

    // The tree after each op, as what changed since the op before: every file
    // written (bytes and clock) and every file gone. Replayed from `initial`,
    // that is the whole tree after every op, at a fraction of the size.
    const initial = treeOf(be);
    let before = initial;
    const steps = [];
    for (const op of sc.ops) {
      now = op.now || sc.now;
      let result;
      // A throw is an answer too — and a write it interrupted stays on disk.
      try { result = await run(op); } catch (e) { result = { thrown: e.message }; }
      const after = treeOf(be);
      const set = Object.fromEntries(Object.entries(after).filter(([p, f]) =>
        !before[p] || before[p].mtime !== f.mtime || before[p].text !== f.text));
      const gone = Object.keys(before).filter((p) => !(p in after));
      steps.push({ op: op.op, result, set, gone });
      before = after;
    }
    scenarios.push({ name: sc.name, initial, steps });
  }
  return { scenarios };
}

export async function render() {
  const linkTargets = [
    "Atlas", "atlas", "ATLAS OVERVIEW", "Atlas Notes", "atlas notes.md",
    "projects/Atlas/Atlas", "projects/atlas/atlas.md", "topics/Atlas",
    "Design", "design.md", "notes/design", "Sketches", "Sketches.canvas",
    "Same Title", "Title One", "Unstamped", "Bare", "Nowhere", "", "  Atlas  ",
  ];
  const out = {
    "files.json": filesExpected(),
    "vault-links.json": await vaultExpected(join(CASES, "vault"), linkTargets),
    "vault-demo.json": await vaultExpected(join(ROOT, "demo"), ["Quires", "Quire Structures"]),
    "writes.json": await writesExpected(),
    "pure.json": await pureExpected(),
    "pages.json": await pagesExpected(),
  };
  return Object.fromEntries(Object.entries(out)
    .map(([name, value]) => [name, JSON.stringify(value, null, 2) + "\n"]));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes("--check");
  const rendered = await render();
  let stale = 0;
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [name, text] of Object.entries(rendered)) {
    const path = join(OUT_DIR, name);
    let current = null;
    try { current = readFileSync(path, "utf8"); } catch (_) {}
    if (current === text) continue;
    if (check) { console.error(`✗ conformance/expected/${name} is stale`); stale++; continue; }
    writeFileSync(path, text);
    console.log(`✓ wrote conformance/expected/${name}`);
  }
  if (check && stale) {
    console.error("  run: node scripts/export-conformance.mjs");
    process.exit(1);
  }
  if (check) console.log("✓ conformance/expected is current");
}
