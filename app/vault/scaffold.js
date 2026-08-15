// Tasks 10.7 / 10.2: first run.
//
// The dangerous case is not the empty folder — it is being pointed at someone's
// existing vault of a thousand notes. So the rule is asymmetric on purpose:
// scaffold only into a folder that is unambiguously empty of notes, and
// otherwise adopt **read-only**, writing nothing at all until the user says so.
//
// SPEC §6: never write on adoption. This module is where that promise is kept.

import { serialize } from "./mdfile.js";
import { CONVENTION_MD, AGENTS_MD, CLAUDE_POINTER_MD } from "./brain-text.js";

export const VAULT_DIRS = [
  "context", "notes", "topics", "tags", "canvas", "inspo",
  "projects", "raw", "attachments", ".trash", ".history",
];

/** Written to `.canon-vault`, so a future format change can tell vaults apart. */
export const CONVENTION_VERSION = 1;

const IGNORED = new Set([".git", ".obsidian", ".trash", ".history"]);
const ignored = (p) =>
  String(p).split("/").some((s) => IGNORED.has(s) || (s.startsWith(".") && s !== "."));

/**
 * Decide what to do with the folder the user picked.
 * Returns { action: 'scaffold' | 'adopt', markdownFiles, existingDirs, reason }.
 */
export function assessFolder(files) {
  const md = files.filter((f) => f.path.endsWith(".md") && !ignored(f.path));
  const dirs = new Set();
  for (const f of files) {
    const top = f.path.split("/")[0];
    if (VAULT_DIRS.includes(top)) dirs.add(top);
  }
  if (md.length === 0 && dirs.size === 0) {
    return { action: "scaffold", markdownFiles: 0, existingDirs: [], reason: "folder is empty of notes and has none of the vault directories" };
  }
  return {
    action: "adopt",
    markdownFiles: md.length,
    existingDirs: [...dirs].sort(),
    reason: md.length
      ? `${md.length} markdown file(s) already here — adopting read-only`
      : `already has ${[...dirs].sort().join(", ")} — adopting read-only`,
  };
}

const CONTEXT_TEMPLATES = {
  "about-me.md": ["About me",
    "Who you are, what you work on, what you care about. Any agent reads this\nbefore it writes anything in your voice.\n\n_Replace this placeholder._"],
  "anti-ai-writing-style.md": ["Anti-AI writing style",
    "How you do **not** want to be written for. Be specific — banned words, banned\nstructures, the tells you notice.\n\n_Replace this placeholder._"],
  "my-company.md": ["My company",
    "What you are building, for whom, and the language you use about it.\n\n_Replace this placeholder._"],
};

const INDEX_BODY = `The catalog — every page, one line each, grouped by folder.
A page missing from here is invisible to a fresh agent session, so update it
whenever a page is added, retitled or trashed.

## context

- [[About me]] — who you are; read before anything is written in your voice
- [[Anti-AI writing style]] — how you do *not* want to be written for
- [[My company]] — what you are building, and the language you use about it

## notes

_Nothing yet._

## topics

_Nothing yet._
`;

const logBody = (ts) => `Append-only history. One entry per ingest, filed answer, lint pass or
structural change. Never rewrite an old entry.

\`grep "^## \\[" log.md | tail -5\` is the last five events.

## [${String(ts).slice(0, 10)}] setup | vault scaffolded

Created by the app: the directory skeleton, this log, [[index]],
[[CONVENTION]] and the agent contract.
`;

/**
 * Write the vault skeleton. Refuses unless `assessFolder` said scaffold, or the
 * caller passes `{ confirmed: true }` — which is what the "scaffold anyway"
 * button supplies after the user has been told what is already there.
 */
export async function scaffold(backend, opts = {}) {
  const files = await backend.listAll();
  const assessment = assessFolder(files);
  if (assessment.action !== "scaffold" && !opts.confirmed) {
    return { ok: false, reason: "would-adopt", assessment, written: [] };
  }

  const now = opts.now || (() => new Date().toISOString().replace(/\.\d+Z$/, "+00:00"));
  const written = [];
  const put = async (path, text) => {
    if (await backend.exists(path)) return;      // never clobber
    await backend.writeText(path, text);
    written.push(path);
  };

  // Directories are implicit in most backends, so drop a keep-file only where
  // emptiness would otherwise lose the folder.
  for (const d of VAULT_DIRS) {
    if (backend.mkdirp) await backend.mkdirp(d);
  }
  // Which convention these files were written against. A dot-file, so no client
  // indexes it — but without it, a future format change cannot tell a v1 vault
  // from a v2 one, and that is not a thing you can add retroactively.
  await put(".canon-vault", JSON.stringify({ convention: CONVENTION_VERSION }, null, 2) + "\n");

  // The root docs are pages in the vault like any other, so they carry
  // frontmatter. Without it a freshly scaffolded vault fails its own validator —
  // the app would hand the user something it then calls invalid.
  //
  // Bodies come from brain/*.md via brain-text.js, so the rules the app writes
  // are byte-for-byte the rules published in the repo.
  await put("CONVENTION.md", serialize({
    id: "convention", kind: "note", title: "CONVENTION",
    created: now(), updated: now(), aliases: ["CONVENTION", "Convention"],
  }, CONVENTION_MD));
  await put("AGENTS.md", serialize({
    id: "agent-contract", kind: "note", title: "Agent contract",
    created: now(), updated: now(), aliases: ["Agent contract", "AGENTS"],
  }, AGENTS_MD));
  // Claude Code looks for CLAUDE.md, everything else for AGENTS.md. The pointer
  // is what keeps the vault from being tied to one agent.
  await put("CLAUDE.md", serialize({
    id: "agent-contract-pointer", kind: "note", title: "CLAUDE",
    created: now(), updated: now(), aliases: ["CLAUDE"],
  }, CLAUDE_POINTER_MD));

  // CONVENTION.md links [[index]] and [[log]]; scaffolding without them would
  // hand the user a vault whose own rulebook has two dead links.
  await put("index.md", serialize({
    id: "index", kind: "note", title: "index",
    created: now(), updated: now(), aliases: ["index", "Index"],
  }, INDEX_BODY));
  await put("log.md", serialize({
    id: "log", kind: "note", title: "log",
    created: now(), updated: now(), aliases: ["log", "Log"],
  }, logBody(now())));

  for (const [name, [title, body]] of Object.entries(CONTEXT_TEMPLATES)) {
    await put(`context/${name}`, serialize({
      id: `context-${name.replace(/\.md$/, "")}`,
      kind: "note", title, created: now(), updated: now(),
      aliases: [title],
    }, body));
  }
  return { ok: true, assessment, written, dirs: VAULT_DIRS };
}

/** What a freshly scaffolded vault should contain — used by the tests and the UI. */
export function expectedEntries() {
  return [
    ...VAULT_DIRS,
    ".canon-vault",
    "CONVENTION.md",
    "AGENTS.md",
    "CLAUDE.md",
    "index.md",
    "log.md",
    ...Object.keys(CONTEXT_TEMPLATES).map((n) => `context/${n}`),
  ];
}
