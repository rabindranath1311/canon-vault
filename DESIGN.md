# Design — shadcn / zinc

> monochrome instrument panel — the accent *is* the foreground

**Theme:** dark only (`color-scheme: dark`). There is no light theme and no
`[data-theme="light"]` block in `app/styles.css`.

## Provenance

This replaced a Linear/acid-lime system on 2026-07-30. The skin was ported from
the branch `claude/remove-work-mode-second-brain-ad1efd`, which was written as a
**token-level** re-skin: it kept the historic Linear variable names and changed
only their values, so every call site re-skins in place.

That is why the port was a palette swap rather than a rewrite — 464 selectors
are shared, and the ~165 selectors added by the local-first migration inherit
the new values for free. **Only the first `:root` block changed.**

Nothing else came across from that branch. It targets the old model — 15
`fetch()` calls, 40 tldraw references, and kinds (`markdown`, `bookmark`,
`snippet`, `contact`, `mention-tag`) that no longer exist.

## The one rule that defines this system

**The accent is monochrome.** `--accent` and `--cta` both resolve to
`var(--color-snow)` — near-white on near-black. Where the Linear system rationed a
single chromatic lime to one action per screen, this one has no chromatic accent
at all: emphasis comes from *contrast and inversion*, and colour is reserved for
meaning.

The only chromatic values left are semantic: `--signal-pos`, `--signal-warn`,
`--signal-alert`, and the per-kind dot colours below.

## Tokens — palette

| Name | Value | Token | Tailwind | Role |
|------|-------|-------|----------|------|
| Onyx | `#09090b` | `--color-onyx` | zinc-950 | page background |
| Charcoal | `#101012` | `--color-charcoal` | ~zinc-925 | nav, sidebar, card base |
| Obsidian | `#18181b` | `--color-obsidian` | zinc-900 | raised surface, inputs |
| Graphite | `#27272a` | `--color-graphite` | zinc-800 | hairline borders |
| Iron | `#3f3f46` | `--color-iron` | zinc-700 | medium borders |
| Steel | `#27272a` | `--color-steel` | zinc-800 | soft borders |
| Slate | `#71717a` | `--color-slate` | zinc-500 | placeholder, inactive |
| Fog | `#a1a1aa` | `--color-fog` | zinc-400 | secondary text |
| Mist | `#d4d4d8` | `--color-mist` | zinc-300 | tertiary text |
| Platinum | `#e4e4e7` | `--color-platinum` | zinc-200 | strong separators |
| Snow | `#fafafa` | `--color-snow` | zinc-50 | primary text, accent, CTA fill |

`--color-acid-lime` and `--color-indigo` still exist and both resolve to
`#fafafa`. They are kept **only** so old call sites re-skin
rather than break. Do not reach for them in new code — use `--accent`.

## Tokens — semantic

| Token | Value |
|-------|-------|
| `--bg` | `var(--color-onyx)` |
| `--paper` | `var(--color-charcoal)` |
| `--paper-2` | `var(--color-obsidian)` |
| `--fg` | `var(--color-snow)` |
| `--muted` | `var(--color-fog)` |
| `--faint` | `var(--color-slate)` |
| `--line` | `var(--color-graphite)` |
| `--accent` | `var(--color-snow)` |
| `--cta` | `var(--color-snow)` |
| `--cta-fg` | `#18181b` |
| `--input-bg` | `var(--color-obsidian)` |
| `--hover` | `rgba(255,255,255,0.04)` |
| `--selected` | `rgba(255,255,255,0.08)` |

## Tokens — shape

| Element | Radius |
|---------|--------|
| card | `10px` |
| btn | `6px` |
| input | `6px` |
| badge | `5px` |
| pill | `9999px` |

Elevation is deliberately almost absent — **borders do the separating**:

- card `0 1px 2px 0 rgba(0,0,0,0.25)`
- card inset `inset 0 0 0 1px var(--color-graphite)`
- overlay `0 8px 30px 0 rgba(0,0,0,0.5)`

## Tokens — type & density

- sans `'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSy…`
- mono `'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, Mon…`
- body `13px` · mini `11px` · h1 `22px` · h2 `15px`
- row height `26px` · pad `12px` / `16px`

Mono is for IDs, code and keyboard hints only. Fonts are **self-hosted** in
`app/vendor/` — no external request is made, and the CSP on the deployed app
would block one.

## Kind colours

These were **not** re-skinned. They are semantic, not decorative: each kind
keeps its dot colour so the four kinds stay distinguishable at a glance.

| Kind | Token | Value |
|------|-------|-------|
| canvas | `--k-canvas` | `#2563eb` |
| topic | `--k-topic` | `#B45309` |
| note (markdown lineage) | `--k-mdwn` | `#5eead4` (dark) |
| inspo | `--k-desg` | `#be185d` |
| project | `--k-proj` | `#047857` |

`--k-book`, `--k-snip`, `--k-locl`, `--k-self` and `--k-screen` survive for
pages carrying legacy frontmatter; no live kind references them. `--k-mtag` and `--k-cont` were
dropped with mention-tags and contacts.

## Do

- Use `--accent` / `--cta` for emphasis, and let **inversion** carry a primary
  action — light on dark.
- Let a 1px `--line` border define an edge before reaching for a shadow.
- Keep the surface stack tight: `--bg` → `--paper` → `--paper-2`. Three levels
  is the whole range.
- Use `--font-mono` for IDs and code, never for prose.
- Bump `?v=` in `app/index.html` when shipping CSS. `boot.js` and `bridge.js`
  inherit it; the service worker matches assets exactly, so the bump is what
  actually reaches a returning user.

## Don't

- **Don't reintroduce a chromatic accent.** Monochrome emphasis is the system.
- Don't hardcode a hex where a token exists — the whole point of the naming is
  that the next re-skin is one block.
- Don't add a light theme without also adding it to `app/manifest.json`
  (`theme_color`) and the `<meta name="theme-color">` in `index.html`; today all
  three say `var(--color-onyx)`.
- Don't use `--color-acid-lime` or `--color-indigo` in new code.
- Don't fill cards. Cards are `--paper` with a `--line` edge.

## Icons

**Lucide** — shadcn's icon set — vendored as a `LUCIDE` path map in `app/app.js`
and rendered by `icon(name)` into an inline `<svg>`. Inline because the no-build
rule holds and because the CSP on the deployed app blocks an external request.

Icons inherit `currentColor` and size from `font-size` (`.lucide` is `1em`), so
an icon tracks the text beside it. `kindIcon(kind)` resolves through
`KIND_META[kind].icon`.

There are **no unicode glyphs** in the UI. `§ ¶ ▦ ◫ ⚐ ↗ ∙ ⌕` were the previous
system; a `.glyph` field survives in `KIND_META` only for the dead work-mode
renderers, which are queued for deletion.

## No single-letter shortcuts

The sidebar shows **no key hints**, and single-letter and digit navigation is
gone. Quoting the branch this was ported from: they *"hijacked typing and
cluttered the nav."*

What remains is `⌘K` (focus search), `⌘T` (new tab), `⌘W` (close tab) and
`Escape` (close overlays). A nav row is `[icon, label, count]` — three tracks,
no fourth.

## Where this lives

`app/styles.css` — one `:root` block at the top holds every value above. The
rest of the file references tokens. That is the invariant worth protecting: if
a future re-skin needs to touch more than that block, something has leaked.
