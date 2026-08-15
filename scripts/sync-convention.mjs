// Mirror brain/*.md into app/vault/brain-text.js.
//
// The app ships with no build step, so it cannot read brain/CONVENTION.md at
// runtime — the scaffolder needs the text inline. That is a duplicate, and a
// duplicate that drifts is exactly what CLAUDE.md warns about. So: the markdown
// is the source, this script mirrors it, and app/test/convention.test.js fails
// if anyone edits the mirror by hand.
//
//     node scripts/sync-convention.mjs          # write
//     node scripts/sync-convention.mjs --check  # exit 1 if stale
//
// This is not a build step. The generated file is committed; the app is still
// served as-is.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const OUT = join(ROOT, "app", "vault", "brain-text.js");

/** Files mirrored, in emitted order: [export name, path under brain/]. */
export const SOURCES = [
  ["CONVENTION_MD", "CONVENTION.md"],
  ["AGENTS_MD", "AGENTS.md"],
  ["CLAUDE_POINTER_MD", "CLAUDE.md"],
];

/** Escape for a JS template literal: backslash, backtick, and `${`. */
const escapeTemplate = (s) =>
  s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

export function render() {
  const parts = SOURCES.map(([name, file]) => {
    const text = readFileSync(join(ROOT, "brain", file), "utf8");
    return `/** Mirror of brain/${file}. */\nexport const ${name} = \`${escapeTemplate(text)}\`;\n`;
  });
  return [
    "// GENERATED — do not edit by hand.",
    "//",
    "// Source of truth is brain/*.md. Regenerate with:",
    "//     node scripts/sync-convention.mjs",
    "// app/test/convention.test.js fails if this file drifts from the markdown.",
    "",
    ...parts,
  ].join("\n");
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const next = render();
  const check = process.argv.includes("--check");
  let current = null;
  try { current = readFileSync(OUT, "utf8"); } catch { /* first run */ }

  if (current === next) {
    console.log("✓ app/vault/brain-text.js is in sync with brain/*.md");
  } else if (check) {
    console.error("✗ app/vault/brain-text.js is stale — run: node scripts/sync-convention.mjs");
    process.exit(1);
  } else {
    writeFileSync(OUT, next);
    console.log(`✓ wrote app/vault/brain-text.js from ${SOURCES.length} source files`);
  }
}
