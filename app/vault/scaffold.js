// Tasks 10.7 / 10.2: first run.
//
// The dangerous case is not the empty folder — it is being pointed at someone's
// existing vault of a thousand notes. So the rule is asymmetric on purpose:
// scaffold only into a folder that is unambiguously empty of notes, and
// otherwise adopt **read-only**, writing nothing at all until the user says so.
//
// SPEC §6: never write on adoption. This module is where that promise is kept.

import { serialize } from "./mdfile.js";

export const VAULT_DIRS = [
  "context", "notes", "topics", "canvas", "inspo",
  "projects", "attachments", ".trash", ".history",
];

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

const CONVENTION = `# The vault convention

Plain markdown files on disk. Three equal clients read and write them — the app,
Obsidian, and your coding agent — and none of them may store anything the others
cannot read.

## Frontmatter

\`\`\`yaml
---
id: 01J2XKQ8V3N4P5R6S7T8W9Y0ZA
kind: note
title: A page title
created: 2026-01-01T00:00:00+00:00
updated: 2026-01-01T00:00:00+00:00
tags: [example]
---
\`\`\`

\`id\`, \`kind\`, \`title\`, \`created\` and \`updated\` are required. Timestamps keep the
\`+00:00\` form, unquoted, so Obsidian renders them as dates.

## The four kinds

| \`kind\` | Folder |
| --- | --- |
| \`note\` | \`notes/\` |
| \`topic\` | \`topics/\` |
| \`canvas\` | \`canvas/\` (\`.md\` + \`.canvas\`) |
| \`inspo\` | \`inspo/\` (\`.md\` + \`.canvas\`) |

A project is a folder under \`projects/\`, not a kind.

## Filenames

**The filename is the title**, sanitised only for characters the filesystem
rejects. Obsidian resolves \`[[Wikilinks]]\` against the filename and \`aliases\` —
never against a \`title:\` field. If a filename cannot equal its title, put the
true title in \`aliases\` or inbound links stop resolving.

## Links and tags

\`[[Wikilinks]]\` are structure. Tags — frontmatter \`tags:\` and inline \`#tags\` —
filter and colour. They are not the same thing and do not substitute for each
other.

## What is never indexed

\`.git/\`, \`.obsidian/\`, \`.trash/\`, \`.history/\`, and any dot-directory.
\`.obsidian/\` is worth committing; \`.trash/\` and \`.history/\` are not.

## Write safety

Deletes move to \`.trash/\`. Overwrites snapshot to \`.history/\` first. A page
changed on disk is never silently overwritten.
`;

const AGENT_CONTRACT = `# Agent contract

You are working inside a vault — a folder of markdown files. There is no API and
no tool schema. The filesystem is the interface.

Read \`CONVENTION.md\` before writing anything, and read \`context/\` before writing
anything in the user's voice.

| You want to | Do this |
| --- | --- |
| Read a page | Open \`<folder>/<Title>.md\` — the filename is the title |
| Search | \`rg\` over the vault; it searches whole bodies |
| Recent work | \`ls -t\`, or \`git log\` if this is a repo |
| Create a page | Write a file that satisfies \`CONVENTION.md\` |
| Update a page | Edit it; bump \`updated\`; leave \`id\` and \`created\` alone |
| Delete a page | Move it to \`.trash/\` — never \`rm\` |

Rules that matter more than they look:

1. Never invent a \`[[Wikilink]]\` target — check the file exists first.
2. Never write a ULID as a link. It resolves to nothing.
3. Dates are absolute: convert "last week" to \`YYYY-MM-DD\`.
4. Prefer updating a page over creating one; prefer a link over a restatement.
`;

const CONTEXT_TEMPLATES = {
  "about-me.md": ["About me",
    "Who you are, what you work on, what you care about. Any agent reads this\nbefore it writes anything in your voice.\n\n_Replace this placeholder._"],
  "anti-ai-writing-style.md": ["Anti-AI writing style",
    "How you do **not** want to be written for. Be specific — banned words, banned\nstructures, the tells you notice.\n\n_Replace this placeholder._"],
  "my-company.md": ["My company",
    "What you are building, for whom, and the language you use about it.\n\n_Replace this placeholder._"],
};

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
  // These two are pages in the vault like any other, so they carry frontmatter.
  // Without it a freshly scaffolded vault fails its own validator — the app
  // would hand the user something it then calls invalid.
  await put("CONVENTION.md", serialize({
    id: "convention", kind: "note", title: "CONVENTION",
    created: now(), updated: now(), aliases: ["CONVENTION", "Convention"],
  }, CONVENTION));
  await put("CLAUDE.md", serialize({
    id: "agent-contract", kind: "note", title: "Agent contract",
    created: now(), updated: now(), aliases: ["Agent contract"],
  }, AGENT_CONTRACT));
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
    "CONVENTION.md",
    "CLAUDE.md",
    ...Object.keys(CONTEXT_TEMPLATES).map((n) => `context/${n}`),
  ];
}
