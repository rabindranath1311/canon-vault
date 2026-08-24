# Canon Clip

A Chrome extension that collects interface inspiration — images, screenshots,
links and quotations — **straight into your vault folder**, as plain markdown.

No server, no account, nothing uploaded. It writes the same files the app and
Obsidian open, through the app's own data layer.

## Install

It is not in the Chrome Web Store; load it from this repo.

1. `chrome://extensions` → turn on **Developer mode**
2. **Load unpacked** → choose this `extension/` folder
3. The setup page opens by itself → **Choose vault folder…** → pick the folder
   holding your `CONVENTION.md`
4. Pin the toolbar icon

That is the whole setup: one folder, one click. There is exactly one setting —
the wall your pictures land on — and it has a working default, which is why it
is not shown until the folder is connected.

Chrome hands out folder access **per browser session**, so it lapses when Chrome
restarts. Nothing is lost when it does: clips queue, the toolbar badge marks the
vault as locked before you clip rather than after, and the popup's banner
unlocks it in one click.

Chromium only — the File System Access API does not exist in Safari or Firefox,
which is the same constraint the app has.

## How to use it

**Three places, chosen before you save.** The popup's first control is where it
goes, and the rest of the form is whatever that destination can carry.

| | goes to | carries |
| --- | --- | --- |
| **Note** | `notes/<Title>.md` | title, picture, the highlighted text, your words, tags, and `source` / `author` / `og_description` as properties |
| **Bookmark** | `notes/<Title>.md` with `url` | title, your note, tags, and the same properties — the site as a card |
| **Inspo** | `inspo/<Wall>.md` + `attachments/` | a picture, a caption, tags, and which wall |

A Note carries its link in **`source:`**; a Bookmark carries it in **`url:`**.
That is not decoration: [`noteChrome`](../app/vault/data.js) draws any note with
a `url` as a bookmark card and does not display its body, so a clipped article
with a highlight and a snapshot would render as a bare link with the capture
hidden behind it. `source` is in the convention's own field list, no renderer
keys off it, and it is the property Obsidian's clipper writes.

**The title is the filename**, so it is editable, and the line under it shows
the name the file will get — including *"“Canon Vault” is taken"* before you
save rather than a mystery `Canon Vault 2.md` afterwards.

**Picture**, under Note and Inspo: *This image* (the one you right-clicked),
*Preview* (the `og:image` the site advertises when its link is shared), *Screen*
(the visible window), or *Region* (drag a rectangle — the popup closes for the
drag and keeps what you typed). Screen and Region photograph what is on screen;
neither scrolls.

**Add to a page** puts the capture at the bottom of a page you already have
instead of making a new file — a highlight into a research note, an image onto
any wall. On a wall it is written as a real inspo item, so the wall keeps
parsing as one.

**Right-click opens the same form**, loaded with what you pointed at: an image,
a link, a selection, the page, or a region. Nothing is written until you press
save. The two keyboard shortcuts skip the form on purpose —
<kbd>Alt</kbd><kbd>Shift</kbd><kbd>C</kbd> bookmarks the page,
<kbd>Alt</kbd><kbd>Shift</kbd><kbd>S</kbd> drags a region onto the wall.

A wall is an ordinary `inspo` page. The first save onto a name creates it; after
that everything lands on the same one. Rename it in Obsidian and the clipper
still finds it — it matches on the title, not the filename.

## What it will not do

- **Create a vault.** `scaffold.js` is deliberately not mirrored here. Point it
  at a folder that is not a vault and it says so.
- **Overwrite someone else's edit.** Every write goes through the same conflict
  gate the app uses: a wall changed on disk since the clipper last read it is
  refused, and the clip stays in the queue.
- **Lose a clip.** Captures are queued in IndexedDB *before* any write is
  attempted. Chrome hands out folder permission per session, so it lapses — when
  it does, the badge shows the count and the setup page has an Unlock button.
- **Phone home.** The only network requests are for the image you clicked on.
  There is no endpoint in this code; `app/test/extension.test.js` fails if a
  literal URL ever appears in it.

## How it is built

```
manifest.json     MV3; five permissions, and the tests assert the list
background.js     menus, shortcuts, and the queue → vault pump
injected.js       the three functions that run in the page (metadata, image
                  bytes, the region overlay) — self-contained, by necessity
store.js          the capture queue (IndexedDB), the handle, the settings
writer.js         the handle, its permission, and standing the Vault up
popup.js          the capture form, aimed by the destination at the top
vault.js          the setup page: folder picking, the one setting, stuck clips
vault/            MIRROR of app/vault — never edit; run
                  `node scripts/sync-extension.mjs`
```

The interesting half — what a capture becomes, and the escaping that keeps a
hostile page from forging structure in your vault — is
[`app/vault/clip.js`](../app/vault/clip.js), tested in
[`app/test/clip.test.js`](../app/test/clip.test.js) against an in-memory vault.
A decision that can only be exercised by clicking through Chrome is a decision
nobody can test, so those decisions do not live in this folder.
