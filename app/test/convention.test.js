// The convention exists twice on purpose — once as brain/CONVENTION.md, which
// is what humans and agents read, and once inlined in app/vault/brain-text.js,
// because the app has no build step and cannot fetch a repo file at runtime.
//
// A duplicate that drifts is the exact failure CLAUDE.md warns about, so these
// tests make drift a red test rather than a silent lie in someone's vault.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { render, OUT, SOURCES } from "../../scripts/sync-convention.mjs";
import * as brain from "../vault/brain-text.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const readBrain = (f) => readFileSync(join(ROOT, "brain", f), "utf8");

test("brain-text.js is byte-identical to what the generator produces", () => {
  assert.equal(
    readFileSync(OUT, "utf8"),
    render(),
    "brain/*.md changed without regenerating — run: node scripts/sync-convention.mjs",
  );
});

test("every mirrored export equals its markdown source exactly", () => {
  for (const [name, file] of SOURCES) {
    assert.equal(brain[name], readBrain(file), `${name} has drifted from brain/${file}`);
  }
});

test("the published convention still states the invariants the code depends on", () => {
  // Not style policing. Each of these is a rule some part of app/vault/ relies
  // on, so if the prose loses it, the code and the contract have parted ways.
  const c = brain.CONVENTION_MD;
  assert.match(c, /the filename IS the title/i, "wikilink resolution depends on this");
  assert.match(c, /filename basename.*aliases.*path/is, "links.js resolution order");
  assert.match(c, /never.*\[\[<ULID>\]\]/is, "the most common way a vault goes link-dead");
  assert.match(c, /\+00:00.*unquoted/is, "mdfile.js round-trip depends on the timestamp form");
  for (const kind of ["note", "topic", "canvas", "inspo"]) {
    assert.match(c, new RegExp("`" + kind + "`"), `the four kinds must include ${kind}`);
  }
});

test("the agent contract still requires validation before reporting done", () => {
  assert.match(brain.AGENTS_MD, /verify-vault\.mjs/, "the validator must be reachable");
  assert.match(brain.AGENTS_MD, /\.trash\//, "deletes must go to .trash/");
});

test("the CLAUDE.md pointer points at AGENTS.md and stays short", () => {
  assert.match(brain.CLAUDE_POINTER_MD, /AGENTS\.md/);
  assert.ok(
    brain.CLAUDE_POINTER_MD.split("\n").length < 15,
    "the pointer is a pointer — content belongs in AGENTS.md",
  );
});
