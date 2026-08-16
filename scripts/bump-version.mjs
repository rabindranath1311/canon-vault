/* Bump the two cache-bust markers, together, without knowing their values.
 *
 * There are two, they must move together, and neither can be found by reading
 * the file you just edited:
 *
 *   * `?v=NN` in index.html versions the ASSETS. boot.js reads its own and
 *     passes it to bridge.js, which passes it to app.js and demo-vault.js.
 *   * CACHE_VERSION in sw.js versions the CACHE ITSELF, and `activate` deletes
 *     every cache that is not the current one.
 *
 * They were bumped by hand — `sed 's/?v=214/?v=215/'` — which works exactly as
 * long as you remember the current number. Get it wrong once and the sed
 * silently matches nothing; get it wrong once more and every later sed in the
 * chain misses too, because they are all keyed to a value that never arrived.
 * That happened for six commits in a row, and the failure is invisible: the
 * dev server sends no-cache, so everything looks right locally, and only a
 * returning user on a real deploy gets last version's CSS under this
 * version's markup.
 *
 * So: read, increment, write. No caller ever names a version.
 *
 *   node scripts/bump-version.mjs           # bump both
 *   node scripts/bump-version.mjs --check   # print, change nothing
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = join(root, "app/index.html");
const SW = join(root, "app/sw.js");

const ASSET_RE = /\?v=(\d+)/g;
const CACHE_RE = /CACHE_VERSION = "v(\d+)"/;

const index = readFileSync(INDEX, "utf8");
const sw = readFileSync(SW, "utf8");

const assetHits = [...index.matchAll(ASSET_RE)].map((m) => Number(m[1]));
const cacheHit = sw.match(CACHE_RE);
if (!assetHits.length) throw new Error("no ?v= marker in app/index.html");
if (!cacheHit) throw new Error('no CACHE_VERSION = "vNN" in app/sw.js');

// Every ?v= in the document must be the same number — one asset served from
// the previous version is the whole bug in miniature.
const spread = [...new Set(assetHits)];
if (spread.length > 1) {
  console.error(`✗ app/index.html has mixed asset versions: ${spread.join(", ")}`);
  if (!process.argv.includes("--check")) console.error("  bumping unifies them.");
  else process.exit(1);
}

const asset = Math.max(...assetHits);
const cache = Number(cacheHit[1]);

if (process.argv.includes("--check")) {
  console.log(`assets ?v=${asset}   cache v${cache}`);
  process.exit(0);
}

const nextAsset = asset + 1;
const nextCache = cache + 1;
writeFileSync(INDEX, index.replace(ASSET_RE, `?v=${nextAsset}`));
writeFileSync(SW, sw.replace(CACHE_RE, `CACHE_VERSION = "v${nextCache}"`));
console.log(`✓ assets ?v=${asset} → ?v=${nextAsset}   cache v${cache} → v${nextCache}`);
