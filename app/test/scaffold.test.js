// Tasks 10.7 / 10.2. The rule is asymmetric on purpose: scaffold only into a
// folder that is unambiguously empty of notes, and otherwise write nothing at
// all until the user confirms. SPEC §6: never write on adoption.

import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryBackend } from "../vault/vault.js";
import { assessFolder, scaffold, expectedEntries, VAULT_DIRS } from "../vault/scaffold.js";
import { serialize, parse } from "../vault/mdfile.js";

const TS = "2026-07-30T12:00:00+00:00";
const opts = { now: () => TS };

test("10.7 an empty folder is assessed as scaffold", async () => {
  const be = new MemoryBackend();
  assert.equal(assessFolder(await be.listAll()).action, "scaffold");
});

test("10.7 a folder with existing notes is assessed as adopt", async () => {
  const files = {};
  for (let i = 0; i < 20; i++) files[`existing-${i}.md`] = `# Note ${i}\n`;
  const be = new MemoryBackend(files);
  const a = assessFolder(await be.listAll());
  assert.equal(a.action, "adopt");
  assert.equal(a.markdownFiles, 20);
});

test("10.7 a folder that already has vault directories is adopted, not re-scaffolded", async () => {
  // a real file, not a dot-file: listAll ignores dot-paths by design
  const be = new MemoryBackend({ "notes/keep.txt": "x", "topics/keep.txt": "x" });
  const a = assessFolder(await be.listAll());
  assert.equal(a.action, "adopt");
  assert.deepEqual(a.existingDirs, ["notes", "topics"]);
});

test("10.2 scaffolding an empty folder produces the full skeleton", async () => {
  const be = new MemoryBackend();
  const r = await scaffold(be, opts);
  assert.ok(r.ok);
  const entries = expectedEntries();
  // 9 directories + CONVENTION.md + CLAUDE.md + 3 context templates
  assert.equal(VAULT_DIRS.length, 9);
  assert.equal(entries.length, 14, "9 dirs + 2 root docs + 3 templates = 14");
  assert.deepEqual(r.written.sort(), [
    "CLAUDE.md", "CONVENTION.md",
    "context/about-me.md", "context/anti-ai-writing-style.md", "context/my-company.md",
  ]);
});

test("10.2 every scaffolded page is valid per the convention it ships", async () => {
  const be = new MemoryBackend();
  await scaffold(be, opts);
  for (const p of ["context/about-me.md", "context/anti-ai-writing-style.md", "context/my-company.md"]) {
    const text = await be.readText(p);
    const [fm, body] = parse(text);
    for (const k of ["id", "kind", "title", "created", "updated"]) {
      assert.ok(fm[k], `${p} is missing ${k}`);
    }
    assert.equal(serialize(fm, body), text, `${p} must round-trip byte-identically`);
    assert.ok(fm.aliases.includes(fm.title), `${p} needs its title in aliases`);
  }
  assert.match(await be.readText("CONVENTION.md"), /the filename is the title/i);
  assert.match(await be.readText("CLAUDE.md"), /Never invent a/i);
});

test("10.7 adoption writes ZERO bytes — all 20 files unchanged", async () => {
  const files = {};
  for (let i = 0; i < 20; i++) files[`notes-${i}.md`] = `# Note ${i}\n\nbody ${i}\n`;
  const be = new MemoryBackend(files);
  const before = new Map([...be.files].map(([p, f]) => [p, { m: f.mtime, d: String(f.data) }]));

  const r = await scaffold(be, opts);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "would-adopt");
  assert.deepEqual(r.written, []);

  const after = new Map([...be.files].map(([p, f]) => [p, { m: f.mtime, d: String(f.data) }]));
  assert.equal(after.size, 20, "no file may be added");
  assert.deepEqual(after, before, "every mtime and every byte must be untouched");
});

test("10.7 scaffolding a non-empty folder requires explicit confirmation", async () => {
  const be = new MemoryBackend({ "existing.md": "# Mine\n" });
  assert.equal((await scaffold(be, opts)).ok, false);
  const forced = await scaffold(be, { ...opts, confirmed: true });
  assert.ok(forced.ok, "confirmation is what unlocks it");
  assert.ok(forced.written.includes("CONVENTION.md"));
  assert.equal(await be.readText("existing.md"), "# Mine\n", "their file stays untouched");
});

test("scaffolding never clobbers a file that already exists", async () => {
  const be = new MemoryBackend({ "CONVENTION.md": "MINE, DO NOT TOUCH\n" });
  const r = await scaffold(be, { ...opts, confirmed: true });
  assert.ok(!r.written.includes("CONVENTION.md"));
  assert.equal(await be.readText("CONVENTION.md"), "MINE, DO NOT TOUCH\n");
});

test("10.2 a freshly scaffolded vault passes the vault's OWN validator", async () => {
  // Found by a fresh agent running the setup prompt (10.3): the validator walks
  // every .md, so a root doc without frontmatter makes the app hand the user a
  // vault it immediately calls invalid.
  const { roundtripOk, parse, REQUIRED } = await import("../vault/mdfile.js");
  const be = new MemoryBackend();
  await scaffold(be, opts);

  const failures = [];
  for (const f of await be.listAll()) {
    if (!f.path.endsWith(".md")) continue;
    const text = await be.readText(f.path);
    const [ok, why] = roundtripOk(text);
    if (!ok) { failures.push(`${f.path}: ${why}`); continue; }
    const [fm] = parse(text);
    for (const k of REQUIRED) if (!fm[k]) failures.push(`${f.path}: missing ${k}`);
  }
  assert.deepEqual(failures, [], "every scaffolded file must validate");
});

test("10.2 the scaffolded root docs are pages, with frontmatter", async () => {
  const be = new MemoryBackend();
  await scaffold(be, opts);
  for (const p of ["CONVENTION.md", "CLAUDE.md"]) {
    assert.ok((await be.readText(p)).startsWith("---\n"), `${p} needs frontmatter`);
  }
});
