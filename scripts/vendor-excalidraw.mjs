#!/usr/bin/env node
// Build app/vendor/excalidraw/ from npm. Run this to add or update Excalidraw;
// never at deploy time.
//
//   node scripts/vendor-excalidraw.mjs
//
// This is the one place the repo's "no bundler" rule bends, and it bends in the
// direction that keeps the product rule intact: the bundler runs HERE, on a
// developer machine, and commits its output. `vercel.json` still says
// `buildCommand: null`, deploying is still a file copy, and the app still has no
// build step. Same arrangement as vendor/markdown-it.min.js — that file was
// built by someone too, just not by us.
//
// Excalidraw has been ESM-only since 0.18.0 (the UMD build is gone) and its
// published dist imports 28 bare specifiers, so it cannot simply be copied into
// vendor/. Loading it from a CDN instead would put a third party in the path of
// an app whose entire promise is that your notes never leave your disk. So we
// bundle once, here, and ship the result.

import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, cpSync, writeFileSync, readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const OUT = join(REPO, "app", "vendor", "excalidraw");

// Pinned. An unpinned vendor directory is a supply-chain hole with extra steps:
// re-running this script must produce the same bytes until someone edits it.
const PIN = {
  "@excalidraw/excalidraw": "0.18.1",
  react: "19.0.0",
  "react-dom": "19.0.0",
  esbuild: "0.25.0",
};

// Excalidraw ships 13 MB of fonts, 12 MB of which is Xiaolai (CJK handwriting).
// Latin-script users never load it, so it is left out — but deliberately, and
// noted here, rather than silently.
const FONTS = ["Excalifont", "Nunito", "ComicShanns", "Virgil", "Cascadia", "Liberation", "Assistant"];
const SKIPPED_FONTS = ["Xiaolai"];

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });

const mb = (p) => {
  let total = 0;
  const walk = (d) => {
    for (const e of readdirSafe(d)) {
      const f = join(d, e);
      const s = statSync(f);
      s.isDirectory() ? walk(f) : (total += s.size);
    }
  };
  walk(p);
  return (total / 1048576).toFixed(1);
};
const readdirSafe = (d) => {
  try { return readdirSync(d); } catch { return []; }
};

const work = mkdtempSync(join(tmpdir(), "vendor-excalidraw-"));
try {
  console.log(`• working in ${work}`);
  writeFileSync(join(work, "package.json"), JSON.stringify({
    name: "canon-vault-vendor", private: true, type: "module",
  }) + "\n");

  const specs = Object.entries(PIN).map(([n, v]) => `${n}@${v}`);
  console.log(`• installing ${specs.join(", ")}`);
  run("npm", ["install", "--silent", "--no-audit", "--no-fund", ...specs], work);

  cpSync(join(HERE, "excalidraw-entry.jsx"), join(work, "entry.jsx"));

  console.log("• bundling");
  run(join(work, "node_modules", ".bin", "esbuild"), [
    "entry.jsx",
    "--bundle",
    "--format=esm",
    "--minify",
    "--define:process.env.NODE_ENV=\"production\"",
    "--loader:.jsx=jsx",
    "--loader:.woff2=copy",
    "--loader:.ttf=copy",
    "--outdir=out",
    "--entry-names=excalidraw",
  ], work);

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(join(OUT, "fonts"), { recursive: true });
  cpSync(join(work, "out", "excalidraw.js"), join(OUT, "excalidraw.js"));

  const pkg = join(work, "node_modules", "@excalidraw", "excalidraw", "dist", "prod");
  cpSync(join(pkg, "index.css"), join(OUT, "excalidraw.css"));
  for (const f of FONTS) {
    const src = join(pkg, "fonts", f);
    if (existsSync(src)) cpSync(src, join(OUT, "fonts", f), { recursive: true });
  }

  const version = JSON.parse(readFileSync(
    join(work, "node_modules", "@excalidraw", "excalidraw", "package.json"), "utf8")).version;
  writeFileSync(join(OUT, "VERSION"), [
    `@excalidraw/excalidraw ${version}`,
    `react ${PIN.react} / react-dom ${PIN["react-dom"]} (bundled in)`,
    `built by scripts/vendor-excalidraw.mjs from scripts/excalidraw-entry.jsx`,
    `fonts included: ${FONTS.join(", ")}`,
    `fonts skipped: ${SKIPPED_FONTS.join(", ")} (CJK, ~12MB)`,
    "",
  ].join("\n"));

  console.log(`✓ vendored Excalidraw ${version} → app/vendor/excalidraw/ (${mb(OUT)} MB)`);
  console.log("  remember to bump the ?v= in app/index.html");
} finally {
  rmSync(work, { recursive: true, force: true });
}
