// Mirror demo/ into app/vault/demo-vault.js.
//
// Same reasoning as sync-convention.mjs: the app has no build step, so it
// cannot read demo/ at runtime. The markdown in demo/ is the source — ordinary
// hand-editable files that Obsidian opens and the validator checks — and this
// script mirrors them into a module the app imports.
//
//     node scripts/sync-demo.mjs          # write
//     node scripts/sync-demo.mjs --check  # exit 1 if stale
//
// The module is imported *dynamically*, only when someone clicks "Try a demo
// vault", so its bytes are not on the critical path for people opening their
// own vault.

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const DEMO_DIR = join(ROOT, "demo");
export const OUT = join(ROOT, "app", "vault", "demo-vault.js");

/** Every file in demo/, as vault-relative POSIX paths, sorted for stable output. */
export function demoFiles() {
  const out = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir).sort()) {
      if (entry.startsWith(".")) continue;
      const p = join(dir, entry);
      statSync(p).isDirectory() ? walk(p) : out.push(relative(DEMO_DIR, p).split(sep).join("/"));
    }
  })(DEMO_DIR);
  return out.sort();
}

const escapeTemplate = (s) =>
  s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

export function render() {
  const files = demoFiles();
  const entries = files.map((f) => {
    const text = readFileSync(join(DEMO_DIR, f), "utf8");
    return `  ${JSON.stringify(f)}: \`${escapeTemplate(text)}\`,`;
  });
  return [
    "// GENERATED — do not edit by hand.",
    "//",
    "// Source of truth is demo/*. Regenerate with:",
    "//     node scripts/sync-demo.mjs",
    "// app/test/demo.test.js fails if this file drifts from the markdown.",
    "//",
    "// Invented content, deliberately: a demo vault must never contain anything",
    "// real. See CLAUDE.md.",
    "",
    "/** Vault-relative path -> file contents. Fed to a MemoryBackend. */",
    "export const DEMO_FILES = {",
    ...entries,
    "};",
    "",
  ].join("\n");
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const next = render();
  const check = process.argv.includes("--check");
  let current = null;
  try { current = readFileSync(OUT, "utf8"); } catch { /* first run */ }

  if (current === next) {
    console.log("✓ app/vault/demo-vault.js is in sync with demo/");
  } else if (check) {
    console.error("✗ app/vault/demo-vault.js is stale — run: node scripts/sync-demo.mjs");
    process.exit(1);
  } else {
    writeFileSync(OUT, next);
    const kb = (Buffer.byteLength(next) / 1024).toFixed(1);
    console.log(`✓ wrote app/vault/demo-vault.js — ${demoFiles().length} files, ${kb} kB`);
  }
}
