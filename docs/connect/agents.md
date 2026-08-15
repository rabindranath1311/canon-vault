# Connecting an agent

There is no plugin to install, no MCP server to run, and no API key. An agent
that can read and write files is already a complete client — it just needs to
know the rules.

**The whole integration is two files in your vault root:**

```sh
cd <your-vault>
BASE=https://raw.githubusercontent.com/rabindranath1311/canon-vault/main
curl -sO $BASE/brain/CONVENTION.md   # the file format
curl -sO $BASE/brain/AGENTS.md       # what an agent may do here
curl -sO $BASE/brain/CLAUDE.md       # a pointer, for Claude Code
```

A vault scaffolded by the app or by [the setup prompt](../../brain/SETUP-PROMPT.md)
already has them.

## Why files and not a prompt

A prompt you paste is gone by the next session. A file in the vault root is read
by every agent, every time. `AGENTS.md` is the durable artifact; the setup
prompt is just the thing that puts it there.

## Where each tool looks

`AGENTS.md` is the primary name because most tools have converged on it. Claude
Code reads `CLAUDE.md`, which is why the pointer exists.

| Tool | Reads | Extra setup |
| --- | --- | --- |
| **Claude Code** | `CLAUDE.md` → `AGENTS.md` | `cd <vault> && claude` |
| **Cursor** | `AGENTS.md` | open the vault as the workspace folder |
| **Codex** | `AGENTS.md` | none |
| **Aider** | — | `aider --read AGENTS.md --read CONVENTION.md` |
| **Your own agent** | whatever you tell it | load both files into the system prompt |

## Bringing your own agent

If you have built your own — a personal assistant, a scheduled job, a bot — the
requirements are exactly two:

1. **Filesystem read/write** on the vault directory.
2. **A way to load a standing instruction file** before it acts.

That is the entire contract. No adapter, no schema, no transport. If your agent
can `cat` a file and `write` a file, it is a first-class client — the same
standing as the app and as Obsidian.

Two things to give it, in this order:

- `CONVENTION.md` — the file format. Non-negotiable; if it guesses this, the
  vault looks fine and fails silently in Obsidian.
- `AGENTS.md` — the operating rules and the ingest → file → lint loop.

Then hand it a task from [RECIPES.md](../../brain/RECIPES.md).

## The safety story

This is the part worth being deliberate about: you are giving something write
access to your notes.

- **The validator is the backstop.** `AGENTS.md` requires the agent to run it
  before reporting done, and it checks that every file survives parse →
  serialize byte for byte, that required frontmatter is present, and that no
  ULID wikilink has crept in:

  ```sh
  curl -sO https://raw.githubusercontent.com/rabindranath1311/canon-vault/main/scripts/verify-vault.mjs
  node verify-vault.mjs --vault .
  ```

  Node and nothing else. Exits non-zero, one line per problem.

- **Deletes go to `.trash/`.** The contract forbids `rm`.
- **`git init` your vault.** Nothing here depends on git, but it is the only
  thing that makes a bad bulk edit a one-command undo. Do it before you first
  point an agent at a vault you care about.
- **No bulk rewrites.** `AGENTS.md` forbids them, for the reason that a
  migration touching every file at once is a migration whose mistakes you cannot
  review.

## What agents are actually good at here

Worth saying, because the obvious uses are the weak ones. Agents are mediocre at
writing your notes for you and very good at the janitorial work you will never
do: finding the four pages that say contradictory things, noticing the topic you
have written around six times without ever making a hub for, catching the pages
nothing links to, and filing the good answer from a conversation before it is
lost. [RECIPES.md](../../brain/RECIPES.md) is mostly that.
