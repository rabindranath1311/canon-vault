# Canon Vault

A second brain for designers. **Plain markdown files on your disk, read and
written directly by a web app. No server, no database, no account.**

Your notes are ordinary files in an ordinary folder. Obsidian opens them. Your
coding agent reads and edits them. The app gives you the one thing neither of
those does unasked: a dashboard of what you have actually been thinking about.

---

## The idea

**The convention is the product.** A folder of markdown with a small, honest
frontmatter contract works with zero install, in any editor, with any agent. The
app is a good client for it — not the thing that owns your data.

Every constraint here — files, no server, Chromium only, no AI in the app — is
argued in [docs/WHY.md](docs/WHY.md), including what the project is bad at.

Three equal clients, none privileged:

| Client | What it is for |
| --- | --- |
| **The app** | dashboard, inspo grid, editing, triage |
| **Obsidian** | canvas arranging, backlinks, deep search, mobile |
| **Your agent** | synthesis, bulk edits, refactors, filing |

None of them may store anything the others cannot read. If Obsidian renders it
as garbage, it is wrong.

## Start

**1. Run the app.** Nothing to install, nothing to build.

```sh
git clone https://github.com/rabindranath1311/canon-vault
python3 -m http.server 8091 --directory canon-vault/app
```

Open `http://localhost:8091`. Or use a hosted instance — the app is a client, so
running it from someone else's URL gives them no access to your files.

**Chromium only** — Chrome, Edge, Arc or Brave. The File System Access API does
not exist in Safari or Firefox, and without it there is no way to read your
files without uploading them, which is the whole point. Other browsers get a
page explaining exactly that.

Not ready to hand over a folder? The connect screen has a **Try a demo vault** —
the whole app running against invented pages, held in memory, nothing written
anywhere.

**2. Get a vault.** Three ways, depending on what you have:

| You have | Do this |
| --- | --- |
| Nothing yet | Pick an empty folder in the app. It scaffolds the structure, the rules and the agent contract. |
| Nothing yet, and an agent | Paste [brain/SETUP-PROMPT.md](brain/SETUP-PROMPT.md) into your agent. Same skeleton, but it interviews you first and fills it with pages about your actual work. |
| A folder of markdown already | Pick it. The app **adopts it read-only** and writes nothing until you say so. |

**3. Point Obsidian at the same folder.** File → Open folder as vault. See
[docs/connect/obsidian.md](docs/connect/obsidian.md) — there is one setting that
will silently break your links if it is off.

**4. Point your agent at it too.** Two files in the vault root, no plugin, no
MCP server, no API key. See [docs/connect/agents.md](docs/connect/agents.md).

**5. Collect while you browse.** [`extension/`](extension) is a Chrome clipper —
right-click an image, drag a region out of a page, keep a link or a quotation —
writing straight into the same folder as ordinary markdown. Load it unpacked;
see [docs/connect/clipper.md](docs/connect/clipper.md).

## The vault

```
your-vault/
├── CONVENTION.md      the rules, visible while you work
├── AGENTS.md          what an agent may do here
├── index.md           the catalog — every page, one line each
├── log.md             append-only history of what happened when
├── context/           who you are — read by any agent before it writes
├── notes/             anything read as prose
├── topics/            living hubs
├── tags/              subjects — near-empty pages you link instead of #tagging
├── canvas/            spatial boards (.md + .canvas)
├── inspo/             visual reference
├── projects/          a folder per project
├── raw/               immutable sources the vault cites but never edits
└── attachments/       images and binaries
```

Every page carries `id`, `kind`, `title`, `created`, `updated`. Links are
ordinary `[[Wikilinks]]`. Subjects are pages in `tags/` — filing means linking
them, and their backlinks are the collection; native `#tags` mark workflow
state. Nothing is app-private.

The format is specified once, in [brain/CONVENTION.md](brain/CONVENTION.md).
That file is also what the app writes into a new vault, so the published rules
and the shipped rules are the same bytes.

## The brain

[`brain/`](brain/) is the part that is not code — the rules, and the prompts
that make an agent a competent operator of them.

| File | What it is |
| --- | --- |
| [CONVENTION.md](brain/CONVENTION.md) | the file format — the single authority |
| [AGENTS.md](brain/AGENTS.md) | what an agent may do, and the ingest → file → lint loop |
| [SETUP-PROMPT.md](brain/SETUP-PROMPT.md) | one-shot: build a vault from nothing |
| [RECIPES.md](brain/RECIPES.md) | ongoing tasks — ingest, lint, dedupe, merge |

## Capture

Things get into the vault without you typing them — screenshots, voice memos,
web clips. All of them write **files**; there is no upload and no API.
See [bin/SETUP.md](bin/SETUP.md).

## Hosting

`app/` is the whole product. Upload it to any static host — Vercel, Netlify,
Cloudflare Pages, S3, your own nginx. `vercel.json` is committed and correct, so
`vercel --prod` is the entire pipeline. Four headers matter on other hosts, and
one of them genuinely bites; they are in
[docs/deploy.md](docs/deploy.md) along with local-run recipes.

Your notes never touch the host either way. The app reads your local folder in
the browser, which is also why hosting it publicly is safe: there is nothing on
the server to leak.

## Safety

Your files are the source of truth, so the app treats them carefully:

- **Deletes** move to `.trash/`, never a hard delete.
- **Overwrites** snapshot the previous version to `.history/` first.
- **A page edited outside the app** refuses to be silently overwritten — you are
  offered reload or overwrite, and overwriting keeps both versions.
- **Adoption writes nothing.** Point the app at an existing folder and it reads;
  the first write happens when you make one.

None of that depends on git. Add git if you want long-term history — and do,
before you first point an agent at a vault you care about.

## Development

```sh
node --test 'app/test/**/*.test.js'          # no npm install
node scripts/verify-vault.mjs --vault <dir>  # byte-identical round-trip check
```

No framework, no bundler, no build step. Dependencies are vendored as files.
See [CONTRIBUTING.md](CONTRIBUTING.md) — the constraints are load-bearing, and
it says which ones before you spend an afternoon.

## License

MIT — see [LICENSE](LICENSE).
