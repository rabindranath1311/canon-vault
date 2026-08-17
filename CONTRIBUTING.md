# Contributing

Bug reports, docs fixes and features are all welcome. Read the constraints
first — they are load-bearing, and several obvious-looking improvements are
things the project has deliberately decided against.

## The constraints

These are not preferences. A PR that breaks one will be declined however good
the code is, so please check before you spend an afternoon.

**No build step, no bundler, no framework.** `app/` is served exactly as it sits
in the repo. A deploy is a file copy. This is what makes the app auditable by
someone who does not trust it — view-source is the real source.

**No dependencies.** `app/package.json` exists only so Node treats `app/**/*.js`
as ES modules. It has zero dependencies and must never gain any. Libraries we do
use — markdown-it, Inter, JetBrains Mono, Excalidraw — are vendored as files
under `app/vendor/`. Vendoring is redistribution, so anything added there must
bring its license with it and gain a row in [THIRD-PARTY.md](THIRD-PARTY.md);
`app/test/vendor-license.test.js` fails if the two drift apart.

**No server, no database, no `fetch()` to an origin.** If a feature seems to
need one, it is the wrong feature. The whole premise is that your files never
leave your machine.

**Chromium only.** `showDirectoryPicker` does not exist in Safari or Firefox. We
will not add an upload fallback — uploading the files is precisely the thing the
project exists to avoid. Non-Chromium visitors get an explainer, never a blank
page.

**No in-app language-model features.** Your agent already has the whole vault,
in a format designed for it. Putting a model inside the app adds an API key, a
network call and a bill to a thing that currently has none of the three.

**Write safety is not optional.** Deletes move to `.trash/`. Overwrites snapshot
to `.history/` first. A page changed on disk refuses to be silently overwritten.
Adoption writes nothing at all.

**Files are the plugin API.** There will not be a plugin system. Anything that
can write a markdown file into a folder is already an integration.

## Working on it

```sh
node scripts/serve.mjs 8091 app                 # run it (python3 -m http.server works too)
node --test 'app/test/**/*.test.js'             # test it — no npm install
node scripts/verify-vault.mjs --vault <dir>     # check a vault round-trips
node scripts/sync-extension.mjs                 # after ANY change under app/vault/
```

Everything under `app/vault/` is pure and testable in Node; that is where logic
should live. `app/app.js` is rendering.

If you ship JS or CSS, **bump the `?v=` query in `app/index.html`**, and bump
`CACHE_VERSION` in `app/sw.js` if you touched the service worker. A stale
service worker is the single most common "my change did not deploy".

## Changing the convention

[`brain/CONVENTION.md`](brain/CONVENTION.md) is the single authority on the file
format. The app cannot fetch it at runtime (no build step), so the text is
mirrored into `app/vault/brain-text.js`.

**Edit the markdown, never the mirror**, then:

```sh
node scripts/sync-convention.mjs
```

`app/test/convention.test.js` fails if they drift, so this cannot be forgotten
silently.

Changing the format itself is a bigger deal than changing the prose: real vaults
are already written against it. A breaking change needs a bump to
`CONVENTION_VERSION` in `app/vault/scaffold.js` and a story for reading the old
form.

## The invariant to be most careful with

Wikilinks resolve **basename → aliases → path, case-insensitive**
([app/vault/links.js](app/vault/links.js)). Obsidian never reads a `title:`
field. Any code that assumes otherwise produces a vault full of dead links that
looks completely fine until someone opens it in Obsidian.

## Pull requests

- One change per PR.
- Add a test if you fixed a bug — the suite is fast and needs no install.
- Match the surrounding code. No new formatter, no repo-wide reformat.
- Say what you verified. "Tests pass" and "I ran it and clicked through" are
  different claims and both are useful.

## Reporting a bug

Include the browser and version, what you expected, what happened, and anything
in the console. If it involves a specific page, the frontmatter of that page is
usually the whole story — but please redact anything private first. **Never
paste real vault content into an issue**; a minimal fictional page that
reproduces it is more useful anyway.
