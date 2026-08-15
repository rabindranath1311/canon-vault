// The demo vault is the first thing a stranger sees, and it is shipped as a
// generated mirror of demo/. Two ways it can rot: the mirror drifts from the
// markdown, or the markdown stops being a valid vault. Both are caught here.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { render, OUT, DEMO_DIR, demoFiles } from "../../scripts/sync-demo.mjs";
import { DEMO_FILES } from "../vault/demo-vault.js";
import { MemoryBackend, Vault } from "../vault/vault.js";
import { parse, serialize, REQUIRED } from "../vault/mdfile.js";
import { findWikilinks, resolveWikilink, isEmbeddableFile } from "../vault/links.js";
import { join } from "node:path";

test("demo-vault.js is byte-identical to what the generator produces", () => {
  assert.equal(
    readFileSync(OUT, "utf8"),
    render(),
    "demo/ changed without regenerating — run: node scripts/sync-demo.mjs",
  );
});

test("every mirrored file equals its source on disk", () => {
  const onDisk = demoFiles();
  assert.deepEqual(Object.keys(DEMO_FILES).sort(), onDisk.sort());
  for (const f of onDisk) {
    assert.equal(DEMO_FILES[f], readFileSync(join(DEMO_DIR, f), "utf8"), `${f} has drifted`);
  }
});

test("every demo page has the required frontmatter and round-trips", () => {
  for (const [path, text] of Object.entries(DEMO_FILES)) {
    if (!path.endsWith(".md")) continue;
    const [fm, body] = parse(text);
    for (const k of REQUIRED) assert.ok(fm[k], `${path} is missing ${k}`);
    assert.equal(serialize(fm, body), text, `${path} must round-trip byte-identically`);
  }
});

test("every wikilink in the demo resolves — a dead link in the demo is the worst place for one", () => {
  const entries = Object.entries(DEMO_FILES)
    .filter(([p]) => p.endsWith(".md"))
    .map(([path, text]) => {
      const [fm] = parse(text);
      return { id: fm.id, path, title: fm.title, aliases: fm.aliases || [] };
    });
  const dead = [];
  for (const [path, text] of Object.entries(DEMO_FILES)) {
    if (!path.endsWith(".md")) continue;
    const [, body] = parse(text);
    for (const l of findWikilinks(body)) {
      // An embed of an asset (image, canvas sidecar) resolves against files,
      // not against the page index — the same split Obsidian makes.
      if (isEmbeddableFile(l.target)) {
        const hit = DEMO_FILES[l.target]
          || Object.keys(DEMO_FILES).some((p) => p.split("/").pop() === l.target);
        if (!hit) dead.push(`${path} -> ${l.target} (missing file)`);
        continue;
      }
      if (!resolveWikilink(l.target, entries)) dead.push(`${path} -> ${l.target}`);
    }
  }
  assert.deepEqual(dead, []);
});

test("the demo canvases are valid JSON Canvas pointing at files that exist", () => {
  for (const [path, text] of Object.entries(DEMO_FILES)) {
    if (!path.endsWith(".canvas")) continue;
    const d = JSON.parse(text);
    assert.deepEqual(Object.keys(d).sort(), ["edges", "nodes"], `${path} top-level keys`);
    for (const n of d.nodes) {
      for (const k of ["id", "type", "x", "y", "width", "height"]) {
        assert.ok(k in n, `${path} node ${n.id} missing ${k}`);
      }
      if (n.type === "file") {
        assert.ok(DEMO_FILES[n.file], `${path} points at a missing file: ${n.file}`);
      }
    }
  }
});

test("the demo stands up as a real vault and indexes every page", async () => {
  const be = new MemoryBackend(DEMO_FILES);
  const vault = new Vault(be);
  await vault.buildIndex();
  const md = Object.keys(DEMO_FILES).filter((p) => p.endsWith(".md")).length;
  assert.equal(vault.index.size, md, "every markdown file must land in the index");
  assert.deepEqual(vault.warnings, [], "the demo must load with zero warnings");
});

test("the demo covers all four kinds, or it is not demonstrating the model", () => {
  const kinds = new Set(
    Object.entries(DEMO_FILES)
      .filter(([p]) => p.endsWith(".md"))
      .map(([, t]) => parse(t)[0].kind),
  );
  for (const k of ["note", "topic", "canvas", "inspo"]) {
    assert.ok(kinds.has(k), `the demo has no ${k} page`);
  }
});

test("the demo says it is invented, somewhere a reader will see it", () => {
  assert.match(DEMO_FILES["context/about-me.md"], /demo vault.*invented/is);
});
