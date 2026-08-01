# Canon Vault

A second brain for designers. **Plain markdown files on your
disk, read and written directly by a web app. No server, no database, no
account.**

Your notes are ordinary files in an ordinary folder. Obsidian opens them. Your
coding agent reads and edits them. The app gives you the one thing neither of
those does unasked: a dashboard of what you have actually been thinking about.

---

## The idea

**The convention is the product.** A folder of markdown with a small, honest
frontmatter contract works with zero install, in any editor, with any agent. The
app is a good client for it — not the thing that owns your data.

Three equal clients, none privileged:

| Client | What it is for |
| --- | --- |
| **The app** | dashboard, inspo grid, editing, triage |
| **Obsidian** | canvas arranging, backlinks, deep search, mobile |
| **Your agent** | synthesis, bulk edits, refactors |

None of them may store anything the others cannot read. If Obsidian renders it
as garbage, it is wrong.

## The vault

```
your-vault/
├── CONVENTION.md      the rules, visible while you work
├── index.md           the catalog — every page, one line each
├── log.md             append-only history of what happened when
├── context/           who you are — read by any agent before it writes
├── notes/             anything read as prose
├── topics/            living hubs
├── tags/              subjects — near-empty pages you link instead of #tagging
├── canvas/            spatial boards (.md + .canvas)
├── inspo/             visual reference
├── projects/          a folder per project
├── raw/               immutable sources the wiki cites but never edits
└── attachments/       images and binaries
```

Every page carries `id`, `kind`, `title`, `created`, `updated`. Links are
ordinary `[[Wikilinks]]`. Subjects are pages in `tags/` — filing means linking
them, and their backlinks are the collection; native `#tags` mark workflow
state. Nothing is app-private.

## Running it

There is nothing to install and nothing to start.

```sh
python3 -m http.server 8091 --directory app
```

Open `http://localhost:8091`, pick your folder, and that is the whole setup. The
app remembers the folder, works offline, and installs to your dock as a PWA.

**Chromium only** — Chrome, Edge, Arc or Brave. The File System Access API does
not exist in Safari or Firefox, and without it there is no way to read your
files without uploading them, which is the whole point. Other browsers get a
page explaining exactly that.

**Hosting it** is a file copy: `vercel.json` ships in the repo and serves
`app/` statically, no build step — `vercel deploy` is the whole pipeline. Your
notes never touch the host either way; the app reads your local folder in the
browser.

## Safety

Your files are the source of truth, so the app treats them carefully:

- **Deletes** move to `.trash/`, never a hard delete.
- **Overwrites** snapshot the previous version to `.history/` first.
- **A page edited outside the app** refuses to be silently overwritten — you are
  offered reload or overwrite, and overwriting keeps both versions.

None of that depends on git. Add git if you want long-term history.

## Development

```sh
node --test 'app/test/**/*.test.js'          # no npm install
node scripts/verify-vault.mjs --vault <dir>  # byte-identical round-trip check
```

No framework, no bundler, no build step. Dependencies are vendored as files.

## License

MIT — see [LICENSE.txt](LICENSE.txt).
