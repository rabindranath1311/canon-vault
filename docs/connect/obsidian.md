# Obsidian

There is no import and no sync. A Canon Vault **is** an Obsidian vault — same
folder, same files, both open at once.

**File → Open folder as vault**, point at your vault directory. Done.

## The setting that will break your vault

**Settings → Files & Links → "Use [[Wikilinks]]" must be ON.**

It is on by default, but check it. With it off, every link Obsidian writes comes
out as `[Title](Title.md)` instead of `[[Title]]`, and the app's link graph
stops seeing them. You will not get an error — links just quietly stop counting,
and you will notice weeks later when backlinks look empty.

## The rest of Files & Links

| Setting | Value | Why |
| --- | --- | --- |
| Default location for new notes | `notes/` | otherwise new notes land at the root, outside the structure |
| Default location for attachments | `attachments/` | keeps binaries out of `notes/` |
| New link format | Shortest path when possible | matches how the convention writes links |
| Automatically update internal links | ON | renames keep links alive on both sides |
| Detect all file extensions | ON | so `.excalidraw.md` boards and any `.canvas` files are visible |

## Core plugins worth turning on

- **Excalidraw** (community plugin) — optional, and the only way to edit a board
  on this side. `canvas/*.excalidraw.md` is written in the format this plugin
  reads, so the same board opens and edits in both places. Without it the file
  still opens as an ordinary note: you see its text and links, not the picture.
- **Canvas** (core) — only if you keep `.canvas` files. Those are Obsidian's
  alone; this app does not render, list or count them, and never writes one.
- **Backlinks** and **Outgoing links** — this is where the tag-page design pays
  off. A subject page in `tags/` is empty on purpose; its backlink pane *is* the
  collection.
- **Graph view** — filter to `path:tags/` to see how your subjects actually
  cluster.
- **Templates** — point it at a folder of your own; the convention does not care.

## Community plugins worth it

- **Excalidraw** — the app renders `.excalidraw` files natively, so a drawing
  you make in Obsidian shows up in the app without an export step. Of everything
  here, this is the pairing people miss.

You do not need Dataview. `index.md` is a plain file an agent maintains, which
means it also works in the app, in `grep`, and on GitHub — none of which can run
a Dataview query.

## Frontmatter in the Properties panel

Obsidian shows frontmatter as editable properties. Two things to know:

- **Do not let it rewrite timestamps.** `created` and `updated` use the
  `+00:00` form, unquoted. If a property editor turns one into a date object or
  a `Z` suffix, the round-trip check will flag it.
- **Wikilinks in frontmatter must stay quoted** — `parent: "[[Some Page]]"`.
  Unquoted, YAML reads it as a nested list, not a link.

## Committing `.obsidian/`

Worth doing. The vault's own config travels with it, so a clone opens with the
same settings. `.trash/` and `.history/` are the opposite — they churn on every
write and would bury real history:

```gitignore
.trash/
.history/
.DS_Store
```

## Mobile

Obsidian mobile opens the same folder over iCloud Drive, Syncthing or Obsidian
Sync — see [sync.md](sync.md) if you set that up. The app itself is desktop
Chromium only, because the File System Access API does not exist on mobile
browsers.

## Checking it worked

Open any page, then:

- the Properties panel shows `id`, `kind`, `title`, `created`, `updated`;
- `[[links]]` in the body are clickable and resolve;
- a `canvas/*.excalidraw.md` page opens as a drawing with the Excalidraw plugin
  installed, and as a readable note without it;
- an empty page in `tags/` has a populated Backlinks pane.

If links show as unresolved, it is the Wikilinks setting at the top of this page
99 times out of 100.
