# Set up a vault with your agent

Copy everything below the line into a fresh agent session, running in the empty
directory you want the vault to live in.

This is the power-user path. The app scaffolds the same skeleton from a folder
picker with no terminal at all — but an agent can fill it with pages that are
actually about *you*, which is the part a folder picker cannot do.

Works with any agent that can read and write files: Claude Code, Cursor, Codex,
Aider, or your own.

---

You are setting up a **Canon Vault**: a folder of plain markdown files that a
web app, Obsidian, and you all read and write as equals. There is no server, no
database and no API. The filesystem is the interface.

Build the vault in the current directory.

## 1. Fetch the rules — do not invent them

Two files define this format. Download them verbatim into the vault root
**before you write anything else**, and follow them exactly:

```sh
BASE=https://raw.githubusercontent.com/rabindranath1311/canon-vault/main
curl -sO $BASE/brain/CONVENTION.md
curl -sO $BASE/brain/AGENTS.md
curl -sO $BASE/brain/CLAUDE.md
curl -so verify-vault.mjs $BASE/scripts/verify-vault.mjs
```

Read `CONVENTION.md` in full now. It is the authority on the file format, and
nothing below restates it — where this prompt and that file disagree, that file
wins.

If you have no network, tell me and stop. Do not reconstruct the convention from
memory: a vault built on a guessed format looks correct and fails silently in
Obsidian.

## 2. Structure

```
context/      identity — read before writing in my voice
notes/        anything read as prose
topics/       living hubs
tags/         subjects — near-empty pages; linking one files a page under it
canvas/       spatial boards (.excalidraw.md)
inspo/        visual reference — embeds and captions, ordinary markdown
projects/     a folder per project, each with a folder note
raw/          immutable sources — clipped articles, transcripts; never edited
attachments/  images and binaries
.trash/       deleted pages, recoverable
.history/     pre-overwrite snapshots
```

Also write `.canon-vault` at the root, exactly:

```json
{ "convention": 1 }
```

## 3. Interview me first

**Do not skip this and do not guess.** A vault seeded with generic filler is
worse than an empty one — it teaches the wrong shape and I will not delete it.

Ask me, in one message, as a short numbered list:

1. What do I actually do? (role, field, what I make)
2. What am I working on right now that I would want to look up in a month?
3. What three or four subjects come up over and over in my work?
4. Where do things currently pile up — screenshots, bookmarks, voice notes,
   chat logs?

Wait for my answers. Build everything below from them.

## 4. What to create

Using my answers:

- **`context/`** — three pages I will fill in, each with a real prompt rather
  than a blank: `about-me.md` (who I am, seeded with what I told you),
  `anti-ai-writing-style.md` (how I do *not* want to be written for),
  `my-company.md` (what I am building and the language I use about it).
- **`tags/`** — one page per subject I named in Q3. Lowercase basename,
  standard frontmatter, **empty body**. Emptiness is the design.
- **One page of every kind**, drawn from my real answers, not from lorem:
  - a `note` in `notes/`
  - a `topic` in `topics/` that hubs the thing I said I am working on
  - **skip `canvas`** — a board is a `.excalidraw.md` scene, and an invented one
    is worse than none. Say in `log.md` that boards are made in the app.
  - an `inspo` in `inspo/` — ordinary markdown: `![[attachments/…]]` embeds, each
    with a one-line caption. No sidecar, no geometry.
- **`index.md`** — the catalog, every page you created, one line each, grouped
  by folder.
- **`log.md`** — first entry records the setup. Entries start
  `## [YYYY-MM-DD] <op> | <title>` so unix tools can parse them.
- **Real `[[Wikilinks]]` between them that resolve.** Link each page to the
  subjects it touches. A vault where nothing links to anything demonstrates
  nothing.

Use today's real date. Generate a genuine 26-character ULID for each `id` — not
a placeholder, not a UUID, not a timestamp you invented a format for.

## 5. Check your work, without being asked

```sh
node verify-vault.mjs --vault .
```

It needs Node and nothing else. It exits non-zero and prints one line per
problem.

**If the count is not zero, fix the files and re-run until it is.** Do not tell
me you are finished without having run it and seen it pass. Report the exact
output.

Then delete `verify-vault.mjs` from the vault root — it is a tool, not a note —
and tell me:

- how many pages you created and where;
- what you put in `tags/`, and why those;
- what I should fill in myself, in priority order.

## 6. Tell me how to open it

Finish by telling me these three things:

1. Open the vault as an **Obsidian** vault — File → Open folder as vault, point
   at this directory. Check Settings → Files & Links → **"Use [[Wikilinks]]" is
   ON**; if it is off, Obsidian rewrites my links and the format breaks.
2. Open it in the **app** — whichever Canon Vault instance I am running — and
   pick this folder.
3. If I want history: `git init && git add -A && git commit`. `.trash/` and
   `.history/` should be gitignored; `.obsidian/` should not.
