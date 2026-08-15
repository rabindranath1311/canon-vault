# Design — paper instrument panel

> monochrome instrument panel — the accent *is* the foreground

**Theme:** light by default, dark available. `<html data-theme="light">` ships in
`app/index.html`; `[data-theme="dark"]` is a complete counterpart, not a
degraded one. Both are selectable from Settings and from the sidebar gear.

## The architecture, in one paragraph

Two ramps flip per theme and **nothing else does**:

```
--s-page / --s-raised / --s-sunken     three surfaces, by role
--i-1 … --i-7                          ink, ascending contrast on the page
```

Every semantic token (`--bg`, `--fg`, `--muted`, `--line`, `--accent`, …) is a
reference into those ramps. `[data-theme="dark"]` redeclares the ramps and the
handful of tokens whose *direction* genuinely differs; everything else resolves
through them for free. That is the invariant worth protecting: **if a re-skin
needs to touch more than the ramps, something has leaked.**

Surfaces are **roles, not a lightness ladder.** In dark, `--s-raised` is lighter
than the page. In light, `--s-raised` is white and the page is a soft grey it
lifts off. Same token, opposite direction — which is exactly what the
indirection buys: `--paper-2` is a sunken input well on light and a raised panel
on dark, and not one call site changes.

## Provenance

Started as a Linear/acid-lime system, re-skinned to shadcn/zinc dark on
2026-07-30 as a token-level swap, and flipped light-first on 2026-08-15. Each
step was a token change rather than a rewrite, which is why ~460 shared
selectors have survived three visual systems.

The historic `--color-*` names (`onyx`, `charcoal`, `snow`, …) are kept as
**compatibility aliases onto the ramps** so the ~16 call sites that still say
`var(--color-iron)` re-skin instead of painting a dark hex onto a white page.
They now mean their *role*, not their colour — "onyx" is the page and "snow" is
the ink, in both themes. **Do not reach for them in new code.**

## The one rule that defines this system

**The accent is monochrome.** `--accent` and `--cta` both resolve to `--i-7`,
the maximum-contrast ink. There is no chromatic accent at all: emphasis comes
from *contrast and inversion*, and colour is reserved for meaning.

The flip preserves it exactly. Where dark put near-white on near-black, light
puts near-black on near-white. The primary button is still an inversion.

The only chromatic values are semantic: `--signal-pos`, `--signal-warn`,
`--signal-alert`, and the per-kind dot colours.

## Tokens — ink

| Step | Light | Dark | Role |
|------|-------|------|------|
| `--i-1` | `#e9e7e4` | `#27272a` | hairline rules — **structure only** |
| `--i-2` | `#d4d0cb` | `#3f3f46` | medium borders — **structure only** |
| `--i-3` | `#736d65` | `#8b8b94` | faint text, placeholders, inactive |
| `--i-4` | `#635d57` | `#a1a1aa` | secondary text |
| `--i-5` | `#4a4540` | `#d4d4d8` | tertiary text |
| `--i-6` | `#322e2b` | `#e4e4e7` | strong separators, emphatic text |
| `--i-7` | `#1c1917` | `#fafafa` | primary text, and the accent |

`i-1` and `i-2` are structure and **may never carry text**. `i-3` and up are
text, and every one clears WCAG AA on both the page and the sunken surface.
Measured on light (`#faf9f8` / `#f2f1ef`):

```
i-3  4.87 / 4.53      i-5  9.01 / 8.39      i-7  16.63 / 15.49
i-4  6.18 / 5.75      i-6  12.79 / 11.92
```

The lightest text step is much darker in light than the dark theme's
equivalent, deliberately: light-on-dark blooms and reads heavier than it
measures, so dark gets away with a grey that on white just looks broken. This
app puts real content — timestamps, IDs, counts, section labels — in the
faintest step, so it has to be legible.

> Dark's `i-3` was zinc-500 (`#71717a`), which measures **3.94:1** on zinc-950 —
> under AA. It is the one value in the historic zinc mapping that changed, and
> it changed because it was failing.

## Tokens — surfaces

| Token | Light | Dark | Role |
|-------|-------|------|------|
| `--s-page` | `#faf9f8` | `#09090b` | the page itself |
| `--s-raised` | `#ffffff` | `#101012` | nav, cards, tab bar |
| `--s-sunken` | `#f2f1ef` | `#18181b` | input wells, table heads, code |

Light is **warm neutral, not zinc**. A notes app rendered in cold grey on white
reads like a spreadsheet; a few degrees of warmth reads like paper. The ink ramp
is warmed to match so nothing looks blue-shifted.

## Tokens — shape & elevation

| Element | Radius |
|---------|--------|
| card | `10px` · btn/input `7px` · badge `5px` · pill `9999px` |

Dark could get away with almost no elevation because a hairline separates well
on black. **On white it does not**, so light has a real three-step ramp, tinted
with the ink hue rather than pure black (pure-black shadows on warm neutrals go
grey and muddy):

- `--shadow-card` — lists, cards, chips that sit on the page
- `--shadow-raised` — hover lift, banners, toasts
- `--shadow-overlay` — modals, the command palette, popovers
- `--shadow-input` — light only: `inset 0 0 0 1px var(--i-1)`, because a field
  with a transparent border is invisible on a white card. Dark sets it `none`.

## Tokens — type

Inter for the interface **and for prose**, JetBrains Mono for machine text.
Both self-hosted in `app/vendor/` — the deployed CSP blocks an external request.
Inter is vendored as a variable face at **300–600**, so there is no 700 and
emphasis tops out at 600.

Tracking is bound to role, because one value across a 10→30px range looks loose
when large and cramped when small:

