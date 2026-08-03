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
