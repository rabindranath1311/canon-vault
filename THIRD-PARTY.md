# Third-party code

Canon Vault itself is MIT — see [LICENSE.txt](LICENSE.txt).

The project has **no dependencies to install**: everything it uses is committed
as files under [`app/vendor/`](app/vendor). That is a deliberate constraint (see
[CONTRIBUTING.md](CONTRIBUTING.md)), and it means this repo *redistributes* the
code below. Each item keeps its own license, listed here.

| Component | Version | License | Text |
| --- | --- | --- | --- |
| [Excalidraw](https://github.com/excalidraw/excalidraw) | 0.18.1 | MIT © 2020 Excalidraw | [app/vendor/excalidraw/LICENSE](app/vendor/excalidraw/LICENSE) |
| [React](https://github.com/facebook/react) / React DOM | 19.0.0 | MIT © Meta Platforms, Inc. and affiliates | [app/vendor/excalidraw/LICENSE.react](app/vendor/excalidraw/LICENSE.react) |
| [markdown-it](https://github.com/markdown-it/markdown-it) | see file header | MIT | header inside [app/vendor/markdown-it.min.js](app/vendor/markdown-it.min.js) |
| [lz-string](https://github.com/pieroxy/lz-string) | see file header | MIT | header inside [app/vendor/lz-string.js](app/vendor/lz-string.js) |
| [Inter](https://github.com/rsms/inter) | — | SIL Open Font License 1.1 | [app/vendor/fonts/OFL-Inter.txt](app/vendor/fonts/OFL-Inter.txt) |
| [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) | — | SIL Open Font License 1.1 | [app/vendor/fonts/OFL-JetBrainsMono.txt](app/vendor/fonts/OFL-JetBrainsMono.txt) |

## React is inside `excalidraw.js`

React and React DOM are not separate files here. Excalidraw is ESM-only and
imports 28 bare specifiers, so `scripts/vendor-excalidraw.mjs` bundles it with
its React dependency into a single `app/vendor/excalidraw/excalidraw.js`. The
React copyright therefore travels inside that bundle, which is why its license
sits beside it as `LICENSE.react`.

## The bundled fonts

`app/vendor/excalidraw/fonts/` carries the seven font families Excalidraw ships
and the app actually loads — Excalifont, Nunito, ComicShanns, Virgil, Cascadia,
Liberation and Assistant. (Xiaolai, ~12 MB of CJK handwriting, is deliberately
skipped; it is recorded in `app/vendor/excalidraw/VERSION`.)

These are copied verbatim out of the `@excalidraw/excalidraw` distribution.
Upstream ships them under the single repository-level MIT license above and
carries no separate per-font license files at the `v0.18.1` tag, so that is the
term they are redistributed under here. Several of these families also have
their own upstream sources with their own terms; if you are redistributing them
in a different context, check with the font's own project rather than relying on
this table.

## Updating

`scripts/vendor-excalidraw.mjs` writes the two license files above every time it
runs, so re-vendoring cannot silently drop the attribution. If you vendor
anything new, add a row here — `app/test/vendor-license.test.js` fails when a
listed license file is missing.
