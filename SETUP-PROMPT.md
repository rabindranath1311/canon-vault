# Set up a Canon Vault with your agent

Copy everything below the line into a fresh agent session, in an empty
directory. It is the power-user path — the app scaffolds the same structure
from a folder picker with no terminal at all.

---

You are setting up a **Canon Vault**: a folder of plain markdown files
that a web app, Obsidian, and you all read and write as equals. There is no
server, no database and no API. The filesystem is the interface.

Create the vault in the current directory.

## 1. Structure

```
context/      identity — read before writing in my voice
notes/        anything read as prose
topics/       living hubs
tags/         subjects — near-empty pages; linking one files a page under it
canvas/       spatial boards (.md + .canvas sidecar)
inspo/        visual reference (.md + .canvas sidecar)
projects/     a folder per project, each with a folder note
raw/          immutable sources — clipped articles, transcripts; never edited
attachments/  images and binaries
index.md      the catalog — every page, one line each
log.md        append-only history of ingests, filed answers, lint passes
.trash/       deleted pages, recoverable
.history/     pre-overwrite snapshots
```

## 2. The file format

Every page is markdown with YAML frontmatter:

```yaml
---
id: 01J2XKQ8V3N4P5R6S7T8W9Y0ZA
kind: note
title: Quiet Industrial Dashboards
created: 2026-01-01T00:00:00+00:00
updated: 2026-01-01T00:00:00+00:00
tags: [design, dashboards]
aliases: [Quiet Dashboards]
---
```

Rules that are not negotiable, because breaking them breaks Obsidian:

1. `id`, `kind`, `title`, `created`, `updated` are **required**. `id` is a
   26-character ULID and never changes.
2. Timestamps use the `+00:00` form, **unquoted**.
3. **The filename is the title.** Obsidian resolves `[[Wikilinks]]` against the
   filename and `aliases` — never against `title:`. If a filename cannot equal
   its title, put the true title in `aliases`.
4. **Never write a ULID as a link.** `[[01J2X…]]` resolves to nothing.
5. Wikilinks in frontmatter must be quoted: `parent: "[[Some Page]]"`.
6. There are exactly four kinds: `note`, `topic`, `canvas`, `inspo`. A project
   is a folder, not a kind.
7. **Subjects are tag pages.** A subject is a page in `tags/` — lowercase
   basename, standard frontmatter, empty body. Filing a page under a subject
   means *linking* it (`[[economy]]`) where it comes up; the tag page's
   backlinks are the collection. Native `tags:` / `#tags` mark workflow state
   only (draft, current, stub) — never subject matter.

## 3. What to create

- `CONVENTION.md` at the root, stating the rules above in your own words.
- `CLAUDE.md` at the root: what an agent may do here, phrased as filesystem
  actions rather than tools — including the wiki loop: **ingest** sources from
  `raw/` into pages (update before create, link every subject touched),
  **file good answers back** as pages instead of losing them to chat, and
  periodically **lint** for contradictions, orphans and stale claims. Update
  `index.md` and append to `log.md` on every operation.
- Three `context/` files — `about-me.md`, `anti-ai-writing-style.md`,
  `my-company.md` — as templates for me to fill in.
- `tags/` with two or three subject pages that fit me, `index.md` cataloguing
  every page you created, and `log.md` whose first entry records the setup —
  entries start `## [YYYY-MM-DD] <op> | <title>` so unix tools can parse them.
- **At least one page of each kind**, so the structure is demonstrated rather
  than described: a `note`, a `topic`, a `canvas` (with its `.canvas` sidecar
  and an `![[embed]]` of it in the `.md`), and an `inspo`.
- Link them to each other with real `[[Wikilinks]]` that resolve.

## 4. Check your work, without being asked

When you are done, **validate the vault and report the result**. If the app's
repo is available:

```
node scripts/verify-vault.mjs --vault .
```

If it is not, do the equivalent yourself and state what you checked:

- every `.md` has the five required frontmatter fields;
- every `[[Wikilink]]` resolves to a file that exists;
- every `.canvas` is valid JSON with `nodes` and `edges` keys only;
- no ULID appears inside `[[ ]]`.

Report the number of failures. **If it is not zero, fix them and re-check
before telling me you are finished.** Do not report success without having run
the check.
