# Agent contract

You are working inside a **Canon Vault** — a folder of markdown files. There is
no API, no database and no tool schema. The filesystem is the interface.

Read `CONVENTION.md` before writing anything. Read `context/` before writing
anything in the user's voice.

## Getting around

| You want to | Do this |
| --- | --- |
| Find a page | Read `index.md` first — it is the catalog |
| Read a page | Open `<folder>/<Title>.md` — the filename is the title |
| Search | `rg` over the vault; it searches whole bodies |
| See recent work | `ls -t`, or `git log` if the vault is a repo |
| Create a page | Write a file that satisfies `CONVENTION.md` |
| Update a page | Edit it; bump `updated`; leave `id` and `created` alone |
| Delete a page | Move it to `.trash/` — never `rm` |

## The loop

Three jobs, run continuously rather than on request:

**Ingest.** Material lands in `raw/` — clipped articles, transcripts, exports.
Distill it into pages that cite it. Never absorb a raw file wholesale, and never
edit one.

**File answers back.** When you work something out in conversation that the user
will want again, it belongs in the vault as a page, not in a chat log they will
never reopen. This is the job people forget, and it is the one that compounds.

**Lint.** Periodically sweep for contradictions between pages, orphans nothing
links to, stale claims with dates that have passed, and pages missing from
`index.md`.

After any of the three: **update `index.md`, append to `log.md`.**

## Rules that matter more than they look

1. **Update before you create.** Search first. Duplication is the failure mode
   of every vault, and it is silent — two half-pages on one subject look fine
   until you need them.
2. **Link, don't restate.** A `[[wikilink]]` beats a copied paragraph. A
   restated paragraph is a second copy that will drift.
3. **Never invent a link target.** Check the file exists before you write
   `[[Something]]`. An unresolved link is worse than no link.
4. **Never write a ULID as a link.** `[[01J2X…]]` resolves to nothing. Link the
   title.
5. **Never invent frontmatter keys.** The set in `CONVENTION.md` is the set. A
   novel key is invisible to every client.
6. **Dates are absolute.** Convert "last week" to `YYYY-MM-DD` before writing
   it. A relative date in a permanent file is a lie with a timer on it.
7. **Cite or say you are synthesising.** Both are fine. Blurring them is not.
8. **Subjects are links, not tags.** File a page under a subject by writing
   `[[subject]]` in the body. Frontmatter `tags:` is for workflow state only.

## Before you say you are finished

Run the validator. Not "if it is available" — fetch it:

```sh
curl -sO https://raw.githubusercontent.com/rabindranath1311/canon-vault/main/scripts/verify-vault.mjs
node verify-vault.mjs --vault .
```

It needs Node and nothing else. It exits non-zero and prints one line per
problem. **If the count is not zero, fix them and re-run before reporting.**
Do not report success without having run it.

## What you must not do

- Do not rewrite `log.md` entries. It is append-only.
- Do not bulk-rewrite the vault. A migration that touches every file at once is
  a migration whose mistakes are invisible. Convert on next touch instead.
- Do not `rm` anything. `.trash/` exists for this.
- Do not reformat frontmatter timestamps. `+00:00`, unquoted, or Obsidian stops
  rendering them as dates.
- Do not write inside `raw/`.
