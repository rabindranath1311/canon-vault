/* A threaded static server for local development.
 *
 * `python3 -m http.server` is single-threaded: it serves one request at a
 * time. The app opens with a burst of parallel module fetches, and the
 * service-worker registration fetch lands in the middle of that burst — the
 * browser gets a dropped connection and reports the useless
 * "An unknown error occurred when fetching the script", so the SW silently
 * never registers and offline never works locally.
 *
 * Node's http module handles concurrency, so the SW registers every time.
 * No dependencies — same rule as the rest of the repo.
 *
 *   node scripts/serve.mjs [port] [dir]
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize, resolve } from "node:path";

const port = Number(process.argv[2] || 8091);
const root = resolve(process.argv[3] || "app");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".mjs":  "text/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".md":   "text/markdown; charset=utf-8",
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    // Strip the query — `?v=NN` is a cache-bust, not part of the path.
    let p = decodeURIComponent(url.pathname);
    if (p.endsWith("/")) p += "index.html";
    // Contain traversal: resolve, then require the result to stay under root.
    const file = normalize(join(root, p));
    if (!file.startsWith(root)) { res.writeHead(403).end("forbidden"); return; }

    const s = await stat(file).catch(() => null);
    if (!s || !s.isFile()) { res.writeHead(404).end("not found"); return; }

    const body = await readFile(file);
    const type = TYPES[extname(file).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, {
      "content-type": type,
      /* `no-cache` everywhere, not `no-store`.
         They sound similar and are not: no-cache means "revalidate before
         reusing", no-store means "never keep a copy at all" — and a no-store
         response is one the Cache API declines to store, so the service
         worker precache silently stayed empty and offline never worked
         locally. no-cache keeps development fresh and still lets the SW do
         its job. sw.js gets the same treatment vercel.json gives it. */
      "cache-control": "no-cache",
    });
    res.end(body);
  } catch (e) {
    res.writeHead(500).end(String(e && e.message));
  }
}).listen(port, () => {
  console.log(`serving ${root} on http://localhost:${port}`);
});
