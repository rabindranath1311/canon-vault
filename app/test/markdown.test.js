// Spike S9 / task 6.9. The app used to POST every markdown page to the server
// to be rendered. markdown-it is the JS original of the server's markdown-it-py,
// so with the same preset and options the output is not merely similar — it is
// byte-identical. This test pins that, using synthetic markdown so no real page
// content enters the repo.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const HERE = dirname(fileURLToPath(import.meta.url));
const py = JSON.parse(readFileSync(join(HERE, "fixtures", "markdown-python.json"), "utf8"));

// Load the UMD bundle exactly as the browser does: as a script setting a global.
const ctx = { window: {}, self: {} };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(join(HERE, "..", "vendor", "markdown-it.min.js"), "utf8"), ctx);
const markdownit = ctx.markdownit || ctx.window.markdownit;

test("the vendored bundle exposes markdownit as a global", () => {
  assert.equal(typeof markdownit, "function");
});

const md = markdownit("default", { html: false, linkify: false, typographer: true });

for (const [name, v] of Object.entries(py)) {
  test(`S9 byte-identical to markdown-it-py: ${name}`, () => {
    assert.equal(md.render(v.md), v.html);
  });
}

test("6.9 the cases the criterion names all render", () => {
  assert.match(md.render(py.table.md), /<table>/);
  assert.match(md.render(py.fence.md), /<pre><code class="language-python">/);
  assert.match(md.render(py.blockquote.md), /<blockquote>/);
  // html: false must keep raw HTML inert
  assert.doesNotMatch(md.render(py.html_inert.md), /<script>/);
});
