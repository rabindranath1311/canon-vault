// Task 5.4: the JS serializer must produce identical bytes to the Python one
// for every file the Phase 1 generator wrote. Point VAULT at a real vault:
//
//     VAULT=/path/to/vault node --test app/test/
//
// Skipped without VAULT so the suite stays runnable in a clean checkout, and so
// no personal path is ever baked into the repo (SPEC §14).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { roundtripOk, parse, serialize } from "../vault/mdfile.js";

const VAULT = process.env.VAULT;
const IGNORED = new Set([".git", ".obsidian", ".trash", ".history"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (IGNORED.has(name) || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".md")) out.push(p);
  }
  return out;
}

test("5.4 JS reproduces Python's bytes for every vault file", { skip: !VAULT }, () => {
  const files = walk(VAULT);
  assert.ok(files.length > 0, "no .md files found");
  const bad = [];
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    const [ok, why] = roundtripOk(text);
    if (!ok) bad.push(`${f.slice(VAULT.length + 1)}: ${why}`);
  }
  console.log(`      ${files.length - bad.length}/${files.length} byte-identical to Python`);
  assert.deepEqual(bad, []);
});

test("5.4 frontmatter parses to the same values Python wrote", { skip: !VAULT }, () => {
  for (const f of walk(VAULT)) {
    const [fm, body] = parse(readFileSync(f, "utf8"));
    assert.equal(serialize(fm, body), readFileSync(f, "utf8"));
  }
});

test("5.5 real-vault index is fast: cold <500ms, warm <50ms", { skip: !VAULT }, async () => {
  const { Vault, MemoryBackend } = await import("../vault/vault.js");
  const be = new MemoryBackend();
  for (const f of walk(VAULT)) {
    await be.writeText(f.slice(VAULT.length + 1), readFileSync(f, "utf8"));
  }
  const v = new Vault(be);
  let t = process.hrtime.bigint();
  await v.buildIndex();
  const cold = Number(process.hrtime.bigint() - t) / 1e6;
  t = process.hrtime.bigint();
  await v.buildIndex();
  const warm = Number(process.hrtime.bigint() - t) / 1e6;
  console.log(`      real vault: ${v.list().length} entries · cold ${cold.toFixed(1)}ms · warm ${warm.toFixed(1)}ms`);
  console.log(`      duplicate-title warnings: ${v.warnings.filter((w) => w.startsWith("duplicate title")).length}`);
  assert.ok(cold < 500, `cold ${cold}ms`);
  assert.ok(warm < 50, `warm ${warm}ms`);
  assert.ok(v.warnings.some((w) => w.startsWith("duplicate title")), "the known duplicate pair must warn");
});
