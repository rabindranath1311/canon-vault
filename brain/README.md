# brain/

The part of Canon Vault that is not code.

An agent with filesystem access is already a capable vault client — it just does
not know the rules. These four files are the rules. That is the whole
integration: no MCP server, no plugin, no API key.

| File | What it is | Where it goes |
| --- | --- | --- |
| [CONVENTION.md](CONVENTION.md) | the file format — the single authority | copied into the vault root |
| [AGENTS.md](AGENTS.md) | what an agent may do here, and the loop it runs | copied into the vault root |
| [CLAUDE.md](CLAUDE.md) | two lines pointing at `AGENTS.md` | copied into the vault root |
| [SETUP-PROMPT.md](SETUP-PROMPT.md) | one-shot: build a vault from nothing | pasted into an agent, once |
| [RECIPES.md](RECIPES.md) | ongoing tasks: ingest, lint, dedupe, merge | pasted as needed |

## Why the contract lives in the vault, not in the prompt

A prompt you paste is gone by the next session. A file in the vault root is read
by every agent, every time, forever. So `AGENTS.md` is the durable artifact and
`SETUP-PROMPT.md` is just the thing that puts it there.

`AGENTS.md` is the primary name because Cursor, Codex and most others look for
it. Claude Code looks for `CLAUDE.md`, so that exists as a pointer. Neither the
vault nor the format is tied to one agent.

## Adding these to a vault you already have

```sh
cd <your-vault>
BASE=https://raw.githubusercontent.com/rabindranath1311/canon-vault/main
curl -sO $BASE/brain/CONVENTION.md
curl -sO $BASE/brain/AGENTS.md
curl -sO $BASE/brain/CLAUDE.md
```

Then point an agent at the folder and give it a recipe.

## For maintainers

`CONVENTION.md` and `AGENTS.md` are also what the app writes when it scaffolds a
new vault. The app ships with no build step, so it cannot read these files at
runtime — the text is mirrored into `app/vault/brain-text.js`.

**Edit the markdown here, never that file**, then:

```sh
node scripts/sync-convention.mjs
```

`app/test/convention.test.js` fails if the two ever drift, so this cannot be
forgotten silently.
