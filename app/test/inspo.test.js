// The inspo bento model: markdown in, markdown out, Obsidian-legible throughout.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseInspoBody, serializeInspoBody, inspoTags, itemsFromCanvasLayout,
} from "../vault/inspo.js";

const BODY = [
  "![[attachments/hero.png]]",
  "Neon gradient hero",
  "#ui #gradient",
  "https://dribbble.com/shots/1",
  "",
  "## Typography",
  "![[attachments/serif.png]]",
  "#type",
  "",
  "https://fonts.example/specimen",
  "A specimen worth keeping",
  "#type #serif",
].join("\n");

test("parse: groups from headings, ungrouped first", () => {
  const m = parseInspoBody(BODY);
  assert.equal(m.groups.length, 2);
  assert.equal(m.groups[0].name, "");
  assert.equal(m.groups[1].name, "Typography");
  assert.equal(m.groups[0].items.length, 1);
  assert.equal(m.groups[1].items.length, 2);
});

test("parse: an item carries image, caption, tags and source link", () => {
  const [it] = parseInspoBody(BODY).groups[0].items;
  assert.equal(it.image, "attachments/hero.png");
  assert.equal(it.caption, "Neon gradient hero");
  assert.deepEqual(it.tags, ["ui", "gradient"]);
  assert.equal(it.url, "https://dribbble.com/shots/1");
});

test("parse: a link-only item is a real item", () => {
  const items = parseInspoBody(BODY).groups[1].items;
  assert.equal(items[1].image, null);
  assert.equal(items[1].url, "https://fonts.example/specimen");
  assert.equal(items[1].caption, "A specimen worth keeping");
});

test("parse: an embed with a size hint keeps only the path", () => {
  const m = parseInspoBody("![[attachments/x.png|300]]");
  assert.equal(m.groups[0].items[0].image, "attachments/x.png");
});

test("parse: prose without an image or link is not an item", () => {
  const m = parseInspoBody("Just some thoughts about the board.\n\n![[a.png]]");
  assert.equal(m.groups[0].items.length, 1);
});

test("round trip: parse(serialize(m)) is the same model", () => {
  const m = parseInspoBody(BODY);
  const again = parseInspoBody(serializeInspoBody(m));
  assert.deepEqual(again, m);
});

test("serialize: canonical item order — image, caption, tags, url", () => {
  const s = serializeInspoBody({ groups: [{ name: "", items: [{
    image: "a.png", caption: "cap", tags: ["x"], url: "https://e.com" }] }] });
  assert.equal(s, "![[a.png]]\ncap\n#x\nhttps://e.com\n");
});

test("serialize: the unnamed group emits no heading", () => {
  const s = serializeInspoBody({ groups: [
    { name: "", items: [{ image: "a.png", caption: "", tags: [], url: null }] },
    { name: "G", items: [{ image: "b.png", caption: "", tags: [], url: null }] },
  ] });
  assert.equal(s, "![[a.png]]\n\n## G\n\n![[b.png]]\n");
});

test("inspoTags: the union, sorted, deduplicated", () => {
  assert.deepEqual(inspoTags(parseInspoBody(BODY)), ["gradient", "serif", "type", "ui"]);
});

test("empty body → one empty unnamed group, and serializes to nothing", () => {
  const m = parseInspoBody("");
  assert.equal(m.groups.length, 1);
  assert.equal(serializeInspoBody(m), "");
});

test("canvas items migrate: images and links carry over, text nodes do not", () => {
  const items = itemsFromCanvasLayout([
    { type: "image", asset: "attachments/a.png", caption: "from board" },
    { type: "link", url: "https://e.com/x", caption: "a link" },
    { type: "text", text: "a stray thought" },
  ]);
  assert.equal(items.length, 2);
  assert.equal(items[0].image, "attachments/a.png");
  assert.equal(items[1].url, "https://e.com/x");
});

test("an item carries a note, and it round-trips as an ordinary blockquote", () => {
  // The heading is its own block, so a blank line follows it — that is the
  // canonical shape the serializer has always written.
  const body = [
    "## Endpapers",
    "",
    "![[attachments/a.png]]",
    "Indigo and gilt",
    "> Works because the marbling is low-contrast.",
    "> Reach for it when a cover needs depth without a second colour.",
    "#marbled #indigo",
    "https://example.test/a",
  ].join("\n");
  const m = parseInspoBody(body);
  const it = m.groups[1].items[0];
  assert.equal(it.caption, "Indigo and gilt");
  assert.equal(it.note,
    "Works because the marbling is low-contrast.\n"
    + "Reach for it when a cover needs depth without a second colour.",
    "two thoughts stay two lines");
  assert.deepEqual(it.tags, ["marbled", "indigo"]);
  assert.equal(it.url, "https://example.test/a");
  // Byte-identical back out, so an Obsidian edit and an app edit agree.
  assert.equal(serializeInspoBody(m).trim(), body);
});

test("a note is not mistaken for a caption, a tag line or a source", () => {
  const m = parseInspoBody([
    "![[a.png]]",
    "> https://quoted.test/x is discussed here",
    "> #hashtags inside a quote are prose",
  ].join("\n"));
  const it = m.groups[0].items[0];
  assert.equal(it.url, null, "a link inside the note is not the item's source");
  assert.deepEqual(it.tags, [], "hashes inside the note are not the item's tags");
  assert.equal(it.caption, "");
  assert.match(it.note, /quoted\.test/);
});

test("a wikilink in a caption or note survives the round trip", () => {
  // This is how one wall cites another — the vault harvests the mention from
  // the body, so no "related" field has to exist in this model.
  const body = ["![[a.png]]", "See [[Quire Structures]]", "> Pairs with [[Bindery]]."].join("\n");
  const m = parseInspoBody(body);
  assert.equal(m.groups[0].items[0].caption, "See [[Quire Structures]]");
  assert.match(m.groups[0].items[0].note, /\[\[Bindery\]\]/);
  assert.equal(serializeInspoBody(m).trim(), body);
});

test("an item with no note serializes exactly as it did before", () => {
  const body = ["![[a.png]]", "Just a caption", "#one"].join("\n");
  assert.equal(serializeInspoBody(parseInspoBody(body)).trim(), body);
});
