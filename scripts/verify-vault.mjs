// Task 2.1's round-trip harness, and the vault's VERIFY check — in Node, so
// task 7.2 can leave the repo with no Python at all.
//
//     node scripts/verify-vault.mjs --vault <vault-dir>
//
// Exits non-zero if any `.md` outside scripts/roundtrip-exceptions.txt fails to
// survive parse → serialize byte for byte, or if any structural invariant the
// migration promises is violated.
//
// Byte-identity is the strong form deliberately: it is the only check that
// catches a lossy field mapping rather than merely an ugly one.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { roundtripOk, parse, REQUIRED } from "../app/vault/mdfile.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXCEPTIONS = join(HERE, "roundtrip-exceptions.txt");
const IGNORE = new Set([".git", ".obsidian", ".trash", ".history"]);
const ULID_WIKILINK = /!?\[\[[0-9A-HJKMNP-TV-Z]{26}(?:[|\]#])/;

function loadExceptions() {
  const out = new Map();
  if (!existsSync(EXCEPTIONS)) return out;
  for (const raw of readFileSync(EXCEPTIONS, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("#");
    const path = (i === -1 ? line : line.slice(0, i)).trim();
    const reason = i === -1 ? "" : line.slice(i + 1).trim();
    if (!reason) {
      console.error(`✗ exception for ${path} has no reason`);
      process.exit(2);
    }
    out.set(path, reason);
  }
  return out;
}

function walk(dir, root, out = []) {
  for (const name of readdirSync(dir)) {
    if (IGNORE.has(name) || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, root, out);
    else out.push(p);
  }
  return out;
}

const argv = process.argv.slice(2);
const vi = argv.indexOf("--vault");
if (vi === -1 || !argv[vi + 1]) {
  console.error("usage: node scripts/verify-vault.mjs --vault <dir>");
  process.exit(2);
}
const V = argv[vi + 1].replace(/^~/, process.env.HOME || "~");
if (!existsSync(V)) {
  console.error(`✗ no such vault: ${V}`);
  process.exit(2);
}

const exc = loadExceptions();
if (exc.size > 3) {
  console.error(`✗ roundtrip-exceptions.txt has ${exc.size} entries; the budget is 3`);
  process.exit(2);
}

const all = walk(V, V);
const md = all.filter((p) => p.endsWith(".md")).sort();
const canvases = all.filter((p) => p.endsWith(".canvas")).sort();
const failures = [];
const excused = [];
let checked = 0;

for (const f of md) {
  const rel = relative(V, f);
  const text = readFileSync(f, "utf8");
  if (exc.has(rel)) { excused.push(`${rel} — ${exc.get(rel)}`); continue; }
  checked++;
  const [ok, why] = roundtripOk(text);
  if (!ok) { failures.push(`round-trip: ${rel} (${why})`); continue; }
  const [fm] = parse(text);
  for (const k of REQUIRED) if (!fm[k]) failures.push(`missing \`${k}\`: ${rel}`);
  if (!/^([0-9A-HJKMNP-TV-Z]{26}|[a-z0-9-]+)$/.test(String(fm.id))) {
    failures.push(`id is neither a ULID nor a stable slug: ${rel}`);
  }
}

const blob = md.map((f) => readFileSync(f, "utf8")).join("\n");
if (ULID_WIKILINK.test(blob)) failures.push("a ULID wikilink survives — Obsidian cannot resolve it");
if (blob.includes("[[mt:")) failures.push("an app-private mention-tag link survives");

for (const f of all) {
  const b = readFileSync(f);
  // Any Supabase asset URL is a dead reference now — no need to name one
  // person's project here, which would itself be personal data (10.4).
  if (b.includes("supabase.co")) {
    failures.push(`dead-project reference in ${relative(V, f)}`);
  }
}

for (const c of canvases) {
  let d;
  try { d = JSON.parse(readFileSync(c, "utf8")); }
  catch (e) { failures.push(`invalid JSON Canvas: ${relative(V, c)} (${e.message})`); continue; }
  const keys = Object.keys(d).sort().join(",");
  if (keys !== "edges,nodes") failures.push(`canvas has unexpected top-level keys: ${relative(V, c)}`);
  for (const n of d.nodes || []) {
    for (const k of ["id", "type", "x", "y", "width", "height"]) {
      if (!(k in n)) failures.push(`${relative(V, c)} node ${n.id} missing \`${k}\``);
    }
    if (!(Number.isInteger(n.height) && n.height > 0)) {
      failures.push(`${relative(V, c)} node ${n.id} has a bad height`);
    }
    if (n.type === "link" && !n.url) failures.push(`${relative(V, c)} link node ${n.id} has no url`);
    if (n.type === "file" && !existsSync(join(V, n.file))) {
      failures.push(`${relative(V, c)} points at a missing file: ${n.file}`);
    }
  }
}

// Filenames that two pages share. Obsidian resolves `[[Name]]` by basename, so
// a shared one makes every link to that name ambiguous — but an existing vault
// accumulates them honestly (Obsidian's own `Untitled.canvas`, a note and a
// board named alike), so this reports rather than fails. A `.canvas` beside its
// own `.md` is the one legitimate pair: one page in two files, not two pages.
const mdSet = new Set(md);
const pages = [...md, ...canvases.filter((c) => !mdSet.has(c.replace(/\.canvas$/, ".md")))].sort();
const byBase = new Map();
const ambiguous = [];
for (const p of pages) {
  const rel = relative(V, p);
  const base = rel.split("/").pop().replace(/\.(md|canvas)$/i, "");
  const k = base.toLowerCase();
  if (byBase.has(k)) ambiguous.push(`[[${base}]] → ${byBase.get(k)} and ${rel}`);
  else byBase.set(k, rel);
}

console.log(`round-trip: ${checked} file(s) byte-identical, ${excused.length} excused`);
for (const e of excused) console.log(`  excused: ${e}`);
if (ambiguous.length) {
  console.log(`\n! ${ambiguous.length} ambiguous link target(s) — two files share one filename:`);
  for (const a of ambiguous) console.log(`  - ${a}`);
}
if (failures.length) {
  console.log(`\n✗ ${failures.length} failure(s):`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log(`✓ vault verified: ${md.length} markdown, ${canvases.length} canvas, no invariant violated`);