```
--track-display -0.022em   --track-body   0        --track-caps 0.09em
--track-title   -0.014em   --track-label  0.02em
```

Density (cozy is the default): `--fz-body` 14 · `--fz-mini` 12 · `--fz-micro`
10.5 · `--fz-h1` 26 · `--fz-prose` 15.5 · `--row-h` 28. Every step moved up a
point or two from the dark scale — dark type on white has less apparent weight
than light type on black, so the same pixel size reads thinner.

`--measure: 68ch` caps prose so lines never run past the eye's return sweep.

### Mono is a signal, not a texture

**The rendered note body is proportional.** It used to be mono at 12px with 11px
uppercase headings, which is a terminal readout, not a document — and a note is
the longest-lived text in the app and the thing the product exists to hold.

Mono did not disappear, it moved to where it *means* something: the frontmatter
block, code, IDs, slugs, paths, key hints, and **the markdown editor** (where
`##` and `-` and `[[…]]` are structure you need to see as characters, and a
proportional face makes indentation lie). Seeing mono now tells you you are
looking at machine text. That contrast is load-bearing — do not spend it.

## Tokens — motion

Four durations and three curves, referenced by name:

```
--dur-1  90ms   state flips: hover, active, colour
--dur-2 160ms   small transforms: chips, rows, icons
--dur-3 240ms   cards and panels entering
--dur-4 380ms   overlays, screen transitions

--ease-out    cubic-bezier(0.16, 1, 0.30, 1)     strong decelerate — settles
--ease-in-out cubic-bezier(0.65, 0, 0.35, 1)
--ease-spring cubic-bezier(0.34, 1.4, 0.64, 1)   slight overshoot
```

Three rules:

1. **State flips are near-instant.** Hover must feel like the cursor caused it,
   not like the app is thinking about it.
2. **Anything that moves decelerates.** `--ease-out`, never `linear`.
3. **Nothing animates on load that the user did not ask for**, except one quiet
   entrance per screen. Motion is feedback, not decoration.

List entrances stagger at 22ms, **capped at 8 steps** — past that a stagger
stops reading as sequence and starts reading as lag. The press state
(`translateY(1px)`, 40ms) matters more than the hover: a control that does not
acknowledge the mousedown feels broken even when it works.

`prefers-reduced-motion` turns motion **off**, not down. Anyone who sets it is
saying motion makes the interface harder to use, so every transform and
animation goes and only opacity survives.

## Kind colours

Semantic, not decorative — each kind keeps its dot colour so the four kinds stay
distinguishable at a glance. These were authored for a light ground originally
and needed no shifting.

| Kind | Token | Light | Dark |
|------|-------|-------|------|
| canvas | `--k-canvas` | `#2563eb` | `#60a5fa` |
| topic | `--k-topic` | `#B45309` | `#f59e0b` |
| note | `--k-mdwn` | `#1f6f6b` | `#5eead4` |
| inspo | `--k-desg` | `#be185d` | `#f472b6` |
| project | `--k-proj` | `#047857` | `#34d399` |

`--k-book`, `--k-snip`, `--k-locl`, `--k-self` and `--k-screen` survive for
pages carrying legacy frontmatter; no live kind references them.

## Do

- Use `--accent` / `--cta` for emphasis, and let **inversion** carry a primary
  action.
- Reach for a semantic token first, a ramp step second, and a raw hex never.
- Keep the surface stack tight: page → raised → sunken. Three levels is the
  whole range.
- Use `--font-mono` for machine text only.
- Check a new text colour against **both** surfaces before shipping it.
- Bump `?v=` in `app/index.html` **and** `CACHE_VERSION` in `app/sw.js` when
  shipping CSS or JS. `boot.js` and `bridge.js` inherit the query; the service
  worker matches assets exactly, so the bump is what actually reaches a
  returning user. Miss it and you will debug a stylesheet that is not running.

## Don't

- **Don't reintroduce a chromatic accent.** Monochrome emphasis is the system.
- **Don't put text in `--i-1` or `--i-2`.** They are structure.
- Don't hardcode a hex where a token exists — the point of the naming is that
  the next re-skin is one block.
- Don't use `--color-acid-lime`, `--color-indigo`, or any `--color-*` alias in
  new code.
- Don't add a dashed border as texture. Dashes now mean exactly one thing: an
  empty placeholder.
- Don't fill cards. Cards are `--paper` with a `--line` edge and the lightest
  shadow in the ramp.

## Icons

**Lucide** — vendored as a `LUCIDE` path map in `app/app.js` and rendered by
`icon(name)` into an inline `<svg>`. Inline because the no-build rule holds and
because the deployed CSP blocks an external request. Icons inherit
`currentColor` and size from `font-size` (`.lucide` is `1em`), so an icon tracks
the text beside it. `kindIcon(kind)` resolves through `KIND_META[kind].icon`.

There are **no unicode glyphs** in the UI.

## Keyboard

No single-letter or digit navigation — it hijacked typing and cluttered the nav.
What remains is `⌘K` (focus search), `⌘T` (new tab), `⌘W` (close tab) and
`Escape` (close overlays). A nav row is `[icon, label, count]` — three tracks,
no fourth.

## Where this lives

`app/styles.css`, in four blocks, in cascade order:

1. **Tokens** (top) — the two ramps, the semantic mapping, density, and the
   `[data-theme="dark"]` flip. Everything above lives here.
2. **The base file** — ~460 component selectors, all token references.
3. **Polish layer** — geometry, the inverted CTA, inputs, focus rings.
4. **Typography · Motion · Light component pass** (bottom) — the relationships
   rather than the sizes, and the specific corrections light needs that dark
   did not (hairlines become cards, dashes become solid, decorative ink steps
   back).
