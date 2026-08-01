// Task 2.7: one fixture per row of SPEC §5's note-chrome table. The point of
// the table is that `note` covers what used to be three kinds, and the chrome
// follows the frontmatter — so each row must be reachable from metadata alone.

import { test } from "node:test";
import assert from "node:assert/strict";
import { noteChrome } from "../vault/data.js";

const FIXTURES = {
  // row 1: url present and og_image present
  "bookmark card": {
    kind: "note", title: "Anthropic",
    url: "https://example.com",
    og_image: "https://cdn.example.com/card.jpg",
    og_title: "Example", og_site_name: "example.com",
    body: "Why I saved this.",
  },
  // row 2: url present, no og
  "link with source line": {
    kind: "note", title: "A plain link",
    url: "https://example.com/article",
    body: "Some context I typed.",
  },
  // row 3: body is a single blockquote, no url
  "pull-quote": {
    kind: "note", title: "A quote worth keeping",
    body: "> Taste is a moat.\n> It compounds.",
  },
  // row 4: otherwise
  "article": {
    kind: "note", title: "Long-form thinking",
    body: "# A heading\n\nOrdinary prose, several paragraphs of it.",
  },
};

test("2.7 there are exactly 4 fixtures — one per row of §5's table", () => {
  assert.equal(Object.keys(FIXTURES).length, 4);
});

for (const [expected, page] of Object.entries(FIXTURES)) {
  test(`2.7 fixture resolves to "${expected}"`, () => {
    assert.equal(noteChrome(page), expected);
  });
}

test("2.7 the bookmark WITH og and the one WITHOUT resolve differently", () => {
  assert.equal(noteChrome(FIXTURES["bookmark card"]), "bookmark card");
  assert.equal(noteChrome(FIXTURES["link with source line"]), "link with source line");
  assert.notEqual(noteChrome(FIXTURES["bookmark card"]), noteChrome(FIXTURES["link with source line"]));
});

test("a url always beats a blockquote body — the rows are ordered", () => {
  assert.equal(noteChrome({ url: "https://x.test", body: "> quoted" }), "link with source line");
});

test("a body that is only PARTLY a blockquote is an article, not a pull-quote", () => {
  assert.equal(noteChrome({ body: "> quoted\n\nand then prose" }), "article");
});

test("an empty body is an article, not a pull-quote", () => {
  assert.equal(noteChrome({ body: "" }), "article");
  assert.equal(noteChrome({}), "article");
});

test("it reads frontmatter as well as flattened page objects", () => {
  assert.equal(noteChrome({ frontmatter: { url: "https://x.test", og_image: "i.png" } }), "bookmark card");
});
