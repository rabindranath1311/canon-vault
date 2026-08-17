// The repo vendors its dependencies as files instead of installing them, which
// means it REDISTRIBUTES them — so every vendored component has to carry its
// license. That is easy to break silently: `scripts/vendor-excalidraw.mjs`
// wipes app/vendor/excalidraw/ on every run, and a new vendored file arrives
// with no reminder attached. This test is the reminder.
//
// It checks the notice is PRESENT, not that it says anything in particular.
// Asserting on license wording would fail the day upstream reformats a line,
// which is noise; a missing file is the failure that actually matters.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const INVENTORY = join(REPO, "THIRD-PARTY.md");

// Standalone license files that must exist on disk.
const LICENSE_FILES = [
  "app/vendor/excalidraw/LICENSE",        // Excalidraw itself — MIT
  "app/vendor/excalidraw/LICENSE.react",  // React, bundled into excalidraw.js
  "app/vendor/fonts/OFL-Inter.txt",
  "app/vendor/fonts/OFL-JetBrainsMono.txt",
];

// Minified bundles that carry their notice inline, in the file header rather
// than beside it. The offset is generous: a header comment sits at the top, but
// not always on byte zero.
const INLINE_NOTICE = [
  "app/vendor/markdown-it.min.js",
  "app/vendor/lz-string.js",
];

for (const rel of LICENSE_FILES) {
  test(`${rel} exists and is a real notice`, () => {
    const p = join(REPO, rel);
    assert.ok(existsSync(p), `${rel} is missing — a vendored dependency lost its license`);
    const text = readFileSync(p, "utf8");
    assert.ok(text.length > 200, `${rel} is too short to be a license`);
    assert.match(text, /copyright/i, `${rel} carries no copyright line`);
  });
}

for (const rel of INLINE_NOTICE) {
  test(`${rel} keeps its inline license header`, () => {
    const head = readFileSync(join(REPO, rel), "utf8").slice(0, 1000);
    assert.match(head, /MIT|licen[cs]e|copyright/i,
      `${rel} lost the license header it is redistributed under`);
  });
}

test("THIRD-PARTY.md lists every license file it points at", () => {
  const inventory = readFileSync(INVENTORY, "utf8");
  for (const rel of [...LICENSE_FILES, ...INLINE_NOTICE]) {
    assert.ok(inventory.includes(rel),
      `${rel} is not mentioned in THIRD-PARTY.md — the inventory has drifted`);
  }
});

// LICENSE.txt once carried the third-party notices appended after the MIT text.
// That is why GitHub reported the repo's license as NOASSERTION and showed no
// license at all: its detector stops matching when the file grows well past the
// template. The notices live in THIRD-PARTY.md now, and this keeps them there.
test("LICENSE.txt is the MIT text and nothing else", () => {
  const text = readFileSync(join(REPO, "LICENSE.txt"), "utf8");
  assert.match(text, /^MIT License/, "LICENSE.txt no longer starts with the MIT header");
  assert.match(text.trimEnd(), /DEALINGS IN THE\nSOFTWARE\.$/,
    "LICENSE.txt has content after the MIT text — GitHub will stop detecting the license");
  assert.ok(text.length < 1400,
    `LICENSE.txt is ${text.length} bytes; MIT is ~1070. Extra notices belong in THIRD-PARTY.md`);
});

test("Lucide is accounted for even though it ships inlined", () => {
  assert.match(readFileSync(INVENTORY, "utf8"), /Lucide/,
    "Lucide icons are inlined in app/app.js and still need attribution");
  assert.match(readFileSync(join(REPO, "app", "app.js"), "utf8"), /const LUCIDE = \{/,
    "the LUCIDE map moved — check THIRD-PARTY.md still describes where the icons live");
});

test("every path linked from THIRD-PARTY.md actually exists", () => {
  const inventory = readFileSync(INVENTORY, "utf8");
  // Relative markdown targets only; upstream project URLs are not our problem.
  const targets = [...inventory.matchAll(/\]\((?!https?:)([^)#]+)\)/g)].map((m) => m[1]);
  assert.ok(targets.length > 0, "no relative links found — did the table change shape?");
  for (const t of new Set(targets)) {
    assert.ok(existsSync(join(REPO, t)), `THIRD-PARTY.md links ${t}, which does not exist`);
  }
});
