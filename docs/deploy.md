# Running and hosting the app

The app is a folder of static files. There is no build step, no bundler, no
`npm install`, and no server-side anything. Whatever you do below, **your notes
never leave your machine** — the app reads the folder you pick, in your browser,
using the File System Access API. The host only ever serves HTML, CSS and JS.

That is also why hosting it is safe to do publicly: there is nothing on the
server to leak.

## One requirement: a secure context

The File System Access API only exists in a **secure context** — `https://`, or
`http://localhost`. It does not exist in Safari or Firefox at all, so the app is
**Chromium only** (Chrome, Edge, Arc, Brave). Other browsers get an explainer
page rather than a broken one. See [support.md](support.md).

Opening `app/index.html` as a `file://` URL will **not** work. Serve it.

---

## Run it locally

Any static file server pointed at `app/` will do. Pick whichever you already
have:

```sh
python3 -m http.server 8091 --directory app
```

```sh
npx serve app -l 8091
```

```sh
php -S localhost:8091 -t app
```

Then open `http://localhost:8091` and pick your vault folder. `localhost` counts
as a secure context, so everything works — including installing it to your dock
as a PWA.

The app remembers the folder between sessions, and works with the network off.

---

## Deploy to Vercel

`vercel.json` is committed and already correct. Deploying is a file copy.

**From the CLI:**

```sh
npm i -g vercel
vercel          # preview
vercel --prod   # production
```

**From the dashboard:** import the GitHub repo. Accept the defaults — the config
in the repo sets framework to none, build command to none, and output directory
to `app/`. If Vercel's UI tries to guess a framework, override it to **Other**.

There is nothing to configure and no environment variables to set. If a deploy
asks you for either, something is wrong.

---

## Deploy anywhere else

The whole product is `app/`. Upload that directory to any static host.

| Host | How |
| --- | --- |
| **Netlify** | drag `app/` onto the dashboard, or set publish directory `app`, build command empty |
| **Cloudflare Pages** | build command empty, output directory `app` |
| **GitHub Pages** | push `app/` to a `gh-pages` branch, or set Pages source to `/app` (note: public repos only on the free plan) |
| **S3 + CloudFront** | `aws s3 sync app/ s3://<bucket>` |
| **Caddy / nginx** | point the root at `app/` |
| **Tailscale / LAN** | serve `app/` over HTTPS on your tailnet — a secure context, so it works |

### Four settings that matter

Vercel gets these from `vercel.json`. On another host, set them yourself or
accept the consequence in the right-hand column.

| Path | Setting | If you skip it |
| --- | --- | --- |
| `sw.js` | `Content-Type: application/javascript`, `Cache-Control: max-age=0` | a cached service worker can never replace itself — users are stuck on an old build permanently |
| `manifest.json` | `Content-Type: application/manifest+json` | Chrome will not offer to install the app |
| `vendor/*` | `Cache-Control: max-age=31536000, immutable` | fonts and the markdown renderer re-download on every visit |
| `/(.*)` | rewrite to `/index.html` | a cold load of a deep link like `/#page/<id>` 404s |

The `sw.js` one is the one that actually hurts. If you get a single header
right, make it that one.

---

## Keeping your instance updated

```sh
git pull
```

That is the update. There is nothing to rebuild and no dependencies to
reinstall, because there are none.

If you are hosting it and a change does not appear, it is almost always the
service worker. `app/index.html` carries `?v=NN` on its asset links and
`app/sw.js` carries a `CACHE_VERSION`; a release bumps both. As a user, a hard
reload (⇧⌘R) or Application → Service Workers → Unregister in DevTools clears
it.

---

## Should you self-host at all?

You do not have to. The app is a client; running it from someone else's URL
gives them no access to your files. Self-host if you want to pin a version, run
it on a LAN with no internet, or trust nothing on the path — not because
otherwise your notes are exposed. They are not.
