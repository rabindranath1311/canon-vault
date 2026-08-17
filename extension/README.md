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

That is the whole setup: one folder, one click. Everything else on that page —
the default wall, what a clipped link becomes — has a working default and can
stay untouched, which is why none of it is shown until the folder is connected.

Chrome hands out folder access **per browser session**, so it lapses when Chrome
restarts. Nothing is lost when it does: clips queue, the toolbar badge marks the
vault as locked before you clip rather than after, and the popup's banner
unlocks it in one click.

Chromium only — the File System Access API does not exist in Safari or Firefox,
which is the same constraint the app has.

## What each thing does

| you do | you get |
| --- | --- |
| Right-click an image → **Save this image to the wall** | the image in `attachments/`, a card on your wall with its caption, tags and the page it came from |
| <kbd>Alt</kbd><kbd>Shift</kbd><kbd>S</kbd>, or **Region** | drag a rectangle; the crop lands on the wall — the fastest way to keep one component rather than a whole page |
| <kbd>Alt</kbd><kbd>Shift</kbd><kbd>C</kbd>, or **Clip page** | a bookmark: `notes/<Title>.md` with `url` and the page's `og_*` keys, which is what makes it render as a card |
| Select text → **Clip selection** | a note whose body is that quotation, with the source url |
| **Clip page image** | the page's own `og:image`, straight onto the wall |
| Toolbar popup | the same, with a caption, tags and a choice of wall before it is written |

A wall is an ordinary `inspo` page. The first clip onto a name creates it; after
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
popup.js          one screen, three seconds
vault.js          the setup page: folder picking, defaults, stuck clips
vault/            MIRROR of app/vault — never edit; run
                  `node scripts/sync-extension.mjs`
```

The interesting half — what a capture becomes, and the escaping that keeps a
hostile page from forging structure in your vault — is
[`app/vault/clip.js`](../app/vault/clip.js), tested in
[`app/test/clip.test.js`](../app/test/clip.test.js) against an in-memory vault.
A decision that can only be exercised by clicking through Chrome is a decision
nobody can test, so those decisions do not live in this folder.
