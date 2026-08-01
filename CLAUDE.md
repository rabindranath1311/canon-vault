# Second Brain — agent contract

A personal capture + thinking OS. **Plain markdown files on disk, read and
written directly by a static web app. No server, no database, no cloud.**

Obsidian and your coding agent are first-class clients of the same files. This
file is the contract for agents working in **this repo — the app**. The vault
has its own `CLAUDE.md` and `CONVENTION.md`; they govern file *content*, this
one governs the *code*.

---

## The two repos

| | |
| --- | --- |
| **This repo** | the app: static HTML/JS/CSS. Publishable, and **this is what deploys** — `vercel.json` serves `app/` as static files with no build step. |
| **The vault** | the user's notes — a **separate git repo**, a sibling, never inside this one. |

**Never put real vault content in this repo** — no pages, no screenshots, no
exports, no page titles, not even in a test fixture. This is structural, not a
preference: `backup/` is gitignored, and the migration tooling that reads real
content lives outside the repo entirely. Seed a fictional demo vault instead.

---

## The model, in one line

Four kinds — `note`, `topic`, `canvas`, `inspo` — selected by `kind:` in
frontmatter, not by folder. A project is a folder, not a kind.

**The file format is not defined here.** It lives in the vault's
`CONVENTION.md`, which is the single authority; restating it in two places is
how the two drift apart. What the code needs to know:

- `KIND_ORDER` in [app/app.js](app/app.js) must match those four.
- Wikilinks resolve **basename → aliases → path, case-insensitive**
  ([app/vault/links.js](app/vault/links.js)). Obsidian never reads a `title:`
  field, so any code that assumes otherwise produces dead links. This is the
  single most important invariant in the codebase.
- `note` chrome is chosen from frontmatter, not kind — which is why bookmark,
  snippet and markdown collapsed into one.

---

## Layout

```
app/                 the whole product — no framework, no bundler, no build step
  index.html         bump the ?v= cache-bust when shipping JS/CSS
  boot.js            feature-detects showDirectoryPicker; explainer or app
  app.js             screens and rendering
  styles.css         the shadcn/zinc design system — one `:root` block (DESIGN.md)
  vault/             the data layer — everything below is testable in Node
    mdfile.js        the file format contract: frontmatter + body, serialize/parse
    vault.js         the data interface over two backends (File System Access, memory)
    data.js          what the old REST endpoints computed, done locally
    links.js         wikilink resolution
    dashboard.js     the landing screen
    bridge.js        stands the vault up, exposes window.SB_DATA, loads app.js
  vendor/            js dependencies, vendored — markdown-it, Inter, JetBrains Mono
  test/              node --test, no npm install
scripts/
  verify-vault.mjs   the VERIFY check: byte-identical round-trip + invariants
bin/                 macOS capture scripts that write straight into the vault
```

**No build step, and no npm install.** Dependencies are vendored as files.
`app/package.json` exists only so Node treats `app/**/*.js` as ES modules — it
has zero dependencies and must never gain any.

---

## Running it

```sh
python3 -m http.server 8091 --directory app
```

Then open `http://localhost:8091`. `localhost` is a secure context, so the File
System Access API works. There is nothing else to start.

Tests and the vault check:

```sh
node --test 'app/test/**/*.test.js'
node scripts/verify-vault.mjs --vault <path-to-a-vault>
```

---

## Deploying

**The app deploys from this repo**, not from the marketing site's repo. `app/`
is served statically — `buildCommand: null`, no framework — so a deploy is a
file copy.

Three headers matter and are set in `vercel.json`:

- `sw.js` as `application/javascript` with `max-age=0`, because a cached service
  worker can never update itself;
- `manifest.json` as `application/manifest+json`, or Chrome will not offer to
  install;
- `vendor/*` immutable for a year — it is versioned by content.

`/(.*) → /index.html` so a cold load of `/#page/<id>` resolves instead of 404ing.

> The marketing site is still a **separate** repo. What changed is only that the
> *app* deploys from here; nothing about the site moves in.

---

## Hard rules

- **No server, no Python, no database.** If a feature seems to need one, it is
  the wrong feature. `fetch()` to a URL appears zero times in `app.js`; keep it
  that way.
- **Chromium only.** `showDirectoryPicker` does not exist in Safari or Firefox.
  Non-Chromium visitors get an explainer, never a blank page.
- **Never write on adoption.** A file with no `id:`/`kind:` is displayed but
  left untouched on disk. Stamping happens on the first edit through the app.
- **The app never writes canvas geometry.** Arranging happens in Obsidian.
- **No hardcoded paths or vault names.** Every path derives from the folder the
  user picked.
- **No in-app language-model features.** The agent has the whole vault already.
- **Write safety is not optional:** deletes move to `.trash/`, overwrites
  snapshot to `.history/` first, and a page changed on disk refuses to be
  written over.

## Defaults & taste

- **Prefer updating a page over creating one.** Duplication is the enemy.
- **Prefer linking to copying.** A wikilink beats a restated paragraph.
- **Cite or omit.** Say when you are synthesising.
- **Dates are absolute.** Convert "last week" to `YYYY-MM-DD`.
- **Verify against the running app**, not against this file — it drifts.
