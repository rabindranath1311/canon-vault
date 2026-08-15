# Recipes

Task-shaped prompts for a vault that already exists. Paste one into an agent
pointed at your vault. Each assumes `AGENTS.md` is in the vault root and has
been read.

They are deliberately blunt. Vague instructions to an agent with write access to
your notes is how you get a hundred plausible pages nobody asked for.

---

## Ingest a source

> Read `raw/<file>`. Distill it into the vault: update an existing page if one
> covers this, otherwise create one. Cite the raw file; do not absorb it. Link
> every subject it touches to its `tags/` page, creating the tag page if it does
> not exist. Update `index.md`, append to `log.md`. Then run the validator and
> show me the diff before I trust it.

## File a conversation back

> Take what we just worked out and write it into the vault as a page. Search
> first — if a page already covers this, update that one instead. Keep my voice:
> read `context/` before you write. Link it to the subjects it touches. Update
> `index.md` and `log.md`.

## Weekly lint

> Sweep the vault and report before changing anything:
> 1. pages missing from `index.md`
> 2. orphans — pages nothing links to
> 3. unresolved `[[wikilinks]]`
> 4. contradictions between pages on the same subject
> 5. stale claims — dates that have passed, "currently" that is no longer true
> 6. near-duplicate pages that should be merged
>
> Show me the list. Fix only what I approve, one item at a time.

## Build a topic hub

> These pages are all about the same thing: <list>. Create a `topic` in
> `topics/` that hubs them — a real summary of what they collectively say, not a
> table of contents. Link out to each. Do not copy their content in. Do not
> delete or modify the source pages.

## De-duplicate

> Find pages that cover the same subject under different titles. For each pair,
> show me both and recommend which survives and what merges in. Change nothing
> until I pick. When merging: keep the older `id` and `created`, move the loser
> to `.trash/`, and add its title to the survivor's `aliases` so inbound links
> still resolve.

That last clause is the one that gets forgotten, and it silently breaks every
link that pointed at the merged page.

## Adopt an existing folder of markdown

> This folder has markdown in it that predates the convention. Do not bulk
> rewrite it. Instead: report how many files lack required frontmatter, how many
> have subject tags that should become `tags/` page links, and what the top
> subjects are. Then stamp only the ten files I name, and stop.

## Catch up after time away

> Read `log.md` and `git log` for the last 30 days. Tell me what I was working
> on, what I left unfinished, and which pages have gone stale. Do not write
> anything.
