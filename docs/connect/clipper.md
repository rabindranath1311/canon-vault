# The clipper

A Chrome extension that collects inspiration — images, screenshots, links,
quotations — into the vault while you browse. It lives in
[`extension/`](../../extension) and installs from this repo.

`chrome://extensions` → Developer mode → **Load unpacked** → pick `extension/`.
The setup page opens; choose your vault folder. Chromium only, for the same
reason the app is: `showDirectoryPicker` exists nowhere else.

## Where things land

Nothing here is a new file format. A clip is one of two things the convention
already has.

**A wall card.** Images and screenshots go to an `inspo` page — an ordinary
reference wall whose items live in the markdown body, so Obsidian renders the
same page as pictures with captions. The image itself is written to
`attachments/` and embedded with `![[…]]`.

```markdown
![[attachments/nav 2026-08-15.png]]
Stripe's settings nav — the whole hierarchy in one column
#ui #navigation
https://stripe.com/docs
```

**A bookmark.** A clipped page or link is a `note` carrying `url` plus the
page's `og_*` keys, which is exactly what makes the app draw it as a card. A
selection becomes a note whose body is the quotation.

The wall is named in the extension's settings — `Interface Inspiration` out of
the box. The first clip creates it. Rename it in Obsidian afterwards and the
clipper still finds it: walls are matched by title, not by filename.

## What it refuses to do

**It never creates a vault.** The scaffolding half of the app is deliberately
not shipped in the extension. Point it at the wrong folder and it says the
folder is not a vault, rather than making it one.

**It never overwrites an edit it did not see.** Clips go through the same
`Vault.put` as everything else: `.history` snapshot first, conflict gate before
that. If you rearranged the wall in Obsidian since the clipper last read it, the
write is refused and the clip stays queued — visible, with the reason, on the
setup page.

**It never loses a clip to a locked folder.** Chrome grants File System Access
per session, so the permission lapses on restart, and a service worker has no
user gesture with which to ask for it back. Every capture is therefore written
to a local queue *before* any attempt to save it; the toolbar badge shows how
many are waiting, and one click on **Unlock** writes all of them.

**It never phones home.** The only requests it makes are for the image you
clicked on. There is no server in this project to send anything to, and the test
suite fails if a literal URL appears anywhere in the extension's code.

## A page is not a trusted source

Everything a clip carries — the title, the `og:description`, an image's alt
text, the selection — is written by the page, and pages can say anything,
including the strings this vault's file format treats as structure. So captions
are collapsed to one line and escaped where they would otherwise open a group
(`## …`), a tag line (`#…`) or an embed (`![[…]]`); URLs are dropped unless they
are `http(s)`; tags are reduced to letters, digits and dashes.

That normalisation is [`app/vault/clip.js`](../../app/vault/clip.js) and it is
tested, in Node, against an in-memory vault — including the case where a page
titles itself `## Attachments`.

## Editing the copy of the data layer

`extension/vault/` is a **mirror** of `app/vault/`, byte for byte, because a
browser extension can only load files inside its own directory. Edit
`app/vault/`, then:

```sh
node scripts/sync-extension.mjs
```

`app/test/extension.test.js` fails while the two differ, so the copy cannot rot
quietly. This is the same arrangement `brain/CONVENTION.md` and
`app/vault/brain-text.js` already have.
