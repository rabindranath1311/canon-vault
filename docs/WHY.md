# Why it is built this way

Every constraint in this project is unusual enough that someone eventually files
an issue asking to remove it. This is the argument for each, in one place, so
that conversation can start from what was actually considered.

---

## Why files

Because the alternative loses.

A note-taking app with a database is a bet that the app will outlive the notes.
That bet has lost repeatedly and publicly — for everyone who used Evernote, or
Google Notebook, or Catch, or Springpad, or any of the dozen tools whose export
button produced an archive nobody could read. The notes were fine. The *reader*
went away.

Plain markdown in a folder inverts the risk. There is no export, because there
is nothing to export from. If this app disappears tomorrow, you lose a
dashboard. You keep every word.

This is also why the convention is written down and published rather than
implied by the code. A format only one program understands is a database with
extra steps.

## Why no server

Three reasons, in order of how much they matter.

**It is the only honest version of "your notes are private."** Not encrypted in
transit, not stored in a region you selected, not covered by a policy — never
sent. You can verify this in DevTools in about ten seconds, which is a stronger
guarantee than any privacy page.

**It removes the entire operational surface.** No accounts, no auth, no sync
conflicts on someone else's schedule, no outage, no migration, no bill, no
company that has to keep existing for your notes to open.

**It makes the app auditable.** There is no build step, so what is served is
what is in the repo. View-source is the real source. That is unusual enough to
be worth protecting deliberately.

The cost is real: no mobile, no sharing, no multi-device sync of its own. Those
are handled by things that are already good at them — Obsidian for mobile, git
or Syncthing or iCloud for sync. See [connect/sync.md](connect/sync.md).

## Why Chromium only

Because the alternative is uploading your files.

Reading a local folder from a web page requires the File System Access API.
Safari and Firefox have never shipped it. The only way to support them is a file
picker that uploads — which needs somewhere to upload *to*, which is a server,
which is the thing this project exists not to have.

So a non-Chromium visitor gets a page explaining exactly that, rather than a
degraded mode that quietly breaks the promise. A fallback here would not be a
compromise; it would be the opposite product.

## Why not a native app

A native app would fix the browser constraint and cost more than it is worth: a
build pipeline, a signing certificate, an update mechanism, a per-platform
release, and an install step before anyone can see whether they like it.

The web version has none of that and installs to the dock as a PWA anyway. If
the File System Access API ever ships more widely, this decision improves on its
own without anyone doing anything.

## Why no AI inside the app

This is the one that surprises people, given how obviously an AI-shaped product
this is.

Your agent already has the whole vault. It is plain markdown in a folder, with a
published format and a contract file that tells the agent how to operate — see
[`brain/`](../brain/). Claude Code, Cursor, or something you wrote yourself can
read every page, edit in bulk, find contradictions and file new notes, today,
with no integration work at all.

Putting a model *inside* the app would add an API key, a network call, a bill,
and a second-rate version of a thing you can already do better in a tool built
for it. The integration surface for AI here is `write()`. That is the feature.

## Why the tag pages

A subject is a page in `tags/` with an empty body. Filing something under it
means writing `[[that subject]]` in your note. The subject's backlinks are the
collection.

Native `#tags` would be simpler to type and worse in every other way. A tag is a
string; a page is a thing you can link to, write on later, and see in a graph.
Obsidian's backlink pane and this app's BACKLINKS card both show the collection
for free, with no query language and no plugin.

So `#tags` are kept for what they are genuinely good at — workflow state, like
`draft` or `current` — and subject matter is links. The two are not
interchangeable, and mixing them is how a vault becomes unsearchable.

## Why the filename is the title

Because Obsidian resolves `[[Wikilinks]]` against the **filename and aliases**,
and never reads a `title:` field.

This sounds like a detail and is the single most important invariant in the
codebase. A vault with slug filenames and `[[Title]]` links looks completely
correct in any tool that reads frontmatter — and every link in it is dead the
moment you open Obsidian. It is a silent, total failure, which is exactly the
kind this project is built to avoid.

## Why no build step

Partly auditability, as above. Mostly because a build step is a slow leak.

It starts as one bundler. Then the bundler needs a config, then a plugin for the
config, then a lockfile, then a CI runner to reproduce the lockfile, and two
years later the project cannot be built at all because a transitive dependency
was unpublished. Meanwhile the actual product — some HTML, some CSS, some JS —
never needed any of it.

`app/package.json` exists only so Node treats the files as ES modules. It has
zero dependencies and CI fails if it gains one.

## Why there is one writer per spatial format

Two apps moving the same node is a merge problem nobody wants, and the cost of
getting it wrong is not a conflict dialog — it is a scene silently overwritten
with a worse version of itself.

So each spatial format has exactly one writer, decided by the file extension:

- **`.canvas` is Obsidian's.** JSON Canvas, Obsidian's format and Obsidian's to
  edit. This app does not render it, list it or count it — the reader for it was
  deleted rather than kept as a tempting half-feature. A bare `.canvas` still
  reserves its wikilink name, so the app can never write a second file that
  makes `[[Sketches]]` ambiguous in files it did not write.
- **`.excalidraw.md` is this app's.** Shapes, arrows and handwriting, edited here
  and saved here — and readable in Obsidian too, via the Excalidraw plugin.

The page tells you which one you are looking at, because the label is the only
thing saying whether your edits will be kept: a `.excalidraw.md` is a **Board**,
a `.canvas` is a **Canvas**. Two things must never both be called Board.

The rule underneath both: **never ship editing a surface cannot save.** A hidden
toolbar over live handlers is how a stylus stroke once came to overwrite a
board. If a surface cannot write, it must not accept the gesture.

Boards stay legible outside the app for the same reason everything else does.
Their text, element links and embedded images are regenerated into the markdown
on every write, so the words in a sketch reach Obsidian, the backlink graph and
an agent instead of sitting in a blob.

## What this project is bad at

Stated plainly, because a README that only lists strengths is not information.

- **No mobile.** The API does not exist on mobile browsers. Use Obsidian.
- **No sharing or collaboration.** No server, so no multiplayer. It is a tool for
  one person's thinking.
- **No sync of its own.** You choose git, iCloud, Syncthing or Obsidian Sync, and
  you own the conflict story.
- **Chromium only**, permanently, unless other engines ship the API.
- **It will not organise your notes for you.** The convention is opinionated and
  learning it takes an afternoon. If you want something that works with no rules
  at all, this is the wrong tool.

If none of those are dealbreakers, the trade you get is this: notes that will
still open in thirty years, in any editor, with or without this app.
