/* Canon Vault — terminal/brutalist research-lab UI, wired to the real vault.

   Screens and rendering only. There is no backend: every value on screen comes
   from app/vault/, which reads the folder the user picked through the File
   System Access API. `fetch()` to an origin appears zero times in this file and
   must stay that way — see CONTRIBUTING.md.

   No mock content — a sparse vault renders honest empty states.
   Zero deps, no build step. */

'use strict';

/* ── hyperscript ──────────────────────────────────────────────────────── */
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const key in props) {
      const val = props[key];
      if (val == null || val === false) continue;
      if (key === 'className') el.className = val;
      else if (key === 'style' && typeof val === 'object') {
        // Object.assign can't set CSS custom properties (--x) — they need
        // setProperty. Split so inline `--k-c` / `--ft` style vars actually apply.
        for (const sk in val) {
          if (sk.startsWith('--')) el.style.setProperty(sk, val[sk]);
          else el.style[sk] = val[sk];
        }
      }
      else if (key === 'html') el.innerHTML = val;
      else if (key === 'value') el.value = val;
      else if (key === 'checked') el.checked = !!val;
      else if (key === 'onClick') {
        el.addEventListener('click', val);
        // A <div onclick> is unreachable without a mouse. Rows, cards, tiles
        // and chips are all built that way here, so the fix belongs in the
        // factory rather than at 14 call sites that would drift apart.
        // Native controls already do this; only the improvised ones need it.
        if (!/^(button|a|input|select|textarea|label)$/i.test(tag)
            && props.role == null && props.tabIndex == null) {
          if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
          if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
          el.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            // Space scrolls the page by default, which is never what a
            // focused row is asking for.
            e.preventDefault();
            el.click();
          });
        }
      }
      else if (key === 'onInput' || key === 'onChange') el.addEventListener('input', val);
      else if (key === 'onKeyDown') el.addEventListener('keydown', val);
      else if (key === 'onMouseDown') el.addEventListener('mousedown', val);
      else if (key === 'onMouseEnter') el.addEventListener('mouseenter', val);
      else if (key === 'onMouseLeave') el.addEventListener('mouseleave', val);
      else if (key === 'onDragOver') el.addEventListener('dragover', val);
      else if (key === 'onDragLeave') el.addEventListener('dragleave', val);
      else if (key === 'onDrop') el.addEventListener('drop', val);
      else el.setAttribute(key, val);
    }
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids) {
    if (k == null || k === false || k === true) continue;
    if (Array.isArray(k)) append(el, k);
    else if (k instanceof Node) el.appendChild(k);
    else el.appendChild(document.createTextNode(String(k)));
  }
}
function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

/* ── API ──────────────────────────────────────────────────────────────── */
// There is no backend. Every call below is computed locally from the vault by
// app/vault/data.js, which bridge.js exposes as window.SB_DATA before app.js
// loads. Task 6.1.
const SB = {
  data() {
    if (!window.SB_DATA) throw new Error('vault not connected');
    return window.SB_DATA;
  },
};
/* ── shared atoms ─────────────────────────────────────────────────────── */
/* ── Confirm modal ──────────────────────────────────────────────
   Promise-based replacement for browser confirm(). Lives in-app, can
   be themed, supports Enter/Escape, and looks like the rest of the UI.
   Returns true if confirmed, false if cancelled.

   Usage:
     if (!await confirmDialog({title:'Delete?', confirmLabel:'Delete', danger:true})) return;
*/
function confirmDialog(opts = {}) {
  const { title = 'Are you sure?', body = '', confirmLabel = 'Confirm',
          cancelLabel = 'Cancel', danger = false } = opts;
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return; done = true;
      document.removeEventListener('keydown', onKey, true);
      bg.remove();
      resolve(!!ok);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); finish(false); }
      else if (e.key === 'Enter') { e.stopPropagation(); finish(true); }
    };
    const bg = h('div', { className: 'modal-bg confirm-bg',
      onClick: (e) => { if (e.target === bg) finish(false); } });
    bg.appendChild(h('div', { className: 'modal confirm-modal' + (danger ? ' confirm-danger' : '') },
      h('div', { className: 'modal-hd' },
        h('b', null, title),
        h('button', { className: 'sb-twk-x', onClick: () => finish(false) }, '✕')),
      h('div', { className: 'modal-body' },
        body ? h('div', { className: 'confirm-body' }, body) : null,
        h('div', { className: 'confirm-actions' },
          h('button', { className: 'side-action', onClick: () => finish(false) }, cancelLabel),
          h('button', {
            className: 'btn-primary' + (danger ? ' btn-danger' : ''),
            onClick: () => finish(true),
          }, confirmLabel)))));
    document.body.appendChild(bg);
    document.addEventListener('keydown', onKey, true);
    asDialog(bg);
    // Then override where focus lands: on a confirm, the answer is the button,
    // so Enter works the moment the dialog appears.
    const confirmBtn = bg.querySelector('.btn-primary');
    if (confirmBtn) confirmBtn.focus();
  });
}

/* 10.8: at zero pages the dashboard used to render three dashed "nothing here"
   boxes stacked on top of each other, which reads as broken rather than new.
   A fresh vault gets one clear next action instead. */
function FirstRunPanel(onCreate) {
  return h('div', { className: 'first-run' },
    h('h2', { className: 'first-run-h' }, 'Your vault is empty — and that is the right start.'),
    h('p', { className: 'first-run-p' },
      'Everything here is a plain markdown file in the folder you picked. ',
      'Obsidian can open the same files, and so can your agent. Nothing is uploaded.'),
    h('button', { className: 'btn-primary first-run-cta', onClick: onCreate }, '+ write your first page'),
    h('div', { className: 'first-run-alt' },
      h('b', null, 'Already have notes? '),
      'Drop markdown files into the folder — the app indexes them as they are and ',
      'never rewrites a file it did not create.'),
    h('ul', { className: 'first-run-list' },
      h('li', null, h('b', null, 'notes/'), ' anything read as prose'),
      h('li', null, h('b', null, 'topics/'), ' a hub you keep coming back to'),
      h('li', null, h('b', null, 'canvas/'), ' a board, arranged in Obsidian'),
      h('li', null, h('b', null, 'inspo/'), ' visual reference')));
}

/* An empty state is the first thing a new vault shows on most screens, so it
   is the app's first impression more often than the dashboard is. This one
   used to be grey text in a dashed box — technically informative, and it read
   like a validation error. The monogram behind it turns the same information
   into a considered blank page, and `action` gives the state a way out
   instead of describing one. */
/* ── toast ──────────────────────────────────────────────────────────────
   One transient message with an optional single action. Exists because
   `.trash/` and `.history/` have always been there and the interface never
   mentioned either: the app was safer than it looked, which is the wrong
   direction for a tool holding the only copy of your notes. */
let _toastTimer = null;
function toast(message, opts = {}) {
  const { actionLabel, onAction, tone, ms = actionLabel ? 8000 : 3200 } = opts;
  document.querySelectorAll('.cv-toast').forEach((n) => n.remove());
  clearTimeout(_toastTimer);

  const el = h('div', { className: 'cv-toast' + (tone ? ' cv-toast-' + tone : ''), role: 'status' },
    h('span', { className: 'cv-toast-msg' }, message));
  if (actionLabel && onAction) {
    el.appendChild(h('button', {
      className: 'cv-toast-action',
      onClick: async () => { el.remove(); clearTimeout(_toastTimer); await onAction(); },
    }, actionLabel));
  }
  el.appendChild(h('button', {
    className: 'cv-toast-x', title: 'Dismiss', 'aria-label': 'Dismiss',
    onClick: () => { el.remove(); clearTimeout(_toastTimer); },
  }, '\u2715'));
  document.body.appendChild(el);
  // An undo offer gets longer than a bare confirmation — you need time to
  // realise you did not mean it.
  _toastTimer = setTimeout(() => el.remove(), ms);
  return el;
}

/* Pick a snapshot. Deliberately plain — a list of times, newest first, and
   nothing else, because a snapshot carries no other metadata. */
/* Make an overlay behave like a dialog.
 *
 * There are four modals in the app and each was hand-built: a `.modal-bg` with
 * a `.modal` inside it, appended to the body. None of them was a dialog in any
 * sense a keyboard or a screen reader could tell. Opening Create with ⌘N left
 * focus on `<body>`, so reaching the first card meant tabbing in from the top
 * of the document — through the whole sidebar, behind an overlay you cannot
 * see past — and Tab walked straight back out the other side into the page the
 * modal was covering. Nothing announced a dialog had opened, and closing one
 * dropped focus at the top of the page rather than back on the control you
 * used to open it.
 *
 * One helper, called at each of the four sites. It is safe to call again on
 * the same open overlay — `render()` rebuilds the create modal's element on
 * every keystroke in the project-name field, and stealing focus back each time
 * would be worse than never taking it.
 */
const FOCUSABLE_SEL =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),' +
  'textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function asDialog(bg, { onEscape, label, restore } = {}) {
  const dialog = bg.querySelector('.modal') || bg;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  if (!dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1');
  // Name it from its own heading when it has one, so the name cannot drift.
  const hd = dialog.querySelector('.modal-hd b');
  if (hd && !dialog.id) {
    hd.id = hd.id || ('modal-hd-' + (asDialog._n = (asDialog._n || 0) + 1));
    dialog.setAttribute('aria-labelledby', hd.id);
  } else if (label) {
    dialog.setAttribute('aria-label', label);
  }

  const focusables = (root) =>
    [...(root || dialog).querySelectorAll(FOCUSABLE_SEL)].filter((e) => e.offsetParent !== null);

  // Remember the opener once per opening, not once per re-render.
  if (!asDialog._restore) asDialog._restore = restore || document.activeElement;
  if (!bg.contains(document.activeElement)) {
    /* The body first, then anywhere. In DOM order the first focusable is the
       ✕ in the header, and landing a keyboard user on Close is answering a
       question they did not ask — they opened this to do the thing inside. */
    const body = dialog.querySelector('.modal-body');
    ((body && focusables(body)[0]) || focusables()[0] || dialog).focus();
  }

  const onKey = (e) => {
    if (!document.body.contains(bg)) return;         // observer will clean up
    if (e.key === 'Escape' && onEscape) {
      e.preventDefault(); e.stopPropagation(); onEscape(); return;
    }
    if (e.key !== 'Tab') return;
    const f = focusables();
    if (!f.length) { e.preventDefault(); dialog.focus(); return; }
    const first = f[0], last = f[f.length - 1];
    const inside = dialog.contains(document.activeElement);
    if (e.shiftKey && (document.activeElement === first || !inside)) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
      e.preventDefault(); first.focus();
    }
  };
  document.addEventListener('keydown', onKey, true);

  // Give focus back to whatever opened this, once the overlay is really gone.
  const obs = new MutationObserver(() => {
    if (document.body.contains(bg)) return;
    obs.disconnect();
    document.removeEventListener('keydown', onKey, true);
    /* A function, not an element, when the opener will not survive: render()
       rebuilds the whole tree, so the button that opened the create modal is
       a different object by the time it closes and focusing the old one is a
       no-op on a detached node. */
    const back = typeof asDialog._restore === 'function' ? asDialog._restore() : asDialog._restore;
    asDialog._restore = null;
    if (back && document.body.contains(back)) { try { back.focus(); } catch (_) {} }
  });
  obs.observe(document.body, { childList: true, subtree: true });
  return dialog;
}

function historyDialog(snaps, title) {
  return new Promise((resolve) => {
    const close = (v) => {
      bg.remove();
      document.removeEventListener('keydown', onKey, true);
      resolve(v);
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(null); } };
    const pretty = (stamp) => String(stamp).replace('T', '  ').replace(/-(\d{2})-(\d{2})$/, ':$1:$2');
    const bg = h('div', {
      className: 'modal-bg',
      onClick: (e) => { if (e.target === bg) close(null); },
    },
      h('div', { className: 'modal confirm-modal' },
        h('div', { className: 'modal-hd' },
          h('b', null, 'Version history'),
          h('button', { className: 'sb-twk-x', onClick: () => close(null) }, '\u2715')),
        h('div', { className: 'modal-body' },
          h('p', { className: 'history-lede' },
            String(snaps.length),
            snaps.length === 1 ? ' earlier version of ' : ' earlier versions of ',
            h('b', null, title), ', kept in ', h('code', null, '.history/'), '.'),
          h('div', { className: 'history-list' },
            snaps.map((sn) => h('button', {
              className: 'history-row', onClick: () => close(sn),
            },
              h('span', { className: 'history-when' }, pretty(sn.stamp)),
              h('span', { className: 'history-go' }, 'Restore')))))));
    document.body.appendChild(bg);
    document.addEventListener('keydown', onKey, true);
    asDialog(bg);
  });
}

function EmptyState(msg, sub, action) {
  return h('div', { className: 'empty-state' },
    h('span', { className: 'empty-state-mark' }, brandMark()),
    h('div', { className: 'empty-state-msg' }, msg),
    sub ? h('div', { className: 'empty-state-sub' }, sub) : null,
    action || null);
}
function basename(slug) { return String(slug).split('/').pop(); }

/* 6.6: hand off to Obsidian. The vault name comes from the folder the user
   picked (bridge.js), so nothing here is hardcoded — SPEC §14. Returns null
   when we have no vault name, so callers can hide the affordance rather than
   render a link that cannot work. */
function obsidianUrl(vaultPath) {
  const vault = window.SB_VAULT_NAME || '';
  if (!vault || !vaultPath) return null;
  return 'obsidian://open?vault=' + encodeURIComponent(vault)
       + '&file=' + encodeURIComponent(vaultPath);
}

/* ── local data access + kind registry ────────────────────────────────── */

/* A feature that no longer exists. Named and thrown rather than silently
   returning nothing, so a missed call site is loud (task 6.8). */
function gone(what, why) {
  return Promise.reject(new Error(`${what} is gone — ${why}`));
}

/* The one place a legacy path string still reaches the data layer: a couple of
   list screens are parameterised by path. Translate rather than route. */
function pathToQuery(path) {
  const [, qs = ''] = String(path).split('?');
  const q = new URLSearchParams(qs);
  return {
    q: q.get('q') || '', kind: q.get('kind') || '', tag: q.get('tag') || '',
    mention: q.get('mention') || '',
    limit: q.get('limit') ? parseInt(q.get('limit'), 10) : 200,
  };
}

/* ── Page cache ─────────────────────────────────────────────────────
   Caches full page objects so navigating back to a recently-viewed page is
   instant. Bumped on save (commit) and invalidated on create/delete.
   30s TTL keeps it from drifting too long under heavy editing in other tabs. */
const _pageCache = new Map();  // id → { page, ts }
const PAGE_CACHE_TTL_MS = 5 * 60_000;  // 5 minutes — long enough that nav feels instant
function cacheGetPage(id) {
  const e = _pageCache.get(id);
  if (!e) return null;
  if (Date.now() - e.ts > PAGE_CACHE_TTL_MS) { _pageCache.delete(id); return null; }
  return e.page;
}
function cacheSetPage(p) {
  // Only ever cache a FULL page. List results carry the 300-char excerpt in
  // `body`; caching one made the page view render a truncated, whitespace-
  // collapsed body — which silently swallowed the `## Thread` section of any
  // page longer than the excerpt.
  if (p && p.id && p.bodyIsFull !== false) {
    _pageCache.set(p.id, { page: p, ts: Date.now() });
    noteTabTitle(p.id, p.title || p.slug);
  }
}

/* A tab is how you find a page again, so it has to say the page's name.
   The label was read from this cache alone — and the cache is empty on the
   render that opens the page, so a freshly opened tab said "Page · 01KVZA"
   until something unrelated happened to re-render the strip, and a reloaded
   window said it forever. The name is recorded on the tab instead: it
   persists with the tab, and it is patched into the strip in place rather
   than through render(), because this runs inside a load. */
function noteTabTitle(id, title) {
  if (!title || typeof app === 'undefined' || !app.tabs) return;
  let changed = false;
  for (const t of app.tabs) {
    if (t.route === 'page' && t.openPageId === id && t.title !== title) {
      t.title = title; changed = true;
    }
  }
  if (!changed) return;
  persistTabs();
  const nodes = document.querySelectorAll('.tabs .tab .tab-label');
  app.tabs.forEach((t, i) => { if (nodes[i]) nodes[i].textContent = tabLabel(t); });
}
function cacheInvalidatePage(id) { _pageCache.delete(id); }

async function getPageCached(id) {
  const cached = cacheGetPage(id);
  if (cached) return cached;
  const p = await SB.data().page(id);
  cacheSetPage(p);
  return p;
}
async function v2GetPagesBatch(ids) {
  if (!ids || !ids.length) return [];
  const needed = [];
  const cached = {};
  for (const id of ids) {
    const c = cacheGetPage(id);
    if (c) cached[id] = c;
    else needed.push(id);
  }
  if (needed.length) {
    try {
      const { items } = await SB.data().batch(needed);
      (items || []).forEach((p) => { cacheSetPage(p); cached[p.id] = p; });
    } catch (_) { /* fall through with what we have */ }
  }
  return ids.map((id) => cached[id]).filter(Boolean);
}

/* ── Tag + mention autocomplete ───────────────────────────────────
   Tags: pulled from /api/v2/tags (1-minute client cache). The list filters
   client-side as the user types. Pressing Enter on an empty highlight
   *creates* a new tag with the raw input.
   Mentions: live-search /api/v2/mentions/suggest?q=, returns page objects.
   Pressing Enter on a highlight inserts the page id. */
let _tagsCache = null;
let _tagsCacheTs = 0;
async function fetchAllTags() {
  if (_tagsCache && Date.now() - _tagsCacheTs < 60_000) return _tagsCache;
  try {
    const r = await SB.data().tags();
    _tagsCache = r.tags || [];
    _tagsCacheTs = Date.now();
  } catch (_) { _tagsCache = _tagsCache || []; }
  return _tagsCache;
}
function invalidateTagsCache() { _tagsCache = null; }
async function searchTags(q, exclude) {
  const all = await fetchAllTags();
  const needle = (q || '').toLowerCase();
  const ex = new Set((exclude || []).map((t) => t.toLowerCase()));
  return all
    .filter((t) => !ex.has(t.tag.toLowerCase()) && t.tag.toLowerCase().includes(needle))
    .slice(0, 8);
}
async function searchMentions(q, exclude) {
  const text = (q || '').trim();
  if (!text) return [];
  try {
    const r = await SB.data().suggestMentions(text);
    const ex = new Set(exclude || []);
    return (r.items || []).filter((it) => !ex.has(it.id));
  } catch (_) { return []; }
}

function AutocompleteInput(opts) {
  const { placeholder, fetchSuggestions, onPick, renderItem, allowCreate } = opts;
  const wrap = h('div', { className: 'ac-wrap' });
  const input = h('input', { className: 'chip-input ac-input', placeholder });
  const dropdown = h('div', { className: 'ac-dropdown' });
  let suggestions = [];
  let highlighted = -1;
  let debounceTimer = null;
  let closed = true;

  function open() { closed = false; dropdown.style.display = 'block'; }
  function close() { closed = true; dropdown.style.display = 'none'; }
  close();

  async function refresh() {
    const q = input.value;
    suggestions = await fetchSuggestions(q);
    highlighted = suggestions.length ? 0 : -1;
    clear(dropdown);
    if (!suggestions.length && !(allowCreate && q.trim())) { close(); return; }
    if (allowCreate && q.trim() && !suggestions.some((s) => (s.tag || s.title || '').toLowerCase() === q.trim().toLowerCase())) {
      const createRow = h('div', { className: 'ac-item ac-item-create',
        onMouseDown: (e) => { e.preventDefault(); pickCreate(q.trim()); },
      }, h('span', { className: 'ac-create-marker' }, '+'), 'create "', q.trim(), '"');
      dropdown.appendChild(createRow);
    }
    suggestions.forEach((it, idx) => {
      dropdown.appendChild(h('div', {
        className: 'ac-item' + (idx === highlighted ? ' ac-item-hl' : ''),
        onMouseDown: (e) => { e.preventDefault(); pickIdx(idx); },
        onMouseEnter: () => { highlighted = idx; refreshHighlight(); },
      }, renderItem(it)));
    });
    open();
  }
  function refreshHighlight() {
    dropdown.querySelectorAll('.ac-item').forEach((el, i) => {
      // Account for the "create" row offset (it's not in suggestions[])
      const hasCreateRow = dropdown.firstChild && dropdown.firstChild.classList.contains('ac-item-create');
      const offset = hasCreateRow ? 1 : 0;
      el.classList.toggle('ac-item-hl', i === highlighted + offset);
    });
  }
  function pickIdx(idx) {
    if (idx < 0 || idx >= suggestions.length) return;
    onPick({ existing: suggestions[idx] });
    input.value = ''; close();
  }
  function pickCreate(raw) {
    if (!raw) return;
    onPick({ created: raw });
    input.value = ''; close();
  }

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(refresh, 120);
  });
  input.addEventListener('focus', () => { refresh(); });
  input.addEventListener('keydown', (e) => {
    if (closed && e.key !== 'Enter' && e.key !== 'ArrowDown') return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (closed) refresh();
      if (suggestions.length) {
        highlighted = (highlighted + 1) % suggestions.length;
        refreshHighlight();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (suggestions.length) {
        highlighted = (highlighted - 1 + suggestions.length) % suggestions.length;
        refreshHighlight();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlighted >= 0 && highlighted < suggestions.length) pickIdx(highlighted);
      else if (allowCreate && input.value.trim()) pickCreate(input.value.trim());
    } else if (e.key === 'Escape') {
      close();
    }
  });
  input.addEventListener('blur', () => {
    // Defer so mousedown on a dropdown row fires first
    setTimeout(close, 150);
  });

  wrap.appendChild(input);
  wrap.appendChild(dropdown);
  return wrap;
}


/* ── Icons — inlined lucide (shadcn's icon set) ─────────────────────────
   Path markup vendored so the no-build rule holds. Rendered through a span
   wrapper via innerHTML because h() has no SVG namespace support. Icons
   inherit `currentColor` and size via font-size (1em). */
const LUCIDE = {
  'panel-left-close': '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m16 15-3-3 3-3"/>',
  'panel-left-open':  '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m14 9 3 3-3 3"/>',
  'link-2':      '<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/>',
  'history':     '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  'check':       '<path d="M20 6 9 17l-5-5"/>',
  'arrow-right': '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  'download':    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  'braces':      '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/>',
  'trash-2':     '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
  'home':        '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  'files':       '<path d="M20 7h-3a2 2 0 0 1-2-2V2"/><path d="M9 18a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h7l5 5v9a2 2 0 0 1-2 2Z"/><path d="M3 7.6v12.8A1.6 1.6 0 0 0 4.6 22h9.8"/>',
  'message-circle': '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  'waypoints':   '<circle cx="12" cy="4.5" r="2.5"/><path d="m10.2 6.3-3.9 3.9"/><circle cx="4.5" cy="12" r="2.5"/><path d="M7 12h10"/><circle cx="19.5" cy="12" r="2.5"/><path d="m13.8 17.7 3.9-3.9"/><circle cx="12" cy="19.5" r="2.5"/>',
  'shapes':      '<path d="M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z"/><rect x="3" y="14" width="7" height="7" rx="1"/><circle cx="17.5" cy="17.5" r="3.5"/>',
  'pilcrow':     '<path d="M13 4v16"/><path d="M17 4v16"/><path d="M19 4H9.5a4.5 4.5 0 0 0 0 9H13"/>',
  'file-text':   '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  'bookmark':    '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
  'sticky-note': '<path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9l7-7V5a2 2 0 0 0-2-2Z"/><path d="M15 22v-5a2 2 0 0 1 2-2h5"/>',
  'image':       '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  'user-round':  '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  'users-round': '<path d="M18 21a8 8 0 0 0-16 0"/><circle cx="10" cy="8" r="5"/><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3"/>',
  'folder':      '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  'tag':         '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
  'at-sign':     '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
  'pen-line':    '<path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/>',
  'feather':     '<path d="M12.67 19a2 2 0 0 0 1.416-.588l6.154-6.172a6 6 0 0 0-8.49-8.49L5.586 9.914A2 2 0 0 0 5 11.328V18a1 1 0 0 0 1 1z"/><path d="M16 8 2 22"/><path d="M17.5 15H9"/>',
  'circle-user': '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662"/>',
  'settings':    '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  'arrow-down-up': '<path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/>',
  'database':    '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
  'search':      '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  'plus':        '<path d="M5 12h14"/><path d="M12 5v14"/>',
  'x':           '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  'sparkles':    '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>',
};
function icon(name, cls) {
  return h('span', {
    className: 'lucide' + (cls ? ' ' + cls : ''),
    html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${LUCIDE[name] || ''}</svg>`,
  });
}

/* ── Brand ──────────────────────────────────────────────────────────────
   The CV monogram and the CANON-VAULT wordmark, inlined from the source
   artwork in app/icons/. Inlined rather than <img src>'d because the
   deployed CSP blocks an external request and there is no build step to
   inline one at ship time.

   Both are OUTLINED — filled paths, not live strokes. That is what makes
   them hold up from 16px to 512px: there is no stroke width to scale down
   into a sub-pixel smear, which is exactly what made the earlier
   stroke-based placeholder look washed out in a favicon.

   The single fill is `currentColor`, so one asset serves both themes — the
   source exports carry `fill="black"`, which is invisible on the dark
   ground, and that substitution is the only edit made to them.

   TO UPDATE: re-export from app/icons/mark.svg and app/icons/wordmark.svg,
   swap the path data below, and keep each viewBox in sync with its file.
   app/vault/bridge.js holds a second copy for the first-run screen. */
const BRAND_MARK_VB = '0 0 144 100';
const BRAND_MARK = `<path d="M49.6426 11.3103C58.0084 10.2422 66.4938 11.9487 73.7959 16.1687C79.489 19.4587 84.2172 24.1354 87.5654 29.7243C89.1394 32.3521 87.7727 35.6274 84.9463 36.8083C82.1207 37.9888 78.9145 36.6121 77.1885 34.0827C72.2514 26.8472 63.9417 22.0965 54.5215 22.0964C39.3753 22.0964 27.0967 34.375 27.0967 49.5212C27.0967 64.6673 39.3753 76.946 54.5215 76.946C61.1452 76.9459 67.2197 74.5962 71.959 70.6862C74.3225 68.7365 77.7872 68.3119 80.1709 70.237C82.5557 72.1631 82.9517 75.6935 80.7031 77.7771C75.9253 82.2042 70.0782 85.3689 63.6933 86.9343C55.5022 88.9424 46.8782 88.2067 39.1455 84.8405C31.4128 81.4742 24.998 75.6632 20.8867 68.2995C16.7755 60.9358 15.1949 52.4258 16.3867 44.0769C17.5787 35.7279 21.4779 28.0009 27.4853 22.0817C33.4929 16.1626 41.2768 12.3784 49.6426 11.3103ZM118.446 34.2038C120.06 31.4092 123.681 30.5291 126.397 32.2712C128.903 33.8786 129.734 37.1532 128.297 39.7605L104.945 82.1384C102.861 85.9205 97.4132 85.8849 95.3789 82.0759L82.4726 57.9099C80.797 54.7724 77.4572 52.8875 73.9053 53.0749L64.3369 53.5788C62.7427 57.431 58.9497 60.1421 54.5215 60.1423C48.6556 60.1423 43.9004 55.387 43.9004 49.5212C43.9004 43.6553 48.6556 38.9001 54.5215 38.9001C59.1359 38.9003 63.0619 41.8435 64.5273 45.9548H82.7578C86.0319 45.9549 89.0572 47.7014 90.6943 50.5368L99.8555 66.404L118.446 34.2038Z" fill="currentColor"/>`;

const BRAND_WORD_VB = '0 0 1712 91';
const BRAND_WORD = `<path d="M58.9241 90.7148C22.4681 90.7148 0 73.4966 0 45.327C0 17.3398 22.8178 0 58.487 0C81.8294 0 100.276 7.6052 108.581 20.4428C109.98 22.4505 110.679 24.5191 110.679 26.3444C110.679 30.5425 106.745 33.2195 100.713 33.2195C95.555 33.2195 92.1455 31.5159 89.6976 27.6829C83.8401 18.2525 72.3875 13.3243 58.6619 13.3243C36.9806 13.3243 23.0801 25.736 23.0801 45.327C23.0801 65.0396 36.8932 77.3905 58.7493 77.3905C73.1744 77.3905 84.2773 73.0099 90.0473 63.762C92.3203 60.1723 95.2053 58.7121 100.101 58.7121C106.308 58.7121 110.592 61.5717 110.592 65.7089C110.592 67.7167 109.893 69.5419 108.494 71.6105C100.451 83.5355 82.5288 90.7148 58.9241 90.7148Z" fill="currentColor"/> <path d="M181.228 90.2889C174.321 90.2889 169.862 87.4902 169.862 83.0487C169.862 81.8319 170.3 80.1283 171.349 78.2422L207.98 8.94371C211.039 3.10292 216.11 0.425891 224.328 0.425891C232.633 0.425891 237.704 2.98124 240.851 8.88287L277.569 78.2422C278.619 80.25 279.056 81.6494 279.056 83.0487C279.056 87.3076 274.335 90.2889 267.778 90.2889C261.658 90.2889 258.249 88.3419 256.238 83.6571L247.933 66.8649H200.811L192.505 83.5355C190.407 88.2811 187.085 90.2889 181.228 90.2889ZM206.144 54.4532H242.425L224.503 16.9748H223.891L206.144 54.4532Z" fill="currentColor"/> <path d="M354.762 90.2889C347.943 90.2889 343.834 87.3685 343.834 82.3795V8.51782C343.834 3.46797 348.292 0.425891 355.549 0.425891C360.532 0.425891 363.592 1.64272 367.264 5.11069L426.013 62.971H426.8V8.33529C426.8 3.34629 430.909 0.425891 437.64 0.425891C444.459 0.425891 448.481 3.34629 448.481 8.33529V82.4403C448.481 87.4293 444.372 90.2889 437.028 90.2889C431.87 90.2889 428.898 89.1329 425.313 85.6041L366.389 27.6829H365.602V82.3795C365.602 87.3685 361.494 90.2889 354.762 90.2889Z" fill="currentColor"/> <path d="M574.719 90.7148C537.913 90.7148 514.833 73.3141 514.833 45.3878C514.833 17.4615 537.913 0 574.719 0C611.437 0 634.517 17.4615 634.517 45.3878C634.517 73.3141 611.437 90.7148 574.719 90.7148ZM574.719 77.3296C597.187 77.3296 611.524 64.9179 611.524 45.3878C611.524 25.7968 597.187 13.3851 574.719 13.3851C552.163 13.3851 537.913 25.7968 537.913 45.3878C537.913 64.9179 552.163 77.3296 574.719 77.3296Z" fill="currentColor"/> <path d="M711.797 90.2889C704.978 90.2889 700.869 87.3685 700.869 82.3795V8.51782C700.869 3.46797 705.327 0.425891 712.584 0.425891C717.567 0.425891 720.627 1.64272 724.298 5.11069L783.048 62.971H783.835V8.33529C783.835 3.34629 787.944 0.425891 794.675 0.425891C801.494 0.425891 805.516 3.34629 805.516 8.33529V82.4403C805.516 87.4293 801.407 90.2889 794.063 90.2889C788.905 90.2889 785.933 89.1329 782.348 85.6041L723.424 27.6829H722.637V82.3795C722.637 87.3685 718.528 90.2889 711.797 90.2889Z" fill="currentColor"/> <path d="M884.369 60.3548C878.424 60.3548 873.966 57.7995 873.966 53.6014C873.966 49.4033 878.424 46.848 884.369 46.848H923.885C929.917 46.848 934.289 49.4033 934.289 53.6014C934.289 57.7995 929.917 60.3548 923.885 60.3548H884.369Z" fill="currentColor"/> <path d="M1045.58 90.2889C1037.18 90.2889 1032.38 87.7944 1029.14 81.7102L991.461 12.0466C990.587 10.5256 990.237 9.06539 990.237 7.66604C990.237 3.34629 994.958 0.425891 1001.95 0.425891C1007.81 0.425891 1011.39 2.25114 1013.23 6.38836L1045.66 72.4015H1046.19L1078.54 6.26668C1080.46 2.12945 1083.69 0.425891 1089.55 0.425891C1096.37 0.425891 1101.09 3.34629 1101.09 7.48351C1101.09 8.88287 1100.65 10.2822 1099.87 11.7424L1061.93 81.7711C1058.78 87.7944 1053.97 90.2889 1045.58 90.2889Z" fill="currentColor"/> <path d="M1157.04 90.2889C1150.13 90.2889 1145.67 87.4902 1145.67 83.0487C1145.67 81.8319 1146.11 80.1283 1147.16 78.2422L1183.79 8.94371C1186.85 3.10292 1191.92 0.425891 1200.14 0.425891C1208.45 0.425891 1213.52 2.98124 1216.66 8.88287L1253.38 78.2422C1254.43 80.25 1254.87 81.6494 1254.87 83.0487C1254.87 87.3076 1250.15 90.2889 1243.59 90.2889C1237.47 90.2889 1234.06 88.3419 1232.05 83.6571L1223.74 66.8649H1176.62L1168.32 83.5355C1166.22 88.2811 1162.9 90.2889 1157.04 90.2889ZM1181.96 54.4532H1218.24L1200.31 16.9748H1199.7L1181.96 54.4532Z" fill="currentColor"/> <path d="M1369.91 90.7148C1338 90.7148 1318.07 77.4513 1318.07 58.2862V8.57866C1318.07 3.40713 1322.36 0.425891 1329.35 0.425891C1336.43 0.425891 1340.63 3.40713 1340.63 8.57866V56.8869C1340.63 68.8726 1351.21 77.0254 1369.91 77.0254C1388.62 77.0254 1399.29 68.8726 1399.29 56.8869V8.57866C1399.29 3.40713 1403.49 0.425891 1410.57 0.425891C1417.56 0.425891 1421.76 3.40713 1421.76 8.57866V58.2862C1421.76 77.4513 1401.91 90.7148 1369.91 90.7148Z" fill="currentColor"/> <path d="M1503.76 89.2546C1496.76 89.2546 1492.48 86.2125 1492.48 81.1018V8.57866C1492.48 3.40713 1496.76 0.425891 1503.76 0.425891C1510.84 0.425891 1515.04 3.40713 1515.04 8.57866V75.9911H1563.38C1569.5 75.9911 1573.7 78.5465 1573.7 82.6228C1573.7 86.6992 1569.59 89.2546 1563.38 89.2546H1503.76Z" fill="currentColor"/> <path d="M1661.56 90.2889C1654.56 90.2889 1650.37 87.3076 1650.37 82.1361V14.7237H1621.52C1615.4 14.7237 1611.2 12.1683 1611.2 8.09193C1611.2 4.01554 1615.31 1.4602 1621.52 1.4602H1701.68C1707.89 1.4602 1712 4.01554 1712 8.09193C1712 12.1683 1707.8 14.7237 1701.68 14.7237H1672.83V82.1361C1672.83 87.3076 1668.64 90.2889 1661.56 90.2889Z" fill="currentColor"/>`;

function brandMark(cls) {
  return h('span', {
    className: 'brand-mark' + (cls ? ' ' + cls : ''),
    html: `<svg viewBox="${BRAND_MARK_VB}" fill="currentColor" aria-hidden="true">${BRAND_MARK}</svg>`,
  });
}
function brandWord(cls) {
  return h('span', {
    className: 'brand-word' + (cls ? ' ' + cls : ''),
    html: `<svg viewBox="${BRAND_WORD_VB}" fill="currentColor" aria-hidden="true">${BRAND_WORD}</svg>`,
  });
}

const KIND_META = {
  'note':     { label: 'Note',     icon: 'file-text', glyph: '§', color: 'var(--k-mdwn)',   hint: 'Anything read as prose. A bookmark, a quote, an article — the chrome follows the frontmatter.' },
  'canvas':   { label: 'Board',    icon: 'shapes', glyph: '▦', color: 'var(--k-canvas)',  hint: 'A JSON Canvas board of links, text and images. Obsidian owns the arrangement; read-only here.' },
  'topic':    { label: 'Topic',    icon: 'pilcrow', glyph: '¶', color: 'var(--k-topic)',   hint: 'A text page for a subject you want to think through.' },
  'markdown': { label: 'Markdown', icon: 'file-text', glyph: '§', color: 'var(--k-mdwn)',   hint: 'A rendered markdown article — section headers, pulled quotes, related, contradicts. Beautiful long-form.' },
  'bookmark': { label: 'Bookmark', icon: 'bookmark', glyph: '↗', color: 'var(--k-book)',   hint: 'A URL with context, tags, and connections.' },
  'snippet':  { label: 'Snippet',  icon: 'sticky-note', glyph: '∙', color: 'var(--k-snip)',   hint: 'A quick thought. Mature it into anything later.' },
  'inspo':    { label: 'Inspo',    icon: 'image', glyph: '◫', color: 'var(--k-desg)',    hint: 'A page of inspiration items — local images or pasted links, each with caption and tags.' },
  'project':  { label: 'Project',  icon: 'folder', glyph: '⚐', color: 'var(--k-proj)',   hint: 'A personal container — group topics and canvases under a project via mentions.' },
  'wproject': { label: 'Project',  glyph: '⚑', color: 'var(--k-proj)',   hint: 'A work / design project — holds its IA, flows, components and tokens. Separate from personal projects.' },
};
function kindIcon(kind, cls) {
  const meta = KIND_META[kind];
  return icon(meta && meta.icon ? meta.icon : 'file-text', cls);
}
// `kind: canvas` covers two file formats that behave nothing alike here: a
// `.canvas` board is Obsidian's, read-only; a `.excalidraw.md` drawing is ours,
// fully editable. Showing both under one "Canvas" pill was the single most
// confusing thing about the model — you could not tell from the page whether
// your edits would be kept. This is the one place that decides, so the header,
// the lists and the project view cannot drift apart.
const DRAWING_META = {
  label: 'Drawing', icon: 'shapes', glyph: '✎', color: 'var(--k-canvas)',
  hint: 'An Excalidraw drawing. Edited here and in Obsidian — this app writes it.',
};
function isDrawingPath(path) { return /\.excalidraw\.md$/i.test(String(path || '')); }
/** The chrome for a page, splitting `canvas` by file format. */
function metaForPage(p) {
  if (p && p.kind === 'canvas' && isDrawingPath(p.path)) return DRAWING_META;
  /* A note carrying a url IS a bookmark as far as the reader is concerned:
     the sidebar files it under Bookmark, the page renders the bookmark
     chrome. It used to keep saying "Note" on its own kind pill, because
     bookmark is a derived facet rather than a stored kind — a true fact
     about the data model that the user has no reason to know. The label
     follows the chrome, decided here, once. */
  /* `url` at the top level, not just `meta.url`: a full page object carries
     it under meta, an index entry from `pages()` carries it hoisted — and
     `data.js` derives the whole bookmark facet from the hoisted one. Reading
     only meta.url meant every bookmark in every list was still a "Note". */
  const url = p && (p.url != null ? p.url : (p.meta && p.meta.url));
  if (p && p.kind === 'note' && url) return KIND_META.bookmark;
  return KIND_META[p && p.kind] || KIND_META.note;
}
// "by kind" capture types.
// SPEC §5: 13 kinds collapsed to 4. The old markdown/bookmark/snippet entries
// stay in KIND_META only as a fallback for a stranger's vault; they are not
// offered anywhere, because `note` chrome is decided by frontmatter (§5).
const KIND_ORDER = ['note', 'bookmark', 'topic', 'canvas', 'inspo'];
// Work-mode (design architecture) kinds. Same store + same mention/tag graph
// as the personal kinds above; only the surface (nav, home, create) differs.

/* A kind marker.
   This used to be a bordered, tinted, labelled box on every row — six of them
   down a column already headed "Kind", each one a little rectangle competing
   with the title beside it. In a table the column says what the value means,
   so the marker only has to say WHICH, and a coloured icon does that faster
   than a word does. `withLabel` is for the places that have no column header
   to lean on. */
/* Takes the PAGE, not its `kind` string. It used to take the string, and both
   call sites had a page in hand and passed `p.kind` — so a bookmark wore the
   note icon and announced itself as "Note", and a drawing wore the board icon
   and said "Board", in the two tables where you meet most of your vault.
   metaForPage is the one place that decides; this now asks it. */
function KindChip(page, opts = {}) {
  const p = (page && typeof page === 'object') ? page : { kind: page };
  const meta = metaForPage(p) || { label: p.kind, color: 'var(--muted)' };
  const glyph = icon(meta.icon || 'file-text');
  if (!opts.withLabel) {
    return h('span', {
      className: 'kind-mark' + (opts.large ? ' lg' : ''),
      style: { '--k-c': meta.color },
      title: meta.label,
      'aria-label': meta.label,
    }, glyph);
  }
  return h('span', {
    className: 'kind-chip' + (opts.large ? ' lg' : ''),
    style: { '--k-c': meta.color },
    title: meta.hint,
  },
    h('span', { className: 'kind-chip-g' }, glyph),
    h('span', null, meta.label));
}

/* Inline #hashtags found in a body (code stripped). Obsidian-style, nested with /. */
const _INLINE_TAG_RE = /(?:(?<=\s)|(?<=^))#([A-Za-z0-9_][A-Za-z0-9_/\-]*)/gm;
function extractInlineTags(body) {
  if (!body) return [];
  const scan = String(body).replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  const seen = new Set(); const out = [];
  let m;
  _INLINE_TAG_RE.lastIndex = 0;
  while ((m = _INLINE_TAG_RE.exec(scan))) {
    const low = m[1].toLowerCase();
    if (!seen.has(low)) { seen.add(low); out.push(m[1]); }
  }
  return out;
}

/* Wrap #hashtags in already-rendered HTML as chips (skips code/pre/headings). */
function decorateHashtags(rootEl) {
  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = node.parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;
      if (p.closest('code, pre, a, h1, h2, h3, h4, .hashtag')) return NodeFilter.FILTER_REJECT;
      return /#[A-Za-z0-9_][A-Za-z0-9_/\-]*/.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const targets = [];
  while (walker.nextNode()) targets.push(walker.currentNode);
  for (const node of targets) {
    const frag = document.createDocumentFragment();
    let last = 0;
    const text = node.nodeValue;
    const re = /(^|\s)#([A-Za-z0-9_][A-Za-z0-9_/\-]*)/g;
    let m;
    while ((m = re.exec(text))) {
      const start = m.index + m[1].length;
      if (start > last) frag.appendChild(document.createTextNode(text.slice(last, start)));
      frag.appendChild(h('span', { className: 'hashtag' }, '#' + m[2]));
      last = start + 1 + m[2].length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(frag, node);
  }
}

/* Cached id → {title, kind, slug} map for resolving [[id]] mentions to titles. */
let _pageIndexCache = null;
async function getPageIndex(force) {
  if (_pageIndexCache && !force) return _pageIndexCache;
  try {
    const { items } = await SB.data().pages({ limit: 10000 });
    const map = {};
    (items || []).forEach((p) => {
      map[p.id] = { title: p.title || p.slug || p.id.slice(0, 8), kind: p.kind, slug: p.slug };
    });
    _pageIndexCache = map;
    return map;
  } catch (_) {
    return _pageIndexCache || {};
  }
}
function invalidatePageIndex() { _pageIndexCache = null; }

/* A vault-relative path → the indexed page at it, or null. JSON Canvas `file`
   nodes address by path, unlike wikilinks (which go basename → alias → path),
   so this is a plain lookup and deliberately not `resolveWikilink`. */
function pageByPath(path) {
  const want = String(path || '').replace(/^\.?\//, '').toLowerCase();
  if (!want) return null;
  const entries = (window.SB_VAULT && window.SB_VAULT.list()) || [];
  return entries.find((e) => String(e.path || '').toLowerCase() === want) || null;
}

/* 6.10: turn wikilinks in rendered HTML into clickable links, resolved the way
   Obsidian resolves them — basename → aliases → relative path, case-insensitive.
   Handles [[T]], [[T|display]], [[T#heading]] and ![[file]] embeds. A link is
   only marked `.broken` when it genuinely resolves to nothing. */
function decorateMentions(rootEl) {
  const L = window.SB_LINKS;
  const entries = (window.SB_VAULT && window.SB_VAULT.list()) || [];
  if (!L) return;

  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = node.parentElement;
      if (!p || p.closest('code, pre, a, .mention-link')) return NodeFilter.FILTER_REJECT;
      return /!?\[\[[^\]\n]+\]\]/.test(node.nodeValue)
        ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const targets = [];
  while (walker.nextNode()) targets.push(walker.currentNode);

  for (const node of targets) {
    const text = node.nodeValue;
    const frag = document.createDocumentFragment();
    let last = 0;
    for (const link of L.findWikilinks(text)) {
      if (link.start > last) frag.appendChild(document.createTextNode(text.slice(last, link.start)));
      last = link.end;

      if (link.embed && L.isEmbeddableFile(link.target)) {
        frag.appendChild(renderVaultEmbed(link.target));
        continue;
      }
      const hit = L.resolveWikilink(link.target, entries);
      const label = link.display || (hit ? hit.title : link.target);
      frag.appendChild(h('span', {
        className: 'mention-link' + (hit ? '' : ' broken'),
        title: hit ? (hit.kind + ' · ' + hit.path) : 'unresolved — no file of that name',
        onClick: () => { if (hit) openPage(hit.id); },
      }, label + (link.heading ? ' §' + link.heading : '')));
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(frag, node);
  }
}

/* 6.11: an ![[image]] embed reads bytes from the vault and shows them through an
   object URL. Revoked when the element leaves the document, so browsing a long
   grid does not leak blobs. */
/* A board image lives in the vault, not behind a URL. The old `'/' + asset`
   assumed a server was there to serve it; with the files on local disk that
   request just 404s and every image node renders blank. Resolve it the same
   way `renderVaultEmbed` does — read the bytes, mint an object URL, and hand
   it to the same revocation bookkeeping. */
/* An object URL minted from a typeless Blob works for PNG and JPEG because the
   browser sniffs the magic bytes — and fails silently for SVG, which has none
   worth sniffing and is refused as an <img> source without an explicit type.
   So the type comes from the extension. */
const MIME_FOR = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml',
};
function imageBlob(bytes, path) {
  const ext = String(path).split('.').pop().toLowerCase();
  const type = MIME_FOR[ext];
  return type ? new Blob([bytes], { type }) : new Blob([bytes]);
}

function vaultImage(assetPath, props = {}) {
  const img = h('img', { loading: 'lazy', alt: '', ...props });
  const vault = window.SB_VAULT;
  if (!vault || !assetPath) return img;
  vault.readBlob(assetPath)
    .then((bytes) => {
      const url = URL.createObjectURL(imageBlob(bytes, assetPath));
      img.src = url;
      img.dataset.objectUrl = url;
      registerObjectUrl(img, url);
    })
    .catch(() => { img.classList.add('vault-embed-missing'); });
  return img;
}

function renderVaultEmbed(target) {
  if (/\.canvas$/i.test(target)) {
    const href = obsidianUrl('canvas/' + target);
    return h('span', { className: 'vault-embed vault-embed-canvas' },
      '▦ ', href ? h('a', { href }, target) : target);
  }
  const img = h('img', { className: 'vault-embed vault-embed-img', alt: target });
  const vault = window.SB_VAULT;
  if (vault) {
    vault.readBlob('attachments/' + target)
      .then((bytes) => {
        const url = URL.createObjectURL(imageBlob(bytes, target));
        img.src = url;
        img.dataset.objectUrl = url;
        registerObjectUrl(img, url);
      })
      .catch(() => { img.replaceWith(h('span', { className: 'mention-link broken' }, target)); });
  }
  return img;
}

/* Object-URL bookkeeping: revoke as soon as the element is detached, so
   create count minus revoke count equals what is actually mounted. */
const _objectUrls = new Set();
function registerObjectUrl(el, url) {
  _objectUrls.add(url);
  if (typeof MutationObserver === 'undefined') return;
  const obs = new MutationObserver(() => {
    if (!document.contains(el)) {
      URL.revokeObjectURL(url);
      _objectUrls.delete(url);
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
}

/* "1 projects". Ten places counted things and each decided for itself whether
   to bother with the plural; most did not. One helper, so the app stops
   sounding like a database report. `many` defaults to `one + "s"`. */
function nOf(n, one, many) {
  const k = Number(n) || 0;
  return k + ' ' + (k === 1 ? one : (many || one + 's'));
}

function fmtDate(iso) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 86400 * 14) return `${Math.floor(diff / 86400)}d ago`;
    return d.toISOString().slice(0, 10);
  } catch (_) { return ''; }
}


// Personal mode — the original capture/wiki surface.
const NAV = [
  { group: 'navigate', label: 'navigate', items: [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'pages', label: 'All pages', icon: 'files' },
  ] },
  { group: 'kinds', label: 'by kind', items: KIND_ORDER.map((k) => ({
    id: 'kind:' + k, kind: k, label: KIND_META[k].label, icon: KIND_META[k].icon,
  })) },
  { group: 'projects', label: 'projects', items: [
    { id: 'projects', label: 'Projects', icon: 'folder' },
  ] },
  { group: 'tagging', label: 'tagging', items: [
    { id: 'tags', label: 'Tags', icon: 'tag' },
  ] },
  { group: 'system', label: 'system', items: [
    { id: 'about-me', label: 'About me', icon: 'circle-user' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ] },
];



// ── TabBarSearch — always-visible search input in the top bar.
// Live page-search dropdown as you type; Enter without selecting drops
// into the Ask flow so it handles both "find a page" and "ask the AI"
// in a single input. ⌘K focuses this input from anywhere.
function TabBarSearch() {
  const wrap = h('div', { className: 'tab-search', title: 'Search pages · ⌘K' });
  // Named searchGlyph, not `icon` — a local by that name would shadow the
  // global icon() helper for this whole function.
  const searchGlyph = h('span', { className: 'tab-search-glyph' }, icon('search'));
  const input = h('input', {
    className: 'tab-search-input',
    placeholder: 'search',
    autocomplete: 'off',
  });
  const results = h('div', { className: 'tab-search-results', style: { display: 'none' } });
  let activeIdx = -1;
  let lastItems = [];
  let timer = null;

  const close = () => { results.style.display = 'none'; activeIdx = -1; };

  const renderItems = (items) => {
    clear(results);
    lastItems = items;
    if (!items.length) {
      const askHint = (input.value || '').trim();
      results.appendChild(h('div', { className: 'tab-search-empty' },
        askHint
          ? h('div', null, 'No page matches "', h('b', null, askHint), '".')
          : 'Type to search pages by title, body or tag.'));
      return;
    }
    items.forEach((p, i) => {
      results.appendChild(h('a', {
        className: 'tab-search-result' + (i === activeIdx ? ' active' : ''),
        href: '#page/' + p.id,
        onMouseDown: (e) => {
          // mousedown (not click) so blur doesn't fire first and hide the row.
          e.preventDefault();
          close();
          input.value = '';
          openPage(p.id);
        },
        onMouseEnter: () => { activeIdx = i; },
      },
        // Was the raw `p.kind` — lowercase "note" beside a Note icon, and
        // "canvas" for a drawing. One resolver, sentence case like everywhere.
        h('span', { className: 'tab-search-kind' },
          icon(metaForPage(p).icon || 'file-text'), ' ', metaForPage(p).label),
        h('span', { className: 'tab-search-title' }, p.title || p.slug || '(untitled)'),
        h('span', { className: 'tab-search-snippet' }, firstLineOf(p.body, 80))));
    });
  };

  const doSearch = async (q) => {
    try {
      const data = await SB.data().pages({ q, limit: 8 });
      const items = data.items || data || [];
      results.style.display = 'block';
      renderItems(items);
    } catch (_) { close(); }
  };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q) { close(); return; }
    timer = setTimeout(() => doSearch(q), 140);
  });
  input.addEventListener('focus', () => {
    if (lastItems.length || input.value.trim()) results.style.display = 'block';
  });
  input.addEventListener('blur', () => {
    // Small delay so click handlers on results fire before we hide.
    setTimeout(() => close(), 140);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIdx = Math.min(lastItems.length - 1, activeIdx + 1);
      renderItems(lastItems);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = Math.max(-1, activeIdx - 1);
      renderItems(lastItems);
    } else if (e.key === 'Enter') {
      const q = input.value.trim();
      if (!q) return;
      if (activeIdx >= 0 && lastItems[activeIdx]) {
        close();
        input.value = '';
        openPage(lastItems[activeIdx].id);
      } else {
        close();
        input.value = '';
        submitSearch(q);   // → the full list, filtered
      }
    } else if (e.key === 'Escape') {
      input.value = '';
      close();
      input.blur();
    }
  });

  wrap.appendChild(searchGlyph);
  wrap.appendChild(input);
  wrap.appendChild(results);
  return wrap;
}

// ── TabBar (top of the app — Notion-style multi-tab work surface) ───────
function TabBar(tabs, activeTabId, onSwitch, onClose, onNew) {
  return h('div', { className: 'tabbar' },
    // Monogram only. In app chrome the name is dead weight — you know which
    // app you are in by the time you have opened a vault, and the tab strip
    // needs the width more than the identity does. The full lockup stays on
    // the first-run screen, which is the one place the name is doing work.
    /* The brand cell spans the sidebar's width so the rule between chrome
       and content runs unbroken — but that left an 18px mark alone in 244px
       of nothing. The collapse control lives here now: it belongs to the
       sidebar, it sits at the sidebar's edge, and the space was already
       paid for. */
    h('div', { className: 'tab-brand' },
      h('a', {
        className: 'tab-brand-link', href: '#home', title: 'Canon Vault v0.6',
        'aria-label': 'Canon Vault — home',
        onClick: (e) => { e.preventDefault(); setRoute('home'); },
      }, brandMark()),
      h('button', {
        className: 'nav-collapse',
        title: app.navCollapsed ? 'Expand sidebar' : 'Collapse sidebar',
        'aria-label': app.navCollapsed ? 'Expand sidebar' : 'Collapse sidebar',
        onClick: () => { setNavCollapsed(!app.navCollapsed); render(); },
      }, icon(app.navCollapsed ? 'panel-left-open' : 'panel-left-close'))),
    TabBarSearch(),
    h('div', { className: 'tabs', role: 'tablist' },
      ...tabs.map((t) => h('div', {
        className: 'tab' + (t.id === activeTabId ? ' tab-active' : ''),
        role: 'tab',
        'aria-current': t.id === activeTabId ? 'true' : 'false',
        onClick: () => onSwitch(t.id),
        // Middle-click closes (browser convention).
        onAuxClick: (e) => { if (e.button === 1) { e.preventDefault(); onClose(t.id); } },
      },
        h('span', { className: 'tab-label' }, tabLabel(t)),
        tabs.length > 1 ? h('button', {
          className: 'tab-close', title: 'close (middle-click works too)',
          onClick: (e) => { e.stopPropagation(); onClose(t.id); },
        }, '×') : null,
      )),
      h('button', { className: 'tab-add', title: 'New tab (⌘T)', onClick: onNew }, '+')));
}

// ── BreadcrumbRow ───────────────────────────────────────────────────────
// Sits below the tab bar, above page content. Pure breadcrumbs — search +
// status indicators live elsewhere now.
function BreadcrumbRow(crumbs) {
  return h('div', { className: 'crumb-row' },
    crumbs.map((c, i) => {
      const label = typeof c === 'string' ? c : c.label;
      const target = typeof c === 'string' ? null : c.route;
      const isLast = i === crumbs.length - 1;
      return [
        i > 0 ? h('span', { className: 'sep' }, '/') : null,
        isLast
          ? h('b', null, label)
          : target
            ? h('a', { className: 'crumb-link', href: '#' + target,
                onClick: (e) => { e.preventDefault(); setRoute(target); } }, label)
            : h('span', null, label),
      ];
    }));
}

// ── SearchPanel — quick-search modal triggered by the sidebar search icon (or ⌘K) ─
function SearchPanel(onClose) {
  const wrap = h('div', { className: 'search-overlay', onClick: (e) => { if (e.target === wrap) onClose(); } });
  const panel = h('div', { className: 'search-panel' });
  const resultsBox = h('div', { className: 'search-results' });
  let searchTimer = null;
  let lastResults = [];

  const renderResults = (items) => {
    clear(resultsBox);
    if (!items.length) {
      resultsBox.appendChild(h('div', { className: 'search-empty' },
        'No page matches.'));
      return;
    }
    items.forEach((p) => {
      resultsBox.appendChild(h('a', {
        className: 'search-result',
        href: '#page/' + p.id,
        onClick: (e) => { e.preventDefault(); onClose(); openPage(p.id); },
      },
        h('span', { className: 'search-result-kind' }, p.kind),
        h('span', { className: 'search-result-title' }, p.title || '(untitled)'),
        h('span', { className: 'search-result-snippet' }, firstLineOf(p.body, 80))));
    });
  };

  const doSearch = async (q) => {
    try {
      const { items } = await SB.data().pages({ q, limit: 10 });
      lastResults = items || [];
      renderResults(lastResults);
    } catch (_) {
      clear(resultsBox);
    }
  };

  const input = h('input', {
    className: 'search-input', autofocus: 'true',
    placeholder: 'Search pages…',
    onInput: (e) => {
      clearTimeout(searchTimer);
      const q = e.target.value.trim();
      if (!q) { clear(resultsBox); return; }
      searchTimer = setTimeout(() => doSearch(q), 150);
    },
    onKeyDown: (e) => {
      if (e.key === 'Enter' && e.target.value.trim()) {
        const q = e.target.value.trim();
        onClose();
        submitSearch(q);
      } else if (e.key === 'Escape') {
        onClose();
      }
    },
  });

  panel.appendChild(input);
  panel.appendChild(resultsBox);
  wrap.appendChild(panel);
  // Focus the input on the next tick so autofocus actually works post-mount.
  setTimeout(() => input.focus(), 0);
  return wrap;
}


function Sidebar(route, setRoute, kindCounts, onCreate, offline, lastSynced) {
  const order = KIND_ORDER;
  /* KIND_ORDER is the NAV, not the set of kinds — `bookmark` is a derived
     facet (a note carrying a url), so summing the facet counts counted every
     bookmark twice. The sidebar said "15 pages" while the dashboard said
     "14 pages total", two numbers for the same vault and the louder one
     wrong. The real total comes from the store. */
  const total = (app.stats && app.stats.pages_total != null)
    ? app.stats.pages_total
    : order.reduce((n, k) => n + ((kindCounts || {})[k] || 0), 0);
  const groupLabel = (g) => g.group === 'kinds'
    ? `by kind — ${total} pages`
    : g.label;
  // Drag handle on the sidebar's right edge, and a collapse toggle. Same
  // shape as the activity log's resizer so both rails behave identically.
  const resize = h('div', { className: 'nav-resize', title: 'Drag to resize' });
  resize.addEventListener('pointerdown', (e) => startNavResize(e, resize));
  resize.addEventListener('dblclick', () => { app.navW = 244; applyNavW();
    try { localStorage.setItem('sb.navW', '244'); } catch (_) {} });

  return h('div', { className: 'nav' },
    resize,
    // ── top: Create button (search lives in the top tab bar now) ────────
    // Work mode is project-first: this makes a new project (the container),
    // not a lone design page.
    h('div', { className: 'nav-create' },
      h('button', {
        className: 'btn-create',
        onClick: onCreate,
        title: 'Create new page  (⌘N)',
      },
        h('span', { className: 'btn-create-plus' }, icon('plus')),
        h('span', { className: 'nav-lbl' }, 'Create new')),
      ),

    // ── nav groups (scrollable) ─────────────────────────────────────────
    h('div', { className: 'nav-scroll' },
      NAV.map((g) => h('div', null,
        h('div', { className: 'nav-section' }, groupLabel(g)),
        g.items.map((it) => {
          const c = it.kind ? (kindCounts || {})[it.kind] : null;
          const meta = it.kind ? KIND_META[it.kind] : null;
          return h('div', {
            className: `nav-item ${g.group === 'kinds' ? 'nav-cat' : ''}`,
            'aria-current': route === it.id ? 'true' : 'false',
            onClick: (e) => {
              if (it.href) { window.open(it.href, '_blank', 'noopener,noreferrer'); return; }
              if (e.metaKey || e.ctrlKey) { newTab(it.id, null, { switchTo: true }); return; }
              setRoute(it.id);
            },
            /* Was 'click · ⌘-click to open in new tab' on all eleven rows: a
               tooltip that pops over the primary navigation on every hover,
               says the same generic thing each time, and teaches nothing
               after the first. A row's tooltip is its own name, and only
               when the label is not already sitting next to the icon.
               The aria-label is unconditional — collapsed, the label is
               `display: none` and the icon would name nothing. */
            title: app.navCollapsed ? it.label : null,
            'aria-label': it.label,
            style: meta ? { '--k-c': meta.color } : null,
          },
            h('span', { className: 'nav-icon' + (meta ? ' kind-glyph' : '') },
              icon(it.icon || (meta && meta.icon) || 'file-text')),
            h('span', { className: 'nav-lbl' }, it.label),
            it.href ? h('span', { className: 'ct' }, '↗') : h('span', { className: 'ct' }, c != null ? String(c) : ''));
        })))),

    /* ── bottom: is the vault there, and is my work on disk ──────────────
       Nothing else. The colour-mode swatches used to sit here, on the theory
       that appearance is a whim and a whim buried two clicks deep never gets
       used. It is a preference, and preferences live in Settings — where the
       swatches went, unchanged, because a swatch is still a better answer to
       "what will this look like" than the word "midnight" is.

       No gear either: "Settings" already sits in the SYSTEM group four rows
       up, and the popover it opened had been reduced to one control plus a
       link to the very screen that nav row goes to. */
    h('div', { className: 'nav-foot' },
      h('div', { className: 'nav-status-row' },
        h('span', { className: 'dot', style: offline ? { background: 'var(--signal-alert)' } : null }),
        h('span', { className: 'nav-status-label' }, offline ? 'vault unavailable' : 'vault ready')),
      h('div', { className: 'nav-status-row' },
        h('span', { className: 'nav-status-label nav-status-sync' },
          offline ? 'not saved' : ('saved ' + (lastSynced || 'just now'))))));
}

/* A row of real colour chips. Each paints its own page + ink, so the control
   previews the mode instead of naming it. System gets a split chip — half
   light, half dark — which reads as "whichever your OS is" without a label. */
function ThemePicker() {
  const current = app.t.theme || 'system';
  return h('div', {
    className: 'theme-picker', role: 'radiogroup', 'aria-label': 'Colour mode',
  },
    ...THEMES.map((t) => {
      const on = current === t.id;
      const chip = h('button', {
        className: 'theme-chip' + (on ? ' on' : '') + (t.id === 'system' ? ' theme-chip-system' : ''),
        role: 'radio', 'aria-checked': String(on),
        title: t.label + (t.id === 'system' ? ' — follows your OS' : ''),
        'aria-label': t.label,
        onClick: () => setTweak('theme', t.id),
      });
      if (t.swatch) {
        chip.style.setProperty('--chip-bg', t.swatch[0]);
        chip.style.setProperty('--chip-ink', t.swatch[1]);
      }
      return chip;
    }));
}

function PageHeader(title, meta, sub, right) {
  return [
    h('div', { className: 'page-h' },
      h('h1', null, title),
      h('span', { className: 'meta' }, meta)),
    h('div', { className: 'page-sub' },
      h('span', null, sub),
      h('span', null, right)),
  ];
}


/* ── v2 screens ───────────────────────────────────────────────────────── */

/* One creation picker for the whole app.

   There were three grammars. This modal offered five kinds. The project
   screen's picker offered six — the same five plus Drawing. And a new
   project came from a browser `prompt()` dialog, which is a different visual
   language entirely and cannot be styled, themed or cancelled consistently.

   A person creating something should meet the same control every time,
   whichever door they came through. So: every creatable thing is here,
   including Project and Drawing, and Project asks for its name inline
   instead of handing off to the browser. */
const CREATABLE_KINDS = [...KIND_ORDER, 'drawing', 'project'];
function creatableMeta(k) {
  if (k === 'drawing') return DRAWING_META;
  if (k === 'project') return {
    label: 'Project', icon: 'folder', color: 'var(--k-proj)',
    hint: 'A folder that holds pages. Not a kind — a container for the others.',
  };
  return KIND_META[k] || {};
}

function CreateModal(open, onPick, onClose) {
  if (!open) return null;
  const body = h('div', { className: 'modal-body' });
  // `open === 'project'` means someone pressed "New project" and should land
  // on the name field, not on the grid they already made a choice in.
  const startAt = open === 'project' ? 'project' : 'grid';

  function paintGrid() {
    clear(body);
    body.appendChild(h('div', { className: 'kind-grid' },
      CREATABLE_KINDS.map((k) => {
        const m = creatableMeta(k);
        return h('button', {
          className: 'kind-card', style: { '--k-c': m.color },
          onClick: () => (k === 'project' ? paintProjectName() : onPick(k)),
        },
          h('div', { className: 'kind-card-g' }, k === 'drawing' || k === 'project'
            ? icon(m.icon) : kindIcon(k)),
          h('div', { className: 'kind-card-l' }, m.label),
          h('div', { className: 'kind-card-h' }, m.hint));
      })));
  }

  /* A project is a folder, so it needs a name before it can exist — the one
     creatable thing that cannot be made empty and titled later. It asks here
     rather than through prompt(). */
  function paintProjectName() {
    clear(body);
    const input = h('input', {
      className: 'set-input create-name', placeholder: 'Project name',
      autocomplete: 'off',
      onKeyDown: (e) => {
        if (e.key === 'Enter') { e.preventDefault(); go(); }
        if (e.key === 'Escape') { e.preventDefault(); paintGrid(); }
      },
    });
    const err = h('div', { className: 'create-err' });
    const go = () => {
      const v = (input.value || '').trim();
      if (!v) { err.textContent = 'Give the project a name first.'; input.focus(); return; }
      onPick('project', v);
    };
    body.appendChild(h('div', { className: 'create-name-form' },
      h('button', { className: 'btn create-back', onClick: paintGrid },
        icon('arrow-right', 'flip'), 'Back'),
      h('label', { className: 'create-name-l', for: 'cv-new-project' },
        'Name this project'),
      h('div', { className: 'create-name-row' }, input,
        h('button', { className: 'btn-create', onClick: go }, 'Create')),
      h('p', { className: 'create-name-h' },
        'This becomes a folder in your vault, with a note inside it of the same name.'),
      err));
    setTimeout(() => input.focus(), 0);
  }

  if (startAt === 'project') paintProjectName(); else paintGrid();
  const bg = h('div', { className: 'modal-bg', onClick: (e) => { if (e.target.classList.contains('modal-bg')) onClose(); } },
    h('div', { className: 'modal' },
      h('div', { className: 'modal-hd' },
        h('b', null, 'Create new'),
        h('span', { className: 'modal-kbd' }, '\u2318N'),
        h('button', { className: 'sb-twk-x', title: 'Close', 'aria-label': 'Close',
          onClick: onClose }, '\u2715')),
      body));
  // This one is returned into the render tree rather than appended, so it is
  // not in the document yet. Escape is already handled by the global key
  // handler that owns \u2318N.
  requestAnimationFrame(() => {
    if (document.body.contains(bg)) {
      asDialog(bg, { restore: () => document.querySelector('.nav-create .btn-create') });
    }
  });
  return bg;
}

function V2Home(state, onOpen, onCreate, onKind) {
  const wrap = h('div', { className: 'screen' });

  // Show whatever we already have cached, then refresh with the dashboard endpoint.
  function paint(dash) {
    clear(wrap);
    const s = dash.stats || {};
    const obs = dash.obsessions || [];
    const recent = dash.recent || [];
    const buckets = dash.buckets || [];

    if ((s.pages_total || 0) === 0) {
      append(wrap, [
        h('div', { className: 'dash-hd' },
          h('h1', { className: 'dash-title' }, 'Dashboard',
            h('span', { className: 'dash-title-c' }, 
              h('span', { className: 'dim' }, 'nothing captured yet')))),
        FirstRunPanel(onCreate),
      ]);
      return;
    }

    /* "Via" records how a page arrived — hand-written, clipped, imported.
       In a vault you wrote yourself every row says "self", and a column
       whose every cell is identical is a column carrying no information.
       Render it only when the data actually varies. */
    const showVia = new Set(recent.map((r) => r.via)).size > 1;

    append(wrap, [
      h('div', { className: 'dash-hd' },
        h('h1', { className: 'dash-title' }, 'Dashboard',
          h('span', { className: 'dash-title-c' },  h('span', { className: 'dim' }, "what's in the air"))),
        h('div', { className: 'dash-sub' },
          h('span', null,
            h('b', null, String(s.fresh_this_week || 0)), ' new this week · ',
            h('b', null, String(s.mentions_total || 0)),
            (Number(s.mentions_total) === 1 ? ' mention · ' : ' mentions · '),
            h('b', null, String(s.pages_total || 0)),
            (Number(s.pages_total) === 1 ? ' page total' : ' pages total')),
          h('span', { className: 'dash-sub-r' },
            'updated ', fmtDate(s.last_synced || ''))),
        h('button', { className: 'btn-primary dash-cta', onClick: onCreate }, '+ new page')),

      // ── Current obsessions ──
      h('div', { className: 'sect-hd' },
        h('span', null, 'Current obsessions'),
        h('span', { className: 'sect-hd-c' }, 'detected by tag clustering')),
      obs.length === 0
        ? EmptyState('No themes detected yet.',
            'Once a tag is on 2+ pages it starts surfacing here as a cluster.')
        : h('div', { className: 'obs-grid' },
            obs.map((o) => obsessionCard(o))),

      // ── Recent captures ──
      h('div', { className: 'sect-hd' },
        h('span', null, 'Recent pages'),
        h('span', { className: 'sect-hd-c' }, 'last 72h')),
      recent.length === 0
        ? EmptyState('No recent pages.', 'Create one above.')
        : h('div', { className: 'pages-table recent-table' },
            /* Two columns were dropped here.

               ID printed a ULID prefix. Nobody recalls a page by ULID, and
               it took the leftmost, most-scanned column in the table. It is
               still one click away in the Metadata rail.

               Via read "← self" on every row in a self-authored vault. A
               column whose every cell is identical carries no information;
               it is now rendered only when some row actually differs. */
            h('div', { className: 'pages-th recent-th' + (showVia ? '' : ' recent-th-novia') },
              h('span', null, 'Kind'),
              h('span', null, 'Title'),
              showVia ? h('span', { className: 'recent-via-h' }, 'Via') : null,
              h('span', { className: 'pages-tags-h' }, 'Tags'),
              h('span', null, 'When')),
            recent.map((r) => h('div', {
              className: 'pages-row recent-row' + (showVia ? '' : ' recent-row-novia'), onClick: () => onOpen(r.id),
            },
              h('span', null, KindChip(r)),
              h('span', { className: 'pages-title' }, r.title),
              showVia ? h('span', { className: 'recent-via' }, r.via) : null,
              h('span', { className: 'pages-tags' },
                (r.tags || []).slice(0, 2).map((t) => h('span', { className: 'tag-chip' }, t))),
              h('span', { className: 'pages-when' }, fmtDate(r.updated))))),

      // ── Activity buckets (replaces v1's "memory tiers") ──
      h('div', { className: 'sect-hd' },
        h('span', null, 'Activity buckets'),
        // Was "auto-cohorted by recency" — two pieces of jargon for a sentence
        // anyone can read.
        h('span', { className: 'sect-hd-c' }, 'by when you last touched them')),
      h('div', { className: 'tier-grid' },
        buckets.map((b) => bucketCard(b, s.pages_total || 0))),
    ]);
  }

  function obsessionCard(o) {
    const spark = o.sparkline || [];
    const peak = Math.max(1, ...spark);
    // A theme IS a tag, so the card says so and doubles as the way into that
    // tag's pages — it was previously a dead end unless you clicked one of the
    // three member links.
    const openTag = () => setRoute('tag:' + o.title);
    return h('div', { className: 'obs-card' },
      h('div', { className: 'obs-hd' },
        h('button', { className: 'obs-title', onClick: openTag,
          title: 'See every page tagged ' + o.title },
          h('span', { className: 'obs-hash' }, '#'), o.title),
        // "w=1" was internal vocabulary leaking into the UI — nobody outside
        // the clustering code knows what w is. Confidence is the same signal
        // in a form that answers a question a reader would actually ask.
        /* This printed "100%" on a three-page cluster, which invites more
           trust than a three-page cluster has earned. Below a handful of
           pages the honest answer is a word, not a number. */
        h('span', { className: 'obs-weight', title: 'How tightly these pages cluster' },
          o.captures >= 5 ? String(o.confidence) + '%'
            : (o.confidence >= 80 ? 'tight' : o.confidence >= 50 ? 'loose' : 'early'))),
      h('div', { className: 'obs-stats' },
        h('b', null, String(o.captures)), Number(o.captures) === 1 ? ' page' : ' pages',
        h('span', { className: 'obs-dot' }),
        h('b', null, String(o.days)), Number(o.days) === 1 ? ' day active' : ' days active'),
      // Zero days used to render as a flat dashed line, which reads as a
      // broken chart rather than as a quiet week. Every column now has a
      // visible floor, so an empty day looks like an empty day.
      h('div', { className: 'spark', 'aria-hidden': 'true' },
        spark.map((v) => h('div', { className: 'spark-col' },
          h('div', {
            className: 'spark-bar' + (v ? '' : ' spark-bar-zero'),
            style: { height: Math.max(6, Math.round((v / peak) * 100)) + '%' },
          })))),
      (o.related_tags || []).length
        ? h('div', { className: 'obs-tags' },
            (o.related_tags || []).slice(0, 6).map((t) => h('button', {
              className: 'tag-chip tag-chip-btn', onClick: () => setRoute('tag:' + t),
            }, t)))
        : null,
      h('div', { className: 'obs-members' },
        h('div', { className: 'obs-members-l' }, 'top pages in this theme'),
        (o.members || []).map((m) => h('button', {
          className: 'obs-member', onClick: () => onOpen(m.id),
        },
          h('span', { className: 'obs-member-g', style: { color: metaForPage(m).color || 'var(--muted)' } },
            icon(metaForPage(m).icon || 'file-text')),
          h('span', { className: 'obs-member-t' }, m.title),
          h('span', { className: 'obs-member-go' }, icon('arrow-right'))))));
  }

  /* Each bucket against the vault, not against a ceiling.
     `b.cap` and `b.footer_l` are still computed — dashboard.js reproduces the
     Python original field for field, and a fixture test holds it to that — but
     they are not shown. The caps were 60 and 200, invented numbers that
     nothing enforces and nothing happens at, so "5% of soft cap" measured
     progress toward an event that does not exist. Share of the vault is a
     proportion the reader can actually use: how much of this is live thinking
     and how much is archive. Reference stopped being the odd one out, too — it
     had no cap, so it printed "(pages unbounded)" and drew a flat dashed bar
     where the others drew a real one. */
  function bucketCard(b, total) {
    const pct = total ? Math.round((b.count / total) * 100) : 0;
    return h('div', { className: 'tier-card' },
      h('div', { className: 'tier-hd' },
        h('span', null, b.label.toUpperCase()),
        // The single-letter badge said "F" beside a heading reading "FRESH".
        // A label and its own initial are not two pieces of information.
        ),
      h('div', { className: 'tier-n' },
        h('span', { className: 'tier-count' }, String(b.count)),
        h('span', { className: 'tier-cap' }, ' of ', nOf(total, 'page'))),
      h('div', { className: 'tier-cap-line' }, b.caption),
      h('div', { className: 'tier-bar' },
        h('div', { className: 'tier-bar-fill', style: { width: pct + '%' } })),
      h('div', { className: 'tier-foot' },
        h('span', null, total ? pct + '% of the vault' : ''),
        h('span', null, b.footer_r || '')));
  }

  // Initial paint with a minimal scaffold so the screen isn't blank during fetch.
  append(wrap, [
    h('div', { className: 'dash-hd' },
      h('h1', { className: 'dash-title' }, 'Dashboard',
        h('span', { className: 'dash-title-c' },  h('span', { className: 'dim' }, 'loading…'))),
      h('div', { className: 'dash-sub' }, ' '),
      h('button', { className: 'btn-primary dash-cta', onClick: onCreate }, '+ new page')),
  ]);

  Promise.resolve(SB.data().dashboard()).then(paint).catch((e) => {
    clear(wrap);
    append(wrap, [
      PageHeader('dashboard', null, 'failed to load dashboard data', null),
      EmptyState('Could not load.', String(e.message || e)),
    ]);
  });

  return wrap;
}





/* ── Work mode: design tokens visualization ────────────────────────
   Token pages carry meta.group (color|type|space|radius), meta.value,
   meta.ref (code variable). The gallery groups them and renders each
   group as what it actually is — swatches, a type scale, spacing bars,
   radius boxes — rather than a list of strings. */

/* Flowchart node shapes. Returns an SVG skin (fill var(--node-fill), stroke
   var(--ft)) drawn behind the node's HTML text. Most shapes fill the card box
   (preserveAspectRatio none); square/circle keep a 1:1 aspect (CSS centers them). */
const FLOW_SHAPES = ['rectangle', 'pill', 'parallelogram', 'diamond', 'triangle', 'hexagon', 'oval', 'square', 'circle'];
const _FLOW_SHAPE_FIT = new Set(['square', 'circle']);



/* ── per-kind listing views ────────────────────────────────────────
   - canvas → board: large cards w/ item-count preview
   - topic  → list:  compact rows w/ first-line snippet
   - inspo  → bento: asymmetric image grid, thumbnail-first
   - other  → table: kind/title/tags/updated (the previous default) */
function firstLineOf(body, max = 140) {
  if (!body) return '';
  const line = String(body).trim().split('\n').find((l) => l.trim()) || '';
  return line.length > max ? line.slice(0, max) + '…' : line;
}
/* Returns {url} for a remote asset or {asset} for one in the vault — never a
   `'/' + path` string, which only resolved when a server was serving them. */
function inspoThumb(p) {
  const items = (p.meta && Array.isArray(p.meta.layout)) ? p.meta.layout : [];
  for (const it of items) {
    if (it.type !== 'image') continue;
    if (it.assetUrl) return { url: it.assetUrl };
    if (it.asset) return { asset: it.asset };
  }
  // Bento-model pages keep items in the body; the excerpt keeps the first
  // ~300 chars of it, which is enough to find the first image embed.
  const m = String(p.excerpt || p.body || '').match(/!\[\[([^\]|]+\.(?:png|jpe?g|gif|webp|avif|svg))(?:\|[^\]]*)?\]\]/i);
  if (m) return { asset: m[1] };
  return null;
}
function itemCount(p) {
  const items = (p.meta && Array.isArray(p.meta.layout)) ? p.meta.layout : [];
  return items.length;
}

function ListView_Board(pages, onOpen) {
  return h('div', { className: 'pages-board' },
    pages.map((p) => {
      // A list never loads geometry: `pages()` serves index entries, and SPEC §7
      // keeps full bodies (and the `.canvas` sidecar) out of the index. So the
      // node count here is UNKNOWN, not zero — this card used to render it as
      // "empty board · 0 items" for every board in the vault, which is a claim
      // about the user's work rather than about what we loaded.
      const drawing = isDrawingPath(p.path);
      return h('div', { className: 'board-card', onClick: () => onOpen(p.id) },
        h('div', { className: 'board-card-hd' },
          h('span', { className: 'board-card-title' }, p.title || '(untitled)'),
          h('span', { className: 'board-card-when' }, fmtDate(p.updated))),
        h('div', { className: 'board-card-preview' },
          h('div', { className: 'board-card-empty' },
            drawing ? '✎ drawing' : '▦ board')),
        h('div', { className: 'board-card-ft' },
          // Named for what it holds. It was `board-card-count` — a leftover from
          // the node count above — and a `nowrap` excerpt under a count's
          // styling ran 20px past the card it sits in.
          h('span', { className: 'board-card-line' },
            firstLineOf(p.excerpt || '', 60) || (drawing ? 'Excalidraw' : 'JSON Canvas')),
          h('span', { className: 'board-card-tags' },
            (p.tags || []).slice(0, 3).map((t) => h('span', { className: 'tag-chip' }, t)))));
    }));
}

// Tree-aware list. Pages with meta.parent referencing a sibling are rendered
// indented under their parent (up to MAX_DEPTH levels, matching the create-cap).
const SUBPAGE_MAX_DEPTH = 3;
function ListView_List(pages, onOpen) {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const childMap = new Map();
  const roots = [];
  pages.forEach((p) => {
    const parentId = p.meta && p.meta.parent;
    if (parentId && byId.has(parentId)) {
      if (!childMap.has(parentId)) childMap.set(parentId, []);
      childMap.get(parentId).push(p);
    } else {
      roots.push(p);
    }
  });
  // Sort siblings newest-first
  const byNewer = (a, b) => String(b.updated || '').localeCompare(String(a.updated || ''));
  roots.sort(byNewer);
  childMap.forEach((arr) => arr.sort(byNewer));

  const rows = [];
  function renderRow(p, depth) {
    const indent = depth * 22;
    const row = h('div', {
      className: 'list-row' + (depth > 0 ? ' list-row-child' : ''),
      style: { paddingLeft: (14 + indent) + 'px' },
      onClick: () => onOpen(p.id),
    },
      depth > 0 ? h('span', { className: 'tree-branch' }, '└─') : null,
      h('div', { className: 'list-row-main' },
        h('div', { className: 'list-row-title' }, p.title || '(untitled)'),
        h('div', { className: 'list-row-snippet' }, firstLineOf(p.body))),
      h('div', { className: 'list-row-meta' },
        h('span', { className: 'list-row-tags' },
          (p.tags || []).slice(0, 4).map((t) => h('span', { className: 'tag-chip' }, t))),
        h('span', { className: 'list-row-when' }, fmtDate(p.updated))));
    rows.push(row);
    if (depth < SUBPAGE_MAX_DEPTH - 1) {
      (childMap.get(p.id) || []).forEach((c) => renderRow(c, depth + 1));
    }
  }
  roots.forEach((r) => renderRow(r, 0));
  return h('div', { className: 'pages-list pages-tree' }, rows);
}

function ListView_Bento(pages, onOpen) {
  return h('div', { className: 'pages-bento' },
    pages.map((p) => {
      const thumb = inspoThumb(p);
      const cls = 'bento-tile' + (thumb ? '' : ' bento-tile-empty');
      return h('div', { className: cls, onClick: () => onOpen(p.id) },
        thumb
          ? (thumb.url
              ? h('img', { src: thumb.url, loading: 'lazy', alt: p.title || '' })
              : vaultImage(thumb.asset, { alt: p.title || '' }))
          : null,
        h('div', { className: 'bento-tile-overlay' },
          h('div', { className: 'bento-tile-title' }, p.title || '(untitled)'),
          h('div', { className: 'bento-tile-meta' },
            h('span', null, nOf(itemCount(p), 'item')),
            h('span', null, fmtDate(p.updated)))));
    }));
}

function ListView_Table(pages, onOpen) {
  return h('div', { className: 'pages-table' },
    h('div', { className: 'pages-th' },
      h('span', null, 'Kind'),
      h('span', null, 'Title'),
      h('span', null, 'Tags'),
      h('span', null, 'Updated')),
    pages.map((p) => h('div', { className: 'pages-row', onClick: () => onOpen(p.id) },
      h('span', null, KindChip(p)),
      h('span', { className: 'pages-title' }, p.title || '(untitled)'),
      h('span', { className: 'pages-tags' },
        (p.tags || []).slice(0, 4).map((t) => h('span', { className: 'tag-chip' }, t))),
      h('span', { className: 'pages-when' }, fmtDate(p.updated)))));
}

function V2PagesList(kind, pages, onOpen, onCreate) {
  const meta = kind ? KIND_META[kind] : null;
  // Sentence case, like every other screen title. It used to lowercase the
  // kind label — so the nav said "Note" and the screen it opened said "note".
  const title = meta ? meta.label : 'All pages';
  const wrap = h('div', { className: 'screen' });
  // Local filter state. We keep the input value in a closure so re-render
  // doesn't clobber what the user has typed.
  // A search submitted from the top bar lands here as a filter, so Enter does
  // what the box says instead of navigating to a screen that no longer exists.
  let query = app.pendingFilter || '';
  app.pendingFilter = null;
  const listSlot = h('div', { className: 'list-slot' });

  function matchesQuery(p, q) {
    if (!q) return true;
    const n = q.toLowerCase();
    return (p.title || '').toLowerCase().includes(n)
        || (p.body || '').toLowerCase().includes(n)
        || (p.tags || []).some((t) => t.toLowerCase().includes(n))
        || (p.slug || '').toLowerCase().includes(n);
  }

  function renderList() {
    const filtered = query ? pages.filter((p) => matchesQuery(p, query)) : pages;
    clear(listSlot);
    let view;
    if (!filtered.length) {
      if (!pages.length) {
        view = EmptyState(`No ${meta ? meta.label.toLowerCase() : ''} pages yet.`,
          'Click "new" above to create one.');
      } else {
        view = EmptyState('No matches for "' + query + '"',
          'Try a different keyword, or clear the filter.');
      }
    } else if (kind === 'canvas') view = ListView_Board(filtered, onOpen);
    else if (kind === 'topic' || kind === 'markdown') view = ListView_List(filtered, onOpen);
    else if (kind === 'inspo') view = ListView_Bento(filtered, onOpen);
    else view = ListView_Table(filtered, onOpen);
    listSlot.appendChild(view);
    // Update count line
    if (countEl) countEl.textContent = (query ? filtered.length + ' of ' : '') + nOf(pages.length, 'page');
  }

  const countEl = h('span', null, nOf(pages.length, 'page'));
  const searchInput = h('input', {
    className: 'list-search',
    type: 'search',
    placeholder: 'filter ' + (meta ? meta.label.toLowerCase() : 'pages') + ' by title, body, tags…',
    value: query,
    onInput: (e) => { query = e.target.value; renderList(); },
    onKeyDown: (e) => {
      if (e.key === 'Escape') { e.target.value = ''; query = ''; renderList(); }
    },
  });

  append(wrap, PageHeader(title, null,
    meta ? meta.hint : (nOf(pages.length, 'page') + ' total'),
    h('button', { className: 'btn-primary', onClick: onCreate },
      '+ new ' + (meta ? meta.label.toLowerCase() : 'page'))));
  wrap.appendChild(h('div', { className: 'list-search-row' },
    searchInput, h('span', { className: 'list-search-count' }, countEl)));
  wrap.appendChild(listSlot);
  renderList();
  return wrap;
}

function V2PageView(pageId, onChange, onDeleted) {
  const wrap = h('div', { className: 'screen page-screen' });
  let page = null;
  let dirty = false;
  let saveTimer = null;
  // Body renderers can register cleanup callbacks (e.g. global event listeners
  // they attached). They're run before every re-layout and on screen unmount.
  let bodyTeardowns = [];
  const onBodyTeardown = (fn) => bodyTeardowns.push(fn);
  /* Which mentions are worth showing as chips.
     A mention chip means "a link to another page you can open". Two things
     were getting in that are neither, and both looked like broken links:

       · the page's OWN file — a board whose .canvas path is listed among its
         mentions, so "Binding Methods" showed a chip reading
         "Binding Methods.canvas" pointing at itself;
       · asset paths — five chips all reading "attachments/endpaper…",
         truncated to the point of being indistinguishable.

     This filters for DISPLAY only. The underlying array is untouched, so the
     file on disk keeps whatever Obsidian put there and nothing is lost on the
     next save. Returns {mn, i} so the remove button still splices the right
     index out of the real array. */
  const ASSET_RE = /^(attachments|assets)\//i;
  const visibleMentions = () => {
    const own = new Set();
    if (page.path) {
      own.add(String(page.path));
      own.add(String(page.path).split('/').pop());
      own.add(String(page.path).split('/').pop().replace(/\.[^.]+$/, ''));
    }
    if (page.title) own.add(String(page.title));
    return (page.mentions || [])
      .map((mn, i) => ({ mn, i }))
      .filter(({ mn }) => {
        const v = String(mn || '');
        if (!v) return false;
        if (ASSET_RE.test(v)) return false;
        if (/\.(png|jpe?g|gif|webp|svg|avif)$/i.test(v)) return false;
        // Compare the STEM too, not just the literal. A canvas page is two
        // files — `X.md` and `X.canvas` — so a board carried its own sibling
        // as a mention and drew a chip pointing at itself.
        const stem = v.split('/').pop().replace(/\.[^.]+$/, '');
        return !own.has(v) && !own.has(v.split('/').pop()) && !own.has(stem);
      });
  };

  const runBodyTeardowns = () => {
    bodyTeardowns.forEach((fn) => { try { fn(); } catch (_) {} });
    bodyTeardowns = [];
  };

  /* Save status. Every edit here autosaves 600ms after you stop typing, and
     until now said nothing at all — you were asked to trust that a file on
     your own disk had been rewritten, with no evidence. That is the sharpest
     bit of friction in the app: it is not slow or hard, it is silent.
     Three states, deliberately quiet — this reassures, it does not announce. */
  const setSaveState = (state, detail) => {
    const el = wrap.querySelector('.save-state');
    if (!el) return;
    el.setAttribute('data-state', state);
    // The reason goes in the title: the strip stays one word wide, and the
    // detail is one hover away rather than absent.
    if (detail) el.setAttribute('title', detail); else el.removeAttribute('title');
    clear(el);
    if (state === 'saving') {
      el.appendChild(h('span', { className: 'save-dot' }));
      el.appendChild(document.createTextNode('Saving…'));
    } else if (state === 'saved') {
      el.appendChild(icon('check'));
      el.appendChild(document.createTextNode('Saved'));
      // Fade back to nothing — a permanent "Saved" becomes furniture and
      // stops meaning anything.
      clearTimeout(el._t);
      el._t = setTimeout(() => { if (el.getAttribute('data-state') === 'saved') setSaveState('idle'); }, 2200);
    } else if (state === 'error') {
      clearTimeout(el._t);       // a failure stays put until the next attempt
      el.appendChild(icon('x'));
      el.appendChild(document.createTextNode('Not saved'));
    }
  };

  const queueSave = () => {
    if (!page) return;
    dirty = true;
    setSaveState('saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(commit, 600);
  };
  const commit = async () => {
    if (!page || !dirty) return;
    dirty = false;
    try {
      const patched = await savePage({
        title: page.title, body: page.body, tags: page.tags,
        mentions: page.mentions, kind: page.kind, slug: page.slug,
        meta: page.meta,
      });
      if (!patched) return;                 // refused; savePage() set the state
      page.updated = patched.updated;
      setSaveState('saved');
      if (patched.path && patched.path !== page.path) {
        // The file follows the title, so a save can move it. The deep link is
        // patched in place rather than re-laid out: the rename lands while the
        // user is still typing in the title field, and a re-render would take
        // the caret with it.
        page.path = patched.path;
        const obs = wrap.querySelector('.page-meta-obs');
        const href = obsidianUrl(page.path);
        if (obs && href) obs.href = href;
      }
      cacheSetPage(patched);  // keep page cache fresh so revisits are instant
      invalidatePageIndex();  // title may have changed → refresh mention labels
      onChange && onChange(patched);
    } catch (e) {
      console.warn('save failed', e);
      setSaveState('error');
    }
  };

  /* 6.3: conflict UI. put() re-reads `updated` from disk before writing and
     refuses when it moved, so an Obsidian edit is never silently clobbered.
     On overwrite the disk version is preserved as `<name> (conflict <date>).md`
     first — neither side's work is ever lost (SPEC §8). */
  async function savePage(patch, force) {
    const r = await SB.data().updatePage(page.id, force ? { ...patch, force: true } : patch);
    if (!r || r.ok !== false) return r;
    if (r.reason !== 'conflict') {
      // Every refusal that is not a conflict used to end here, as a
      // console.warn nobody has open. The edit stayed on screen, so the page
      // looked saved and was not — the worst failure mode a local-first app
      // has, because the only copy is the one you are about to close.
      console.warn('save refused:', r.reason, r.message || '');
      setSaveState('error', r.message || r.reason || 'The vault refused the write.');
      return null;
    }
    const overwrite = await confirmDialog({
      title: 'Changed on disk',
      body: 'This page was edited outside the app — probably in Obsidian — since you '
          + 'opened it. Reload to take the version on disk, or overwrite with yours. '
          + 'Overwriting keeps the disk version beside it as a conflict copy.',
      confirmLabel: 'overwrite',
      cancelLabel: 'reload',
      danger: true,
    });
    if (!overwrite) {
      cacheInvalidatePage(page.id);
      const fresh = await getPageCached(page.id);
      if (fresh) { page.body = fresh.body; page.title = fresh.title; page.updated = fresh.updated; }
      render();
      return null;
    }
    return savePage(patch, true);
  }

  // Upload an image asset; returns {path, url}. Shared by the flow editor
  // (node images) and the components table (row images).
  async function uploadAsset(file) {
    const j = await SB.data().writeAsset(file);
    if (j && j.ok === false) throw new Error('upload refused: ' + j.reason);
    return { path: j.path, url: j.url };
  }

  // ── Body renderers ────────────────────────────────────────────────────
  function renderDefaultBody() {
    return h('div', { className: 'page-body' },
      ProseEditor({
        getValue: () => page.body,
        setValue: (v) => { page.body = v; queueSave(); },
        placeholder: 'Write…  Markdown works, [[wikilinks]] resolve, #tags stick.',
      }));
  }

  /* ── Flow (kind: flow) — information-architecture editor ──────────
     A node graph of screens + edge cases, grouped into vertical
     section bands. Click a block → inspector (image, details, connect
     a screen, refer any personal/work page). Drag to reposition.
     Persists to page.meta.{sections,nodes,edges}; node screen/refs are
     mirrored into page.mentions so the global graph stays in sync. */
  // The flow / ia / component / token renderers lived here. They served the
  // work-mode kinds, which the migration dropped -- they are not in
  // KIND_ORDER, no page in the vault carries them, and PLAN.md's OUT OF
  // SCOPE forbids bringing them back. A hand-written `kind: flow` page now
  // falls through to renderDefaultBody, which reads it as prose.

  function renderTopicBody() {
    if (!page.meta) page.meta = {};
    if (!Array.isArray(page.meta.attachments)) page.meta.attachments = [];

    const wrap = h('div', { className: 'page-body topic-body' });

    // ── Attached materials section ──
    const attSec = h('div', { className: 'topic-att-sec' });

    // ── Per-type behaviour ────────────────────────────────────────
    // Each attachment kind has:
    //   - placeholder hint for the paste textarea
    //   - source label that appears on the card chip
    //   - rendering rule for the expanded preview
    // 'chat' subtypes are LLM-specific; they share the chat parser but the
    // source label differentiates them so the AI sees "(chatgpt)" vs "(claude)".
    const ATT_TYPES = {
      text: { label: 'text', hint: 'paste any plain notes here…' },
      markdown: { label: 'markdown', hint: 'paste markdown content — formatting will be rendered when expanded…' },
      link: { label: 'link', hint: 'paste a URL — the article body or video transcript will be fetched and pinned' },
      'chat:chatgpt': { label: 'chatgpt', hint: 'paste a ChatGPT conversation export…\n\nUser: …\nAssistant: …', source: 'chatgpt', kind: 'chat' },
      'chat:claude':  { label: 'claude',  hint: 'paste a Claude conversation export…\n\nHuman: …\nAssistant: …',  source: 'claude',  kind: 'chat' },
      'chat:gemini':  { label: 'gemini',  hint: 'paste a Gemini conversation export…',  source: 'gemini',  kind: 'chat' },
      'chat:notebooklm': { label: 'notebooklm', hint: 'paste from NotebookLM — sources or Q&A…', source: 'notebooklm', kind: 'chat' },
      'chat:other':   { label: 'chat',    hint: 'paste any AI conversation export here…', source: 'chat', kind: 'chat' },
    };

    function guessTitle(type, body) {
      const line = (body.split('\n').find((l) => l.trim()) || '').trim();
      return line.slice(0, 60) || ('attachment ' + new Date().toISOString().slice(0, 10));
    }
    // Parse a chat export into role-labeled turns. Matches the first colon
    // after a known role at the start of a line. Falls back to one big block.
    const _CHAT_ROLE_RE = /^(User|Assistant|Human|AI|System|ChatGPT|Claude|Gemini|Bot)\s*:\s*/i;
    function parseChatTurns(body) {
      const lines = String(body || '').split('\n');
      const turns = [];
      let cur = null;
      for (const line of lines) {
        const m = _CHAT_ROLE_RE.exec(line);
        if (m) {
          if (cur && cur.text.trim()) turns.push(cur);
          cur = { role: m[1].toLowerCase(), text: line.slice(m[0].length) };
        } else if (cur) {
          cur.text += '\n' + line;
        }
      }
      if (cur && cur.text.trim()) turns.push(cur);
      return turns;
    }
    function isUserRole(role) {
      return role === 'user' || role === 'human';
    }

    function pasteAttachmentModal(typeKey) {
      const spec = ATT_TYPES[typeKey] || ATT_TYPES.text;
      const titleI = h('input', { className: 'topic-att-titleI', placeholder: 'title (optional)' });
      const bodyT = h('textarea', { className: 'topic-att-bodyT', placeholder: spec.hint });
      const bg = h('div', { className: 'modal-bg' });
      const close = () => bg.remove();
      const save = () => {
        const body = bodyT.value.trim();
        if (!body) { toast('Paste or upload something first'); return; }
        const isChat = spec.kind === 'chat';
        page.meta.attachments.push({
          id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          type: isChat ? 'chat' : typeKey,
          title: titleI.value.trim() || guessTitle(typeKey, body),
          source: isChat ? spec.source : typeKey,
          body,
        });
        queueSave(); renderAttachments(); close();
      };

      // Markdown gets a file-picker too — read .md/.txt into the textarea
      const extraRow = h('div', { className: 'att-modal-extra' });
      if (typeKey === 'markdown' || typeKey === 'text') {
        const accept = typeKey === 'markdown' ? '.md,.markdown,.txt,text/*' : '.txt,text/*';
        const fileInput = h('input', { type: 'file', accept, style: { display: 'none' },
          onChange: (e) => {
            const f = e.target.files[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = () => {
              bodyT.value = String(reader.result || '');
              if (!titleI.value.trim()) titleI.value = f.name.replace(/\.(md|markdown|txt)$/i, '');
            };
            reader.readAsText(f);
            e.target.value = '';
          },
        });
        extraRow.appendChild(h('label', { className: 'side-action' },
          fileInput, '↑ upload ' + (typeKey === 'markdown' ? '.md / .txt' : '.txt')));
        extraRow.appendChild(h('span', { className: 'att-modal-extra-or' }, 'or paste below'));
      }

      /* A "paste a share URL and we'll fetch the transcript" field lived
         here. It could never work — a browser tab cannot read chatgpt.com —
         so it always failed, and it advertised an in-app LLM integration the
         contract forbids. Pasting the conversation text is the path that
         works, and it is the one the textarea below already offers. */

      bg.appendChild(h('div', { className: 'modal' },
        h('div', { className: 'modal-hd' },
          h('b', null, 'Attach ' + spec.label),
          h('button', { className: 'sb-twk-x', onClick: close }, '✕')),
        h('div', { className: 'modal-body' },
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
            titleI,
            extraRow.children.length ? extraRow : null,
            bodyT,
            h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } },
              h('button', { className: 'side-action', onClick: close }, 'cancel'),
              h('button', { className: 'btn-primary', onClick: save }, 'attach'))))));
      bg.addEventListener('click', (e) => { if (e.target === bg) close(); });
      document.body.appendChild(bg);
      // Escape had no handler at all here — the only way out was the mouse.
      asDialog(bg, { onEscape: close });
      titleI.focus();
    }

    // Special link flow — paste URL → fetch + show preview → save
    /* Attach a link.
       This used to offer a "↓ fetch" button that promised to pull the page's
       body and preview it. A browser page cannot fetch an arbitrary URL —
       CORS forbids it, which is exactly why the clipper extension exists —
       so the button always failed and then asked "No body was fetched. Save
       the link without context anyway?", a question raised by the app's own
       broken promise.

       So: no fetch. You paste the URL, you type why it matters, and the
       clipper fills in the body when you capture through it. */
    function linkAttachmentModal() {
      const urlI = h('input', { className: 'set-input', placeholder: 'https://…', type: 'url' });
      const titleI = h('input', { className: 'set-input', placeholder: 'What is this? (optional)' });
      const noteT = h('textarea', {
        className: 'page-body-ta', placeholder: 'Why it matters, what to remember…',
        style: { minHeight: '110px' },
      });
      const bg = h('div', { className: 'modal-bg' });
      const close = () => bg.remove();
      const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };

      function save() {
        const url = urlI.value.trim();
        if (!url) { urlI.focus(); return; }
        page.meta.attachments.push({
          id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          type: 'link',
          title: titleI.value.trim() || url,
          source: 'link',
          body: noteT.value.trim(),
          meta: { url },
        });
        queueSave(); renderAttachments(); close();
      }

      bg.appendChild(h('div', { className: 'modal confirm-modal' },
        h('div', { className: 'modal-hd' },
          h('b', null, 'Attach a link'),
          h('button', { className: 'sb-twk-x', onClick: close }, '\u2715')),
        h('div', { className: 'modal-body' },
          h('div', { className: 'att-link-form' },
            h('label', { className: 'am-lbl' }, 'URL'), urlI,
            h('label', { className: 'am-lbl' }, 'Title'), titleI,
            h('label', { className: 'am-lbl' }, 'Note'), noteT,
            h('p', { className: 'att-link-hint' },
              'The page body is not downloaded — a browser tab cannot read another site. ',
              'Capture through the clipper extension to bring the text in with it.'),
            h('div', { className: 'att-link-actions' },
              h('button', { className: 'btn', onClick: close }, 'Cancel'),
              h('button', { className: 'btn-create', onClick: save }, 'Attach'))))));
      bg.addEventListener('click', (e) => { if (e.target === bg) close(); });
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(bg);
      asDialog(bg);
      urlI.focus();
    }

    // Dropdown menu for "+ chat" — picks a specific LLM source
    function openChatPicker(anchorBtn) {
      // Close any existing
      document.querySelectorAll('.att-chat-menu').forEach((n) => n.remove());
      const menu = h('div', { className: 'att-chat-menu' });
      // Plain material first — it is what most attachments are — then the
      // conversation exports, which are the specialised case.
      [['text', 'Text'], ['markdown', 'Markdown']].forEach(([k, label]) => {
        menu.appendChild(h('button', {
          className: 'att-chat-menu-item',
          onClick: () => { menu.remove(); pasteAttachmentModal(k); },
        }, label));
      });
      menu.appendChild(h('button', {
        className: 'att-chat-menu-item',
        onClick: () => { menu.remove(); linkAttachmentModal(); },
      }, 'Link'));
      menu.appendChild(h('div', { className: 'att-chat-menu-sep' }, 'Conversation export'));
      const opts = [
        ['chat:chatgpt', 'ChatGPT'],
        ['chat:claude', 'Claude'],
        ['chat:gemini', 'Gemini'],
        ['chat:notebooklm', 'NotebookLM'],
        ['chat:other', 'Other AI'],
      ];
      opts.forEach(([k, label]) => {
        menu.appendChild(h('button', {
          className: 'att-chat-menu-item',
          onClick: () => { menu.remove(); pasteAttachmentModal(k); },
        }, label));
      });
      /* Position AFTER the items exist — measuring an empty menu gave a
         height of zero and the flip never triggered. Flips up when there is
         no room below and clamps to the right edge: the tray sits at the
         bottom of a topic, so opening downward put the menu under the demo
         banner, off the viewport, with its options unreachable. */
      menu.style.position = 'fixed';
      menu.style.visibility = 'hidden';
      document.body.appendChild(menu);
      const rect = anchorBtn.getBoundingClientRect();
      const mh = menu.offsetHeight, mw = menu.offsetWidth;
      const roomBelow = window.innerHeight - rect.bottom;
      menu.style.top = (roomBelow < mh + 16 && rect.top > mh + 16)
        ? (rect.top - mh - 4) + 'px'
        : (rect.bottom + 4) + 'px';
      menu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - mw - 8)) + 'px';
      menu.style.visibility = '';

      // Click anywhere outside closes it
      setTimeout(() => {
        const off = (e) => {
          if (menu.contains(e.target) || anchorBtn.contains(e.target)) return;
          menu.remove();
          document.removeEventListener('click', off, true);
        };
        document.addEventListener('click', off, true);
      }, 0);
    }

    function renderAttachments() {
      clear(attSec);
      /* Four buttons — "+ text + markdown + link + chat" — for what is one
         action with a type. And the whole tray sat above the description
         with a "· 0" counter on a fresh topic, so a page whose purpose is
         thinking opened with an empty filing cabinet at the top.

         One Attach control, type chosen inside. When there is nothing
         attached the tray is a single quiet line, not a section. */
      const n = page.meta.attachments.length;
      const attachBtn = h('button', { className: 'btn topic-att-add' },
        icon('plus'), 'Attach');
      attachBtn.addEventListener('click', () => openChatPicker(attachBtn));

      attSec.appendChild(h('div', { className: 'topic-att-hd' },
        h('span', null, n ? 'Attached materials' : 'Reference material'),
        n ? h('span', { className: 'topic-att-n' }, String(n)) : null,
        h('div', { className: 'topic-att-actions' }, attachBtn)));

      if (!n) {
        attSec.appendChild(h('div', { className: 'topic-att-empty' },
          'Paste notes, a URL, or an exported conversation to keep beside this topic.'));
        return;
      }

      const list = h('div', { className: 'topic-att-list' });
      page.meta.attachments.forEach((att, idx) => {
        const card = h('div', { className: 'topic-att-card', 'data-source': att.source || att.type });
        const body = att.body || '';
        let expanded = false;
        const previewN = (s) => (s || '').slice(0, 500) + ((s || '').length > 500 ? '…' : '');
        const preview = h('div', { className: 'topic-att-preview' });

        function renderPreview() {
          clear(preview);
          if (att.type === 'link') {
            // Always render the OG card if we have one — it's the "preview"
            const ogm = att.meta || {};
            const og = ogm.og || null;
            if (og && og.image) preview.appendChild(h('img', {
              className: 'topic-att-link-img', src: og.image, loading: 'lazy', alt: '' }));
            preview.appendChild(h('div', { className: 'topic-att-link-meta' },
              h('a', { className: 'topic-att-link-title', href: ogm.url || '#', target: '_blank' },
                att.title || (og && og.title) || ogm.url || 'link'),
              og && og.description ? h('div', { className: 'topic-att-link-desc' }, og.description.slice(0, 200)) : null,
              h('div', { className: 'topic-att-link-host' }, (ogm.url || '').replace(/^https?:\/\//, '').slice(0, 60))));
            if (expanded && body) {
              preview.appendChild(h('pre', { className: 'topic-att-preview-text' }, body));
            }
            return;
          }
          if (att.type === 'markdown') {
            const md = h('div', { className: 'md-body topic-att-md' });
            renderMarkdown(expanded ? body : previewN(body)).forEach((n) => md.appendChild(n));
            preview.appendChild(md);
            return;
          }
          if (att.type === 'chat') {
            const turns = parseChatTurns(body);
            if (!turns.length) {
              preview.appendChild(h('pre', { className: 'topic-att-preview-text' }, expanded ? body : previewN(body)));
              return;
            }
            const wrapEl = h('div', { className: 'topic-att-chat' });
            const shown = expanded ? turns : turns.slice(0, 4);
            shown.forEach((t) => {
              wrapEl.appendChild(h('div', {
                className: 'topic-att-chat-turn topic-att-chat-' + (isUserRole(t.role) ? 'user' : 'asst'),
              },
                h('div', { className: 'topic-att-chat-r' }, t.role),
                h('div', { className: 'topic-att-chat-c' }, t.text.trim())));
            });
            if (!expanded && turns.length > 4) {
              wrapEl.appendChild(h('div', { className: 'topic-att-chat-more' }, '+ ' + (turns.length - 4) + ' more turn(s)'));
            }
            preview.appendChild(wrapEl);
            return;
          }
          // text fallback
          preview.appendChild(h('pre', { className: 'topic-att-preview-text' }, expanded ? body : previewN(body)));
        }

        const head = h('div', { className: 'topic-att-head' },
          h('span', { className: 'topic-att-type' }, att.source || att.type),
          h('span', { className: 'topic-att-title' }, att.title || '(untitled)'),
          h('button', { className: 'topic-att-toggle', onClick: (e) => {
            e.stopPropagation();
            expanded = !expanded;
            card.classList.toggle('expanded', expanded);
            renderPreview();
            const t = head.querySelector('.topic-att-toggle');
            if (t) t.textContent = expanded ? '−' : '+';
          } }, '+'),
          h('button', { className: 'topic-att-del', onClick: async (e) => {
            e.stopPropagation();
            if (!await confirmDialog({
              title: 'Remove this attachment?',
              confirmLabel: '× remove', danger: true,
            })) return;
            page.meta.attachments.splice(idx, 1); queueSave(); renderAttachments();
          } }, '×'));
        card.appendChild(head);
        card.appendChild(preview);
        renderPreview();
        list.appendChild(card);
      });
      attSec.appendChild(list);
    }

    renderAttachments();

    // ── Topic description (collapsible, secondary) ──
    const descSec = h('div', { className: 'topic-desc-sec expanded' });

    descSec.appendChild(ProseEditor({
      getValue: () => page.body,
      setValue: (v) => { page.body = v; queueSave(); },
      placeholder: 'What are you working out here?\n\nMarkdown, [[wikilinks]] and #tags all work.',
      minHeight: 360,
    }));

    /* Writing first, material second. The tray used to come first, so every
       topic opened on an empty filing cabinet and you scrolled past your own
       storage to reach your own thinking. Attachments are what a topic is
       BUILT FROM; the topic is what it is FOR. */
    wrap.appendChild(descSec);
    wrap.appendChild(attSec);

    return { body: wrap };
  }

  /* 6.7 / 6.19: a board page still has a body, and after task 1.24 that body is
     where its `## Thread`, `## Board contents` and captions live. The board is
     the point of the screen, so the prose goes underneath it rather than
     competing with it — but it is rendered, not hidden. */
  function withBoardBody(boardEl) {
    const text = String(page.body || '').trim();
    if (!text) return boardEl;
    const wrap = h('div', { className: 'board-with-body' });
    wrap.appendChild(boardEl);
    const md = h('div', { className: 'md-rendered board-body-md' });
    try {
      md.innerHTML = SB.data().renderHtml(page.body).html;
      decorateMentions(md);
      decorateHashtags(md);
    } catch (e) { md.textContent = page.body; }
    wrap.appendChild(md);
    return wrap;
  }

  // ── Excalidraw ────────────────────────────────────────────────────────
  // The editor is ~8MB of vendored bundle, so it is imported the first time a
  // drawing is opened and never on the critical path. A vault with no drawings
  // pays nothing.
  let excalidrawModule = null;
  async function loadExcalidraw() {
    if (excalidrawModule) return excalidrawModule;
    /* Fonts resolve relative to this, and it has to be ABSOLUTE. The bundle
       feeds it to `new URL(file, base)`, and a URL base must be absolute — a
       bare 'vendor/excalidraw/' threw "Invalid base URL" once per text
       element, so every drawing rendered its boxes and arrows and none of its
       words. Derived from the document, so it still works under a subpath and
       still hardcodes nothing. */
    window.EXCALIDRAW_ASSET_PATH = new URL('vendor/excalidraw/', document.baseURI).href;
    if (!document.querySelector('link[data-excalidraw]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'vendor/excalidraw/excalidraw.css';
      link.setAttribute('data-excalidraw', '1');
      document.head.appendChild(link);
    }
    excalidrawModule = await import('./vendor/excalidraw/excalidraw.js');
    return excalidrawModule;
  }

  function renderExcalidrawBody() {
    const ex = (page.meta && page.meta.excalidraw) || null;
    const wrap = h('div', { className: 'page-body excalidraw-body' });

    if (ex && ex.error && !ex.scene) {
      // A drawing we cannot decode must not look like an empty one — offering a
      // blank canvas here would invite the user to draw over data still on disk.
      wrap.appendChild(h('div', { className: 'excalidraw-broken' },
        h('strong', null, 'This drawing could not be read.'),
        h('p', null, ex.error),
        h('p', null, 'The file has been left exactly as it is. Open it in Obsidian to recover it.')));
      return wrap;
    }

    const host = h('div', { className: 'excalidraw-host' });
    wrap.appendChild(host);
    wrap.appendChild(h('div', { className: 'excalidraw-status' }, 'loading the editor…'));
    const status = wrap.querySelector('.excalidraw-status');

    let handle = null;
    let savedVersion = null;
    let timer = null;

    // onChange fires on every pointer move. Writing per event would fill
    // `.history` with hundreds of near-identical snapshots and hammer the disk,
    // so a save is debounced and skipped entirely when the scene version is
    // unchanged (a pan or a selection is not an edit).
    const SAVE_AFTER_MS = 1200;
    async function persist() {
      if (!handle) return;
      const version = handle.version();
      if (version === savedVersion) return;
      const scene = handle.getScene();
      if (!scene) return;
      status.textContent = 'saving…';
      const md = window.SB_EXCALIDRAW.serialize(scene, {
        compressed: true,
        backOfNote: (ex && ex.backOfNote) || '',
        frontmatter: (ex && ex.frontmatter) || null,
        elementLinks: (ex && ex.elementLinks) || [],
        embeddedFiles: (ex && ex.embeddedFiles) || [],
      });
      // `body` is the whole plugin block; savePage routes it through the same
      // conflict + `.history` machinery every other page uses.
      const r = await savePage({ body: bodyOfExcalidrawFile(md) });
      if (r === null) { status.textContent = 'not saved'; return; }
      savedVersion = version;
      status.textContent = 'saved';
    }
    function queue() {
      clearTimeout(timer);
      status.textContent = 'unsaved changes…';
      timer = setTimeout(persist, SAVE_AFTER_MS);
    }

    /* A scene that never recorded where it was looking opens at the scene
       origin — which is the top-left corner of the viewport, under the
       floating toolbar. A drawing saved from this app or from the Obsidian
       plugin carries scrollX/scrollY and is left exactly as it was; one that
       does not gets framed, because the alternative is opening a drawing
       with its title hidden behind a button bar.
       (`initialData.scrollToContent` would do this, but the vendored mount
       wrapper runs restore() first and restore() drops the flag.) */
    const TOOLBAR_CLEARANCE = 88;
    function framed(scene) {
      if (!scene || !Array.isArray(scene.elements) || !scene.elements.length) return scene;
      const st = scene.appState || {};
      if (st.scrollX != null || st.scrollY != null) return scene;
      let minX = Infinity, minY = Infinity;
      for (const el of scene.elements) {
        if (!el || el.isDeleted) continue;
        if (typeof el.x === 'number') minX = Math.min(minX, el.x);
        if (typeof el.y === 'number') minY = Math.min(minY, el.y);
      }
      if (!isFinite(minX) || !isFinite(minY)) return scene;
      return { ...scene, appState: { ...st, scrollX: -minX + 32, scrollY: -minY + TOOLBAR_CLEARANCE } };
    }

    loadExcalidraw().then((mod) => {
      status.textContent = '';
      handle = mod.mountExcalidraw(host, {
        // Sepia is a light mode. Comparing against the string 'light' put the
        // editor in dark chrome on a paper-coloured page.
        theme: themeFamily(),
        initialData: framed((ex && ex.scene) || null),
        onReady: (hd) => { savedVersion = hd.version(); },
        onChange: queue,
      });
      // A drawing left with pending edits must not vanish on navigation.
      window.addEventListener('beforeunload', persist);
    }).catch((e) => {
      status.textContent = '';
      wrap.appendChild(h('div', { className: 'excalidraw-broken' },
        h('strong', null, 'The drawing editor failed to load.'),
        h('p', null, String(e && e.message || e))));
    });

    return wrap;
  }

  // serialize() returns a whole file; the vault writes frontmatter separately,
  // so hand back only what belongs in the body.
  function bodyOfExcalidrawFile(md) {
    return String(md).replace(/^---\n[\s\S]*?\n---\n/, '');
  }

  /**
   * A `.canvas` board, rendered read-only.
   *
   * JSON Canvas is Obsidian's format and Obsidian owns it. This view draws the
   * nodes and edges it finds there and never writes geometry back — not a gap
   * to be closed later, but the reason a board is safe to open here at all.
   *
   * The editing half of this renderer (item drag, resize, pen + eraser strokes,
   * "+ text" / "+ link" / "+ image", drop, paste, ⌘Z) has been REMOVED rather
   * than disabled. It used to sit behind a `READ_ONLY` flag that only hid the
   * toolbar: the handlers stayed live on the viewport, so an Apple Pencil
   * stroke, a paste, or a ⌘Z still reached `queueSave()` and wrote a page whose
   * geometry had nowhere to go. Half-removed editing is worse than either
   * choice — it is how the app came to write a YAML header over a user's board.
   *
   * Anything the app itself writes is a drawing, and drawings are Excalidraw.
   * One editor, one format, one owner per scene.
   */
  function renderCanvasBody() {
    if (!page.meta) page.meta = {};
    // Both come from the `.canvas` file via data.js; absent means "not a board
    // yet", which renders as an empty surface rather than an error.
    const items = Array.isArray(page.meta.layout) ? page.meta.layout : [];
    const edges = Array.isArray(page.meta.edges) ? page.meta.edges : [];

    const surface = h('div', { className: 'canvas-surface' });
    const viewport = h('div', { className: 'canvas-viewport board-ro' });
    const obsHref = obsidianUrl(page.path);
    viewport.appendChild(h('div', { className: 'board-readonly' },
      h('span', null, 'Boards are read-only here — arrange them in Obsidian.'),
      obsHref ? h('a', { href: obsHref }, 'open in Obsidian ↗') : null));

    // ── Edges layer ──────────────────────────────────────────────────────
    // Sits below the cards, inside `surface` so it inherits pan + zoom for free.
    //
    // The span and the matching negative origin are both load-bearing. This
    // layer used to be `width=0 height=0` with `overflow: visible`, on the
    // theory that an outer <svg> would then paint outside its own viewport —
    // it does not, so every connection computed here was drawn into a zero-size
    // box and clipped away. The geometry was right and nothing ever appeared.
    // A viewBox centred on the origin gives the layer real extent while keeping
    // world coordinates one-to-one, and JSON Canvas coordinates are routinely
    // negative, so the origin has to sit in the middle rather than the corner.
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const EDGE_SPAN = 20000;          // half-extent, in world units
    const edgesSvg = document.createElementNS(SVG_NS, 'svg');
    edgesSvg.setAttribute('class', 'canvas-edges');
    edgesSvg.setAttribute('width', String(EDGE_SPAN * 2));
    edgesSvg.setAttribute('height', String(EDGE_SPAN * 2));
    edgesSvg.setAttribute('viewBox',
      `${-EDGE_SPAN} ${-EDGE_SPAN} ${EDGE_SPAN * 2} ${EDGE_SPAN * 2}`);
    edgesSvg.style.left = `${-EDGE_SPAN}px`;
    edgesSvg.style.top = `${-EDGE_SPAN}px`;
    const edgesG = document.createElementNS(SVG_NS, 'g');
    edgesSvg.appendChild(edgesG);
    surface.appendChild(edgesSvg);

    // JSON Canvas colors are either a hex string or a preset "1".."6".
    const EDGE_PRESET = {
      '1': '#e5484d', '2': '#f76b15', '3': '#ffb224',
      '4': '#30a46c', '5': '#00a2c7', '6': '#8e4ec6',
    };
    function edgeColor(c) {
      if (!c) return 'var(--muted)';
      return EDGE_PRESET[String(c)] || String(c);
    }

    // The curve math lives in data.js as a pure function so it is testable in
    // Node; everything here is just turning it into SVG.
    function renderAllEdges() {
      while (edgesG.firstChild) edgesG.removeChild(edgesG.firstChild);
      const geom = window.SB_EDGE_GEOM;
      if (typeof geom !== 'function') return;
      const boxes = new Map();
      for (const it of items) {
        boxes.set(it.id, { x: it.x || 0, y: it.y || 0, w: it.w || 240, h: it.h || 220 });
      }
      for (const e of edges) {
        const g = geom(e, boxes.get(e.fromNode), boxes.get(e.toNode));
        if (!g) continue;               // an endpoint that isn't on the board
        const color = edgeColor(e.color);

        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', g.d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('stroke-linecap', 'round');
        // Set via style, not the attribute: a CSS custom property is only
        // guaranteed to resolve as a style declaration.
        path.style.stroke = color;
        edgesG.appendChild(path);

        // Arrowheads. The tip sits on the anchor and the base steps back along
        // the outward normal, so it lines up with the curve's tangent.
        const HEAD = 9;
        for (const p of g.arrows) {
          const bx = p.x + p.nx * HEAD, by = p.y + p.ny * HEAD;
          const px = -p.ny, py = p.nx;          // perpendicular, for the base
          const tri = document.createElementNS(SVG_NS, 'polygon');
          tri.setAttribute('points', [
            `${p.x},${p.y}`,
            `${bx + px * HEAD * 0.45},${by + py * HEAD * 0.45}`,
            `${bx - px * HEAD * 0.45},${by - py * HEAD * 0.45}`,
          ].join(' '));
          tri.style.fill = color;
          edgesG.appendChild(tri);
        }

        if (g.label) {
          const text = document.createElementNS(SVG_NS, 'text');
          text.setAttribute('x', g.label.x);
          text.setAttribute('y', g.label.y);
          text.setAttribute('text-anchor', 'middle');
          text.setAttribute('dominant-baseline', 'middle');
          text.setAttribute('class', 'canvas-edge-label');
          text.textContent = g.label.text;
          edgesG.appendChild(text);
        }
      }
    }

    // ── Pan + zoom ────────────────────────────────────────────────────────
    // The surface is transformed via translate + scale; the viewport stays
    // static (no scrollbars). Item coords are world space, never touched by
    // zoom. Screen → world is (screen - pan) / zoom.
    let zoomReadout;
    let panX = 0, panY = 0, zoom = 1;
    const ZOOM_MIN = 0.2, ZOOM_MAX = 3;
    function applyTransform() {
      surface.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
      if (zoomReadout) zoomReadout.textContent = Math.round(zoom * 100) + '%';
    }
    function zoomAt(screenX, screenY, factor) {
      const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * factor));
      if (next === zoom) return;
      const rect = viewport.getBoundingClientRect();   // keep the point stable
      const mx = screenX - rect.left, my = screenY - rect.top;
      panX = mx - (mx - panX) * (next / zoom);
      panY = my - (my - panY) * (next / zoom);
      zoom = next;
      applyTransform();
    }
    function resetView() { panX = 0; panY = 0; zoom = 1; applyTransform(); }
    function fitView() {
      if (!items.length) { resetView(); return; }
      const W = viewport.clientWidth, H = viewport.clientHeight;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const it of items) {
        const x = it.x || 0, y = it.y || 0;
        const w = it.w || 240, ht = it.h || 220;
        if (x < minX) minX = x; if (y < minY) minY = y;
        if (x + w > maxX) maxX = x + w; if (y + ht > maxY) maxY = y + ht;
      }
      const bw = maxX - minX, bh = maxY - minY;
      const pad = 60;
      zoom = Math.max(ZOOM_MIN, Math.min(1.2, Math.min((W - pad * 2) / bw, (H - pad * 2) / bh)));
      panX = (W - bw * zoom) / 2 - minX * zoom;
      panY = (H - bh * zoom) / 2 - minY * zoom;
      applyTransform();
    }

    // Wheel: ⌘/Ctrl+wheel zooms, plain wheel pans. A card that overflows gets
    // to scroll itself first.
    viewport.addEventListener('wheel', (e) => {
      const scrollable = e.target && e.target.closest && e.target.closest('.canvas-item-body');
      if (scrollable && !(e.ctrlKey || e.metaKey)
          && scrollable.scrollHeight > scrollable.clientHeight) return;
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 0.92 : 1.08);
      } else {
        panX -= e.deltaX; panY -= e.deltaY;
        applyTransform();
      }
    }, { passive: false });

    // ── Pointer: pan with one pointer, pinch-zoom with two ───────────────
    // Every pointer type pans. There is no draw mode and no drag mode, so a
    // stylus behaves exactly like a finger and cannot start an edit the board
    // has no way to keep.
    const touchPoints = new Map();      // pointerId → {x, y}
    let pinchState = null;

    function startPinch() {
      const pts = Array.from(touchPoints.values());
      pinchState = {
        startDist: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y),
        startZoom: zoom,
        startCenterX: (pts[0].x + pts[1].x) / 2,
        startCenterY: (pts[0].y + pts[1].y) / 2,
        startPanX: panX, startPanY: panY,
      };
    }
    function updatePinch() {
      if (!pinchState || touchPoints.size < 2) return;
      const pts = Array.from(touchPoints.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const cx = (pts[0].x + pts[1].x) / 2, cy = (pts[0].y + pts[1].y) / 2;
      const newZoom = Math.max(ZOOM_MIN,
        Math.min(ZOOM_MAX, pinchState.startZoom * (dist / pinchState.startDist)));
      const rect = viewport.getBoundingClientRect();
      const mx = pinchState.startCenterX - rect.left;
      const my = pinchState.startCenterY - rect.top;
      // Zoom anchored at the original centroid, plus drag by the centroid delta.
      panX = mx - (mx - pinchState.startPanX) * (newZoom / pinchState.startZoom)
             + (cx - pinchState.startCenterX);
      panY = my - (my - pinchState.startPanY) * (newZoom / pinchState.startZoom)
             + (cy - pinchState.startCenterY);
      zoom = newZoom;
      applyTransform();
    }
    function startPanning(e) {
      const sx = e.clientX, sy = e.clientY;
      const fromX = panX, fromY = panY;
      try { viewport.setPointerCapture(e.pointerId); } catch (_) {}
      viewport.classList.add('panning');
      const mv = (ev) => {
        panX = fromX + (ev.clientX - sx);
        panY = fromY + (ev.clientY - sy);
        applyTransform();
      };
      const up = () => {
        viewport.classList.remove('panning');
        viewport.removeEventListener('pointermove', mv);
        viewport.removeEventListener('pointerup', up);
        viewport.removeEventListener('pointercancel', up);
      };
      viewport.addEventListener('pointermove', mv);
      viewport.addEventListener('pointerup', up);
      viewport.addEventListener('pointercancel', up);
    }

    viewport.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('.canvas-toolbar')) return;
      // Anything that acts on a click has to be left alone: starting a pan
      // calls setPointerCapture, which retargets the pointerup and means the
      // browser fires `click` on the viewport instead of the card.
      if (e.target.closest('a, .canvas-item-clickable')) return;
      // Text inside a card stays selectable for the same reason — a captured
      // pointer turns every attempt to copy a line into a drag.
      if (e.pointerType === 'mouse' && e.target.closest('.canvas-item-body')) return;
      if (e.pointerType === 'touch') {
        touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touchPoints.size >= 2) {
          viewport.classList.remove('panning');   // abandon the 1-finger pan
          startPinch();
          e.preventDefault();
          return;
        }
      }
      startPanning(e);
    });

    // Pinch tracking on `document`: listening on the viewport misses moves
    // that stray between the two fingers.
    const onDocMove = (e) => {
      if (e.pointerType !== 'touch' || !touchPoints.has(e.pointerId)) return;
      touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinchState) updatePinch();
    };
    const releaseTouch = (e) => {
      if (e.pointerType !== 'touch' || !touchPoints.has(e.pointerId)) return;
      touchPoints.delete(e.pointerId);
      if (touchPoints.size < 2) pinchState = null;
    };
    document.addEventListener('pointermove', onDocMove);
    document.addEventListener('pointerup', releaseTouch);
    document.addEventListener('pointercancel', releaseTouch);
    if (typeof onBodyTeardown === 'function') {
      onBodyTeardown(() => {
        document.removeEventListener('pointermove', onDocMove);
        document.removeEventListener('pointerup', releaseTouch);
        document.removeEventListener('pointercancel', releaseTouch);
      });
    }

    // ── Cards ─────────────────────────────────────────────────────────────
    function buildItem(item) {
      const style = {
        left: (item.x || 0) + 'px',
        top: (item.y || 0) + 'px',
        width: (item.w || 240) + 'px',
      };
      if (item.h && item.h > 60) style.height = item.h + 'px';
      const el = h('div', {
        className: `canvas-item canvas-item-${item.type}`,
        style, 'data-id': item.id,
      });

      if (item.type === 'text') {
        // JSON Canvas text nodes hold markdown, so render it as markdown —
        // the old editor put the raw source in a textarea, which showed
        // people their own `##` and `[[links]]` as literal characters.
        const body = h('div', { className: 'canvas-item-body md-rendered' });
        try {
          body.innerHTML = SB.data().renderHtml(item.text || '').html;
          decorateMentions(body);
          decorateHashtags(body);
        } catch (_) { body.textContent = item.text || ''; }
        el.appendChild(body);
      } else if (item.type === 'image') {
        if (item.asset) {
          el.appendChild(vaultImage(item.asset,
            { className: 'canvas-item-image', alt: item.caption || '' }));
        }
        if (item.caption) {
          el.appendChild(h('div', { className: 'canvas-item-caption' }, item.caption));
        }
      } else if (item.type === 'link') {
        const url = item.url || '';
        el.appendChild(h('a', {
          className: 'canvas-item-link', href: url, target: '_blank', rel: 'noreferrer',
        }, item.title || url));
        // No preview fetch: a static page cannot request an arbitrary origin,
        // and pretending otherwise is what left "fetching preview…" on screen
        // forever. The URL itself is the preview.
        let host = '';
        try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (_) {}
        if (host) el.appendChild(h('div', { className: 'canvas-item-host' }, host));
      } else if (item.type === 'file') {
        // A vault file pinned to the board — usually a note. Show it as the
        // page it is and open it in the app, so a board works as an index.
        const name = String(item.file || '').split('/').pop().replace(/\.md$/i, '');
        // Was a `§` glyph plus the full path printed underneath. The kind
        // icon says more than the glyph did, and the path is a tooltip —
        // a board is an index of pages, so it should read as page titles.
        const hitPage = pageByPath(item.file);
        el.setAttribute('title', item.file);
        el.appendChild(h('div', { className: 'canvas-item-file' },
          h('span', { className: 'canvas-item-file-glyph' },
            icon(metaForPage(hitPage || { kind: 'note' }).icon || 'file-text')),
          h('span', { className: 'canvas-item-file-name' }, name || item.file)));
        el.classList.add('canvas-item-clickable');
        el.addEventListener('click', () => {
          const hit = pageByPath(item.file);
          if (hit) openPage(hit.id);
        });
      } else if (item.type === 'group') {
        // A frame drawn around other nodes. Rendered as a labelled outline so
        // the grouping Obsidian shows survives the trip here.
        el.appendChild(h('div', { className: 'canvas-item-grouplabel' }, item.label || ''));
      } else {
        // A node type JSON Canvas gained after this was written. Say so
        // plainly rather than drawing an empty card.
        el.appendChild(h('div', { className: 'canvas-item-unknown' },
          item.type || 'unknown', ' node — open in Obsidian'));
      }
      return el;
    }

    // ── Toolbar ───────────────────────────────────────────────────────────
    // View controls only. Nothing here can change the board.
    const toolbarKids = [];
    toolbarKids.push(h('div', { className: 'canvas-toolbar-spacer' }));
    toolbarKids.push(h('button', {
      className: 'canvas-expand-btn',
      title: 'expand canvas to full screen (hides app + browser chrome; Esc to exit)',
      onClick: async () => {
        const wantFs = !app.canvasFullscreen;
        // The body class is the source of truth for layout; the real OS
        // fullscreen request is best-effort on top (browsers gate it to
        // user-gesture handlers, and not every engine allows it on any element).
        app.canvasFullscreen = wantFs;
        document.body.classList.toggle('canvas-fullscreen', wantFs);
        try {
          if (wantFs) {
            const r = document.documentElement;
            const req = r.requestFullscreen || r.webkitRequestFullscreen || r.mozRequestFullScreen;
            if (req) await req.call(r);
          } else if (document.fullscreenElement || document.webkitFullscreenElement) {
            const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
            if (exit) await exit.call(document);
          }
        } catch (_) { /* denied or unsupported — in-page fullscreen still works */ }
        setTimeout(() => { applyTransform(); }, 80);
      },
    }, '⛶ expand'));
    const centerOf = () => {
      const r = viewport.getBoundingClientRect();
      return [r.left + viewport.clientWidth / 2, r.top + viewport.clientHeight / 2];
    };
    toolbarKids.push(h('div', { className: 'canvas-zoom-controls' },
      h('button', { className: 'canvas-zoom-btn', title: 'zoom out',
        onClick: () => zoomAt(...centerOf(), 0.85) }, '−'),
      (zoomReadout = h('button', { className: 'canvas-zoom-readout',
        title: 'click to reset to 100%', onClick: () => resetView() }, '100%')),
      h('button', { className: 'canvas-zoom-btn', title: 'zoom in',
        onClick: () => zoomAt(...centerOf(), 1.15) }, '+'),
      h('button', { className: 'canvas-zoom-btn', title: 'fit all items',
        onClick: () => fitView() }, 'fit')));
    toolbarKids.push(h('div', { className: 'canvas-toolbar-hint' },
      nOf(items.length, 'item'), ' · ',
      edges.length ? edges.length + ' connections · ' : '',
      'drag to pan · ⌘+scroll to zoom'));

    items.forEach((it) => surface.appendChild(buildItem(it)));
    renderAllEdges();
    viewport.appendChild(h('div', { className: 'canvas-toolbar' }, ...toolbarKids));
    viewport.appendChild(surface);

    // Leaving the page must not strand the app in fullscreen.
    if (typeof onBodyTeardown === 'function') {
      onBodyTeardown(() => {
        if (app.canvasFullscreen) {
          app.canvasFullscreen = false;
          document.body.classList.remove('canvas-fullscreen');
        }
      });
    }

    // Initial view: fit the board if there is one, otherwise sit at the origin.
    setTimeout(() => {
      applyTransform();
      if (items.length) fitView();
    }, 0);

    return viewport;
  }
  // Inspo is a bento wall now, not a board: items live in the markdown body
  // (image, caption, #tags, source url; `##` headings group them), so Obsidian
  // renders the same page as images with captions. Geometry is gone entirely —
  // a reference wall is about the pictures, not their coordinates.
  function renderInspoBody() {
    const I = window.SB_INSPO;
    if (!I) return renderDefaultBody();          // bridge too old — degrade, don't break
    const model = I.parse(page.body || '');
    let activeTag = null;
    let editing = false;   // the wall opens in view mode; see card()

    const wrap = h('div', { className: 'page-body inspo-bento' });
    const toolbar = h('div', { className: 'bento-toolbar' });
    const gridWrap = h('div', { className: 'bento-groups' });
    wrap.append(toolbar, gridWrap);

    function save() {
      page.body = I.serialize(model);
      queueSave();
    }

    function allGroupNames() {
      return model.groups.map((g) => g.name);
    }

    function renderToolbar() {
      clear(toolbar);
      // Tag filter strip — every tag on the page; click to filter, click again
      // to clear.
      /* This is a FILTER, not a list of tags — but it rendered as lime
         chips directly below the page's own lime tag chips, so the screen
         opened with two near-identical rows and no clue that one of them
         did something. Toggle-shaped, labelled, and only when there is
         enough on the wall for filtering to be worth the row. */
      const tags = I.tags(model);
      const itemCount = model.groups.reduce((n, g) => n + g.items.length, 0);
      if (tags.length > 1 && itemCount > 3) {
        toolbar.appendChild(h('div', { className: 'bento-tagstrip' },
          h('span', { className: 'bento-filter-l' }, icon('search'), 'Filter'),
          tags.map((t) => h('button', {
            className: 'bento-tag' + (activeTag === t ? ' on' : ''),
            'aria-pressed': String(activeTag === t),
            onClick: () => { activeTag = activeTag === t ? null : t; paint(); },
          }, t)),
          activeTag ? h('button', {
            className: 'bento-tag bento-tag-clear',
            onClick: () => { activeTag = null; paint(); },
          }, icon('x'), 'Clear') : null));
      }
      const actions = h('div', { className: 'bento-actions' });

      /* The mode switch. In view mode the wall is images and captions and
         nothing else — the add-controls belong to editing too, because you
         do not accidentally need "+ group" while looking at references. */
      actions.appendChild(h('button', {
        className: 'btn bento-mode' + (editing ? ' on' : ''),
        title: editing ? 'Finish arranging' : 'Arrange this wall',
        onClick: () => { editing = !editing; paint(); },
      }, icon(editing ? 'check' : 'pen-line'), editing ? 'Done' : 'Arrange'));

      if (!editing) { toolbar.appendChild(actions); return; }

      // Add an image: file picker → attachments/, then a fresh card.
      const fileIn = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
      fileIn.addEventListener('change', async () => {
        const f = fileIn.files && fileIn.files[0];
        if (!f) return;
        try {
          const { path } = await uploadAsset(f);
          model.groups[0].items.unshift({ image: path, caption: '', tags: [], url: null });
          save(); paint();
        } catch (e) { toast('Upload failed — ' + e.message, { tone: 'error' }); }
      });
      actions.appendChild(fileIn);
      actions.appendChild(h('button', { className: 'btn-secondary', onClick: () => fileIn.click() }, '+ image'));
      actions.appendChild(h('button', {
        className: 'btn-secondary',
        onClick: () => {
          model.groups[0].items.unshift({ image: null, caption: '', tags: [], url: 'https://' });
          save(); paint();
        } }, '+ link'));
      actions.appendChild(h('button', {
        className: 'btn-secondary',
        onClick: () => {
          // Inline, not prompt() — same reason the project picker stopped
          // using it: an OS dialog in the middle of a themed app.
          const name = h('input', { className: 'set-input bento-newgroup',
            placeholder: 'Group name', autocomplete: 'off' });
          const commit = () => {
            const v = (name.value || '').trim();
            if (v) { model.groups.push({ name: v, items: [] }); save(); }
            paint();
          };
          name.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { e.preventDefault(); paint(); }
          });
          name.addEventListener('blur', commit);
          actions.replaceChildren(name);
          name.focus();
        } }, '+ group'));

      // One-click migration for boards made under the old canvas model. An
      // explicit button, not an adoption-write: nothing touches the file until
      // the user asks.
      const canvasItems = (page.meta && Array.isArray(page.meta.layout)) ? page.meta.layout : [];
      const already = model.groups.some((g) => g.items.length);
      if (canvasItems.length && !already) {
        actions.appendChild(h('button', {
          className: 'btn-primary',
          onClick: () => {
            model.groups[0].items.push(...I.fromCanvas(canvasItems));
            save(); paint();
          } }, `import ${canvasItems.length} items from the old board`));
      }
      toolbar.appendChild(actions);
    }

    /* A wall has two states, and it used to only have one.

       Every tile carried a caption input, a #tags input, a source-url input,
       a group <select> and a remove × — permanently, on every card. A page
       whose entire job is looking at images rendered as a column of forms,
       and the images were the smallest thing on it.

       View is now the default: image, caption, tags. Edit is a deliberate
       switch, and the fields only exist then. The caption stays inline-
       editable on click in view mode, because retyping a caption is the one
       edit frequent enough that a mode switch would be a tax. */
    function card(item, group) {
      const el = h('div', { className: 'bento-card' });

      if (item.image) {
        el.appendChild(h('div', { className: 'bento-imgbox' }, vaultImage(item.image)));
      } else if (item.url) {
        const domain = (item.url.replace(/^https?:\/\//, '').split('/')[0] || '').slice(0, 40);
        el.appendChild(h('a', {
          className: 'bento-linkface', href: item.url, target: '_blank', rel: 'noopener',
        }, icon('link-2'), domain || 'link'));
      } else {
        el.appendChild(h('div', { className: 'bento-imgbox bento-imgbox-empty' },
          h('span', null, 'No image yet')));
      }

      if (!editing) {
        // ── View ──────────────────────────────────────────────────────
        const cap = h('div', {
          className: 'bento-cap-view' + (item.caption ? '' : ' is-empty'),
          title: 'Click to edit the caption',
          onClick: (e) => {
            e.stopPropagation();
            const inp = h('input', {
              className: 'bento-cap', value: item.caption || '', placeholder: 'Caption…',
              onInput: (ev) => { item.caption = ev.target.value; save(); },
              onKeyDown: (ev) => { if (ev.key === 'Enter' || ev.key === 'Escape') ev.target.blur(); },
            });
            inp.addEventListener('blur', () => paint());
            cap.replaceWith(inp);
            inp.focus(); inp.select();
          },
        }, item.caption || 'Add a caption');
        el.appendChild(cap);

        if ((item.tags || []).length) {
          el.appendChild(h('div', { className: 'bento-tags-view' },
            item.tags.map((t) => h('button', {
              className: 'tag-chip tag-chip-btn',
              onClick: (e) => { e.stopPropagation(); activeTag = activeTag === t ? null : t; paint(); },
            }, t))));
        }
        if (item.url && item.image) {
          el.appendChild(h('a', {
            className: 'bento-src', href: item.url, target: '_blank', rel: 'noopener',
            onClick: (e) => e.stopPropagation(),
          }, icon('link-2'), 'Source'));
        }
        return el;
      }

      // ── Edit ────────────────────────────────────────────────────────
      const capIn = h('input', {
        className: 'bento-cap', placeholder: 'Caption…', value: item.caption || '',
        onInput: (e) => { item.caption = e.target.value; save(); },
      });
      const tagIn = h('input', {
        className: 'bento-tags-in', placeholder: '#tags',
        value: (item.tags || []).map((t) => '#' + t).join(' '),
        onChange: (e) => {
          item.tags = [...new Set(e.target.value.split(/\s+/)
            .map((t) => t.replace(/^#/, '').trim()).filter(Boolean))];
          save(); renderToolbar();
        },
      });
      const urlIn = h('input', {
        className: 'bento-url-in', placeholder: 'Source URL…', value: item.url || '',
        onChange: (e) => { item.url = e.target.value.trim() || null; save(); },
      });
      const sel = h('select', { className: 'bento-group-sel', title: 'Move to group' },
        allGroupNames().map((n) => h('option', {
          value: n, selected: n === group.name ? 'selected' : undefined,
        }, n || '(ungrouped)')));
      sel.addEventListener('change', () => {
        const to = model.groups.find((g) => g.name === sel.value);
        if (!to || to === group) return;
        group.items.splice(group.items.indexOf(item), 1);
        to.items.unshift(item);
        save(); paint();
      });
      const del = h('button', {
        className: 'bento-del', title: 'Remove this item',
        onClick: () => {
          const removed = item;
          const idx = group.items.indexOf(item);
          group.items.splice(idx, 1);
          save(); paint();
          toast('Item removed', { actionLabel: 'Undo', onAction: () => {
            group.items.splice(idx, 0, removed); save(); paint();
          } });
        } }, icon('trash-2'));
      el.appendChild(h('div', { className: 'bento-fields' }, capIn, tagIn, urlIn,
        h('div', { className: 'bento-row' }, sel, del)));
      return el;
    }

    function paint() {
      renderToolbar();
      clear(gridWrap);
      for (const g of model.groups) {
        const visible = g.items.filter((it) => !activeTag || (it.tags || []).includes(activeTag));
        if (!g.items.length && !g.name) continue;         // hide an empty unnamed group
        const sec = h('section', { className: 'bento-group' });
        if (g.name) sec.appendChild(h('h3', { className: 'bento-group-h' }, g.name,
          h('span', { className: 'bento-group-n' }, ' ' + visible.length)));
        if (visible.length) {
          sec.appendChild(h('div', { className: 'bento-grid' },
            visible.map((it) => card(it, g))));
        } else {
          sec.appendChild(h('div', { className: 'bento-empty' },
            activeTag ? 'nothing tagged #' + activeTag : 'empty — add an image or a link'));
        }
        gridWrap.appendChild(sec);
      }
      if (!model.groups.some((g) => g.items.length)) {
        gridWrap.appendChild(h('div', { className: 'bento-empty bento-empty-page' },
          'A reference wall. Add an image, paste a link, group what belongs together.'));
      }
    }

    paint();
    return wrap;
  }

  function renderSnippetBody() {
    return h('div', { className: 'page-body snippet-body' },
      ProseEditor({
        getValue: () => page.body,
        setValue: (v) => { page.body = v; queueSave(); },
        placeholder: 'A quick thought…',
        minHeight: 160,
      }));
  }

  function renderMarkdownBody() {
    if (!page.meta) page.meta = {};
    /* The note body. Two things changed here.

       It used to print a frontmatter block above the prose — id, kind, tags,
       url — so the first thing you saw on your own note was
       `id 01KVWR…`. Those facts are in the Metadata rail three inches to the
       right, and in the chips row above. Three copies of the same machine
       text, one of them ahead of the writing. The rail keeps them; this
       doesn't.

       And it had its own view/edit toggle labelled `✎ edit` / `✓ done`, one
       of three such toggles in the app. It uses the shared one now. */
    return h('div', { className: 'page-body md-body' },
      ProseEditor({
        getValue: () => page.body,
        setValue: (v) => { page.body = v; queueSave(); },
        placeholder: 'Write…\n\n## Section headers\n- Bullet lists\n> A quote\n\n[[Wikilinks]] resolve and #tags stick.',
        minHeight: 420,
      }));
  }

  function renderBookmarkBody() {
    if (!page.meta) page.meta = {};
    // Migrate legacy {url, og} → {links: [{url, og}]}. Keep meta.url in sync
    // with links[0].url so older readers (frontmatter export, etc.) still work.
    if (!Array.isArray(page.meta.links)) {
      page.meta.links = page.meta.url
        ? [{ url: page.meta.url, og: page.meta.og || null }]
        : [];
    }
    const wrap = h('div', { className: 'page-body bookmark-body' });
    const linksWrap = h('div', { className: 'bm-links' });

    function syncLegacy() {
      page.meta.url = page.meta.links.length ? page.meta.links[0].url : '';
      page.meta.og = page.meta.links.length ? page.meta.links[0].og : null;
    }

    function renderPreview(box, og) {
      clear(box);
      if (!og) return;
      if (og.error) {
        box.appendChild(h('div', { className: 'bm-preview-err' }, '✗ ', og.error));
        return;
      }
      if (og.image) box.appendChild(h('img', {
        className: 'bm-preview-img', src: og.image, loading: 'lazy', alt: '',
      }));
      const content = h('div', { className: 'bm-preview-content' });
      content.appendChild(h('a', {
        className: 'bm-preview-title', href: og.final_url || og.url, target: '_blank',
      }, og.title || og.url));
      if (og.description) {
        content.appendChild(h('div', { className: 'bm-preview-desc' }, og.description));
      }
      content.appendChild(h('div', { className: 'bm-preview-site' },
        og.site_name || '', og.site_name && og.final_url ? ' · ' : '',
        og.final_url ? og.final_url.replace(/^https?:\/\//, '').slice(0, 60) : ''));
      box.appendChild(content);
    }

    function renderLinks() {
      clear(linksWrap);
      page.meta.links.forEach((link, idx) => {
        /* The preview machinery is gone. It rendered a box, said "fetching
           preview…", and then failed — fetchLinkPreview() routes through
           gone(), because a browser tab cannot read another origin. The
           refresh button beside it could never do anything either.

           A saved og payload still renders if the clipper captured one; the
           app simply stops pretending it can go and get one itself. */
        const previewBox = h('div', { className: 'bm-preview' });
        if (link.og) renderPreview(previewBox, link.og);
        const urlInput = h('input', {
          className: 'bm-url-input',
          placeholder: 'https://…',
          value: link.url || '',
          onInput: (e) => { link.url = e.target.value; syncLegacy(); queueSave(); },
        });
        linksWrap.appendChild(h('div', { className: 'bm-link-card' },
          h('div', { className: 'bm-link-card-hd' },
            /* "#1" on a card when there is exactly one card is a number
               counting to one. It appears from the second link onward, where
               it actually distinguishes something. */
            page.meta.links.length > 1
              ? h('span', { className: 'bm-link-card-n' }, String(idx + 1))
              : h('span', { className: 'bm-link-card-n bm-link-card-n-mute' }, 'Link'),
            h('button', { className: 'bm-link-card-rm', title: 'Remove this link',
              onClick: () => {
                if (page.meta.links.length === 1 && !link.url) return;
                page.meta.links.splice(idx, 1);
                syncLegacy(); queueSave(); renderLinks();
              } }, '×')),
          h('div', { className: 'bm-url-row' },
            urlInput,
            h('a', { className: 'bm-open', href: link.url || '#', target: '_blank',
              title: 'Open in a new tab',
              onClick: (e) => { if (!link.url) e.preventDefault(); } }, 'Open')),
          previewBox));
      });
      // "+ add link" button at the bottom
      linksWrap.appendChild(h('button', {
        className: 'bm-link-add',
        onClick: () => {
          page.meta.links.push({ url: '', og: null });
          syncLegacy(); queueSave(); renderLinks();
        },
      }, icon('plus'), 'Add another link'));
    }

    // Ensure at least one link card is visible
    if (page.meta.links.length === 0) page.meta.links.push({ url: '', og: null });
    renderLinks();

    const linkSection = h('div', { className: 'bm-section bm-section-link' },
      h('div', { className: 'bm-section-l' }, 'Links · ', String(page.meta.links.length)),
      linksWrap);

    const contextSection = h('div', { className: 'bm-section bm-section-context' },
      ProseEditor({
        label: 'Context',
        getValue: () => page.body,
        setValue: (v) => { page.body = v; queueSave(); },
        placeholder: 'Why this matters · what to remember · who else cares…',
        minHeight: 180,
      }));

    wrap.appendChild(linkSection);
    wrap.appendChild(contextSection);
    return wrap;
  }

  // ── Project renderer (kind=project) ───────────────────────────────────
  // A project is a container. Its own body is the README. Everything else
  // that mentions this project shows up grouped by kind below.
  function renderProjectBody(projectName) {
    if (!page.meta) page.meta = {};
    const wrap = h('div', { className: 'page-body project-body' });

    const STATUSES = [
      ['planning', 'Planning'], ['active', 'Active'], ['paused', 'Paused'],
      ['shipped', 'Shipped'],   ['archived', 'Archived'],
    ];

    // ── Summary strip ───────────────────────────────────────────────────
    // The old header card restated the title, which the page header above it
    // already shows in an editable field. What was actually useful in it was
    // the status + timeline at a glance, so that is all that survives.
    const summary = h('div', { className: 'pj-summary' });
    function refreshSummary() {
      clear(summary);
      const meta = page.meta || {};
      const label = (STATUSES.find((s) => s[0] === meta.status) || [])[1];
      if (label) {
        summary.appendChild(h('span', { className: 'pj-status pj-status-' + meta.status },
          h('span', { className: 'pj-status-dot' }), label));
      }
      // Read as a sentence, not as "2026-07-02 → ?". A project with a start
      // and no end is ongoing; that is the common case and it should say so.
      if (meta.start_date || meta.end_date) {
        const parts = [];
        if (meta.start_date) parts.push('Started ' + meta.start_date);
        parts.push(meta.end_date ? 'ended ' + meta.end_date : 'ongoing');
        summary.appendChild(h('span', { className: 'pj-dates' }, parts.join(' · ')));
      }
      if (!summary.children.length) {
        summary.appendChild(h('span', { className: 'pj-summary-empty' },
          'No status or dates set yet.'));
      }
    }
    refreshSummary();

    // ── Description ─────────────────────────────────────────────────────
    // The third hand-rolled view/edit toggle in the app, now the shared one.
    const descCard = h('div', { className: 'pj-card pj-readme' },
      ProseEditor({
        label: 'Description',
        getValue: () => page.body,
        setValue: (v) => { page.body = v; queueSave(); },
        placeholder: 'What is this project, why does it matter, what does done look like?\n\nMarkdown works, and [[wikilinks]] resolve.',
        minHeight: 220,
      }));

    // ── Details ─────────────────────────────────────────────────────────
    // Was "Project meta": three always-editable inputs with YYYY-MM-DD
    // placeholders and a "—" status, which read as an empty form rather than
    // as facts about the project. Now: real date pickers (the native control
    // already speaks YYYY-MM-DD, so nothing is converted), a status list with
    // no meaningless blank, and a line saying where the values actually go —
    // because writing them changes the file Obsidian and your agent read.
    const endInput = h('input', {
      // The "Ends" label points here; without the id it named nothing.
      id: 'pj-end',
      className: 'pj-field', type: 'date', value: String(page.meta.end_date || ''),
      onInput: (e) => { page.meta.end_date = e.target.value || null; queueSave(); refreshSummary(); syncOngoing(); },
    });
    const ongoing = h('input', {
      type: 'checkbox', checked: !page.meta.end_date,
      onChange: (e) => {
        if (e.target.checked) { page.meta.end_date = null; endInput.value = ''; }
        endInput.disabled = e.target.checked;
        queueSave(); refreshSummary();
      },
    });
    function syncOngoing() {
      ongoing.checked = !page.meta.end_date;
      endInput.disabled = ongoing.checked;
    }
    const metaCard = h('div', { className: 'pj-card' },
      h('div', { className: 'pj-card-hd' }, 'Details'),
      h('div', { className: 'pj-card-body' },
        h('div', { className: 'pj-field-row' },
          h('label', { className: 'pj-field-l', for: 'pj-status' }, 'Status'),
          h('select', {
            id: 'pj-status', className: 'pj-field',
            value: String(page.meta.status || ''),
            onChange: (e) => { page.meta.status = e.target.value || null; queueSave(); refreshSummary(); },
          },
            h('option', { value: '' }, 'Not set'),
            ...STATUSES.map(([v, l]) => h('option', { value: v }, l)))),
        h('div', { className: 'pj-field-row' },
          h('label', { className: 'pj-field-l', for: 'pj-start' }, 'Started'),
          h('input', {
            id: 'pj-start', className: 'pj-field', type: 'date',
            value: String(page.meta.start_date || ''),
            onInput: (e) => { page.meta.start_date = e.target.value || null; queueSave(); refreshSummary(); },
          })),
        h('div', { className: 'pj-field-row' },
          h('label', { className: 'pj-field-l', for: 'pj-end' }, 'Ends'),
          h('div', { className: 'pj-field-pair' },
            endInput,
            h('label', { className: 'pj-check' }, ongoing, h('span', null, 'Ongoing')))),
        h('p', { className: 'pj-card-note' },
          'These are written into the folder note’s frontmatter, so Obsidian and your agent read the same values.')));
    syncOngoing();

    // ── Inside this project: grouped grid of pages that mention this id ─
    const insideCard = h('div', { className: 'pj-card pj-inside' });
    const projectId = page.id;
    let insidePages = [];

    async function loadInside() {
      clear(insideCard);
      insideCard.appendChild(h('div', { className: 'pj-card-hd' }, 'Inside this project'));
      insideCard.appendChild(h('div', { className: 'sb-meta' }, 'loading…'));
      try {
        // Folder membership is the primary truth — a project holds its files.
        // Pages that merely *mention* the project are appended after, so the
        // old mention-based members stay reachable rather than vanishing.
        const inFolder = projectName ? SB.data().projectMembers(projectName).items : [];
        const seen = new Set(inFolder.map((p) => p.id));
        const data = await SB.data().pages({ mention: projectId, limit: 500 });
        const mentioned = (data.items || [])
          .filter((p) => p.id !== projectId && !seen.has(p.id));
        insidePages = [...inFolder, ...mentioned];
        renderInside();
      } catch (e) {
        clear(insideCard);
        insideCard.appendChild(h('div', { className: 'pj-card-hd' }, 'Inside this project'));
        insideCard.appendChild(h('div', { className: 'sb-meta' }, '✗ ', String(e.message || e)));
      }
    }

    function pageCard(p) {
      const m = metaForPage(p);
      return h('div', {
        className: 'pj-inside-card',
        style: { '--k-c': m.color || 'var(--muted)' },
        onClick: (e) => {
          if (e.metaKey || e.ctrlKey) { newTab('page', p.id, { switchTo: true }); return; }
          const t = activeTab();
          if (t) { t.parentRoute = 'project:' + projectId; persistTabs(); }
          openPage(p.id);
        },
      },
        h('div', { className: 'pj-inside-card-hd' },
          // `m` already resolved the kind; the glyph must come from it too,
          // or the label says Drawing beside a board icon.
          h('span', { className: 'pj-inside-glyph' }, icon(m.icon || 'file-text')),
          h('span', { className: 'pj-inside-kind' }, m.label || p.kind)),
        h('div', { className: 'pj-inside-title' }, p.title || p.slug || '(untitled)'),
        p.body
          ? h('div', { className: 'pj-inside-snip' }, firstLineOf(p.body, 100))
          : null);
    }

    // Every kind the vault knows, plus a drawing — the whole point of a
    // project is holding them all in one folder.
    const CREATABLE = [...KIND_ORDER, 'drawing'];
    const metaForKind = (k) => (k === 'drawing' ? DRAWING_META : (KIND_META[k] || {}));

    async function createInside(k) {
      try {
        const p = await SB.data().createPage({ kind: k, title: '', body: '', project: projectName });
        if (!p || !p.id) throw new Error('no page id came back — ' + JSON.stringify(p).slice(0, 180));
        invalidatePageIndex();
        cacheSetPage(p);
        const t = activeTab();
        if (t) { t.parentRoute = 'project:' + projectId; persistTabs(); }
        openPage(p.id);
      } catch (err) {
        toast('Could not create that — ' + err.message, { tone: 'error' });
      }
    }

    // ── The create picker ───────────────────────────────────────────────
    // Was a strip of six 10px buttons prefixed with unicode glyphs (§ ↗ ¶ ▦
    // ◫ ✎) behind the label "+ create inside this project:". You had to
    // already know what the symbols meant to use it.
    //
    // It is now the same kind-picker the global Create modal uses — icon,
    // name, and the one-line hint that already lives in KIND_META and was
    // previously buried in a `title` tooltip. Learning the vault's five kinds
    // once should be enough; two different pickers for the same choice was
    // most of why this screen felt like a different app.
    //
    // Progressive disclosure: an empty project shows the picker open, because
    // that is the only thing you can usefully do. A project with pages in it
    // shows one button, because the pages are the point.
    let pickerOpen = false;
    function kindPicker() {
      return h('div', { className: 'pj-picker' },
        ...CREATABLE.map((k) => {
          const m = metaForKind(k);
          return h('button', {
            className: 'pj-picker-card',
            style: { '--k-c': m.color },
            onClick: () => createInside(k),
          },
            h('span', { className: 'pj-picker-icon' }, icon(m.icon || 'file-text')),
            h('span', { className: 'pj-picker-l' }, m.label || k),
            h('span', { className: 'pj-picker-h' }, m.hint || ''));
        }));
    }

    function renderInside() {
      clear(insideCard);
      const count = insidePages.length;
      insideCard.appendChild(h('div', { className: 'pj-card-hd' },
        'Inside this project · ', nOf(count, 'page')));

      const addWrap = h('div', { className: 'pj-add' });
      function paintAdd() {
        clear(addWrap);
        if (count === 0 || pickerOpen) {
          if (count > 0) {
            addWrap.appendChild(h('button', {
              className: 'btn pj-add-toggle', onClick: () => { pickerOpen = false; paintAdd(); },
            }, icon('x'), 'Close'));
          }
          addWrap.appendChild(kindPicker());
        } else {
          addWrap.appendChild(h('button', {
            className: 'btn-create pj-add-toggle',
            onClick: () => { pickerOpen = true; paintAdd(); },
          }, icon('plus'), h('span', null, 'New in this project')));
        }
      }
      paintAdd();
      insideCard.appendChild(addWrap);

      if (count === 0) {
        insideCard.appendChild(h('div', { className: 'pj-empty' },
          'Nothing here yet. Pick a kind above and it lands in this project’s folder, already linked. ',
          'To bring an existing page in, open it and add ',
          h('code', null, '[[' + (page.title || projectId) + ']]'),
          ' to its mentions.'));
        return;
      }

      // Group by kind, in KIND_ORDER first (visual order), others after.
      const groups = {};
      insidePages.forEach((p) => { (groups[p.kind] = groups[p.kind] || []).push(p); });
      const orderedKinds = [...KIND_ORDER].filter((k) => groups[k]);
      // Catch any unexpected kinds that aren't in either list.
      Object.keys(groups).forEach((k) => { if (!orderedKinds.includes(k)) orderedKinds.push(k); });

      orderedKinds.forEach((k) => {
        const m = KIND_META[k] || {};
        const section = h('div', { className: 'pj-group' },
          h('div', { className: 'pj-group-hd' },
            h('span', { className: 'pj-group-icon', style: { color: m.color || 'inherit' } },
              kindIcon(k)),
            h('span', null, m.label || k),
            h('span', { className: 'pj-group-ct' }, String(groups[k].length))),
          h('div', { className: 'pj-group-grid' },
            groups[k].map(pageCard)));
        insideCard.appendChild(section);
      });
    }

    loadInside();

    // Order follows the questions you actually ask: what is this, then the
    // facts about it, then what is in it. The old order led with a card that
    // only restated the title.
    wrap.appendChild(summary);
    wrap.appendChild(descCard);
    wrap.appendChild(metaCard);
    wrap.appendChild(insideCard);
    return wrap;
  }

  // ── Side renderers ────────────────────────────────────────────────────
  function renderTopicSide() {
    const aside = h('aside', { className: 'topic-side' });

    // PARENT (if any)
    const parentId = page.meta && page.meta.parent;
    if (parentId) {
      const row = h('div', { className: 'side-card side-parent' },
        h('div', { className: 'side-card-hd' }, '↑ PARENT'),
        h('div', { className: 'side-card-body' },
          h('button', { className: 'side-link',
            onClick: () => { app.openPageId = parentId; app.route = 'page'; render(); } },
            h('span', { className: 'side-link-title' }, 'loading…'))));
      aside.appendChild(row);
      getPageCached(parentId).then((p) => {
        const t = row.querySelector('.side-link-title');
        if (t) t.textContent = p.title || '(untitled)';
      }).catch(() => {});
    }

    // METADATA
    const sRow = (l, v) => h('div', { className: 'side-row' },
      h('span', { className: 'side-row-l' }, l),
      h('span', { className: 'side-row-v' }, v));
    /* What this rail owes the reader is the facts the page itself does not
       already show.
         · Slug restated the H1 a centimetre above it, word for word.
         · Tags and Mentions counted chips that are listed in the header row,
           so the rail's answer was always visible before you looked.
       Both are gone. In their place, the one fact this app is entirely about
       and did not show anywhere: which file on disk you are looking at. */
    const fileRow = sRow('File', page.path || '—');
    fileRow.className = 'side-row side-row-file';
    fileRow.querySelector('.side-row-v').title = page.path || '';
    aside.appendChild(h('div', { className: 'side-card' },
      h('div', { className: 'side-card-hd' }, 'Metadata'),
      h('div', { className: 'side-card-body' },
        fileRow,
        // metaForPage, not KIND_META[kind] — the header pill above this rail
        // reads it that way, and a bookmark that calls itself "Note" one line
        // below a badge saying "Bookmark" is the label being decided twice.
        sRow('Kind',     metaForPage(page).label),
        sRow('Created',  fmtDate(page.created)),
        sRow('Updated',  fmtDate(page.updated)),
        sRow('ID',       page.id.slice(0, 8) + '…'))));

    // BACKLINKS — fetched live (pages that mention this one)
    const backHd = h('div', { className: 'side-card-hd' }, 'Backlinks');
    const backBody = h('div', { className: 'side-card-body side-card-empty' }, 'loading…');
    aside.appendChild(h('div', { className: 'side-card' }, backHd, backBody));
    Promise.resolve(SB.data().backlinks(page.id)).then(({ items }) => {
      backHd.textContent = 'Backlinks · ' + (items ? items.length : 0);
      clear(backBody);
      if (!items || !items.length) {
        backBody.className = 'side-card-body side-card-empty';
        backBody.appendChild(document.createTextNode('No pages link here yet.'));
        return;
      }
      backBody.className = 'side-card-body';
      const list = h('div', { className: 'side-children' });
      items.forEach((b) => list.appendChild(h('button', {
        className: 'side-link',
        onClick: () => { app.openPageId = b.id; app.route = 'page'; render(); },
      },
        h('span', { className: 'side-link-title' }, b.title),
        h('span', { className: 'side-link-meta' }, metaForPage(b).label || b.kind))));
      backBody.appendChild(list);
    }).catch(() => {
      backHd.textContent = 'Backlinks · 0';
      clear(backBody); backBody.appendChild(document.createTextNode('—'));
    });

    // SUB-PAGES
    const children = (page.meta && Array.isArray(page.meta.children)) ? page.meta.children : [];
    const childList = h('div', { className: 'side-children' });
    const subCard = h('div', { className: 'side-card' },
      h('div', { className: 'side-card-hd' }, 'Sub-pages · ' + children.length),
      h('div', { className: 'side-card-body' },
        childList,
        h('button', { className: 'side-action',
          onClick: createSubpage }, icon('plus'), 'Add sub-page')));
    aside.appendChild(subCard);

    if (children.length) {
      v2GetPagesBatch(children).then((pgs) => {
        clear(childList);
        pgs.forEach((cp) => {
          if (!cp) return;
          childList.appendChild(h('button', {
            className: 'side-link',
            onClick: () => { app.openPageId = cp.id; app.route = 'page'; render(); },
          },
            h('span', { className: 'side-link-title' }, cp.title || '(untitled)'),
            h('span', { className: 'side-link-meta' }, metaForPage(cp).label)));
        });
      });
    }

    // ACTIONS
    aside.appendChild(h('div', { className: 'side-card' },
      h('div', { className: 'side-card-hd' }, 'Actions'),
      h('div', { className: 'side-card-body' },
        h('button', { className: 'side-action',
          onClick: async () => {
            try {
              const res = await SB.data().exportPage(page.id);
              const blob = new Blob([res.content], { type: 'text/markdown' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = res.filename.split('/').pop();
              a.click();
              URL.revokeObjectURL(a.href);
            } catch (e) { toast('Export failed — ' + e.message, { tone: 'error' }); }
          } }, icon('download'), 'Export .md'),
        /* The other half of the write safety. Every overwrite has snapshotted
           to `.history/` since 5.19 and the app never said so, so the app
           looked more dangerous than it actually is. Restoring writes through
           the normal save path, which means the restore is itself snapshotted
           — you can undo the undo. */
        h('button', { className: 'side-action',
          onClick: async () => {
            let snaps = [];
            try { snaps = await SB.data().pageHistory(page.id); } catch (_) {}
            if (!snaps.length) { toast('No earlier versions of this page yet'); return; }
            const pick = await historyDialog(snaps, page.title || 'this page');
            if (!pick) return;
            const r = await SB.data().readSnapshot(pick.path);
            if (!r || !r.ok) { toast('Could not read that version', { tone: 'error' }); return; }
            page.body = r.body != null ? r.body : r.text;
            queueSave();
            layout();
            toast('Restored the version from ' + pick.stamp);
          } }, icon('history'), 'Version history'),
        h('button', { className: 'side-action side-action-warn',
          onClick: async () => {
            if (!await confirmDialog({
              title: 'Delete this page?',
              body: 'This moves "' + (page.title || 'this page') + '" to .trash/ in your vault. '
                  + 'You can undo it, and the file stays on disk either way.',
              confirmLabel: 'Delete',
              danger: true,
            })) return;
            const title = page.title || 'Page';
            const receipt = await SB.data().deletePage(page.id);
            cacheInvalidatePage(page.id);
            onDeleted && onDeleted();
            // The file went to .trash/ rather than away. Say so, and offer
            // the way back — a safety nobody is told about is not a safety.
            toast(title + ' deleted', {
              actionLabel: 'Undo',
              onAction: async () => {
                const r = await SB.data().restorePage(receipt);
                if (r && r.ok) {
                  invalidatePageIndex();
                  await refreshCounts();
                  if (r.id) openPage(r.id); else render();
                  toast(title + ' restored');
                } else {
                  toast('Could not restore — ' + ((r && r.reason) || 'unknown'), { tone: 'error' });
                }
              },
            });
          } }, icon('trash-2'), 'Forget this'))));

    return aside;

    async function createSubpage() {
      try {
        if (!page.meta) page.meta = {};
        if (!Array.isArray(page.meta.children)) page.meta.children = [];
        // Enforce 3-level cap: if THIS page already has a grandparent, it sits
        // at depth 2; creating a child would push us to depth 3 (level 4) which
        // is too deep.
        const depth = await pageDepth(page);
        if (depth >= SUBPAGE_MAX_DEPTH - 1) {
          toast('Sub-pages stop at ' + SUBPAGE_MAX_DEPTH + ' levels deep — '
            + 'link to a page instead of nesting another one.');
          return;
        }
        const newPage = await SB.data().createPage({
          kind: page.kind === 'markdown' ? 'markdown' : 'topic',
          title: '', body: '',
          meta: { parent: page.id }
        });
        page.meta.children.push(newPage.id);
        await SB.data().updatePage(page.id, { meta: page.meta });
        cacheInvalidatePage(page.id);
        app.openPageId = newPage.id; app.route = 'page'; render();
      } catch (e) { toast('Could not create the sub-page — ' + e.message, { tone: 'error' }); }
    }
  }

  // Walk up meta.parent to compute the page's depth (0 = root, 1 = child, …)
  async function pageDepth(p) {
    let depth = 0;
    let cur = p;
    while (cur && cur.meta && cur.meta.parent && depth < 5) {
      cur = await getPageCached(cur.meta.parent).catch(() => null);
      if (!cur) break;
      depth++;
    }
    return depth;
  }

  // ── Compose header + body + side ──────────────────────────────────────
  const layout = () => {
    runBodyTeardowns();
    clear(wrap);
    const m = metaForPage(page);

    // Ancestor breadcrumb (parent → grandparent) — only shown if page has a parent.
    // We fill it asynchronously so layout stays sync.
    const ancestorBar = page.meta && page.meta.parent
      ? h('div', { className: 'page-ancestors' }, h('span', { className: 'page-ancestors-loading' }, '↑ …'))
      : null;
    if (ancestorBar) {
      (async () => {
        const chain = [];   // [grandparent, parent]
        let cur = page;
        while (cur && cur.meta && cur.meta.parent && chain.length < SUBPAGE_MAX_DEPTH - 1) {
          const par = await getPageCached(cur.meta.parent).catch(() => null);
          if (!par) break;
          chain.unshift(par);
          cur = par;
        }
        clear(ancestorBar);
        if (!chain.length) return;
        ancestorBar.appendChild(h('span', { className: 'page-ancestors-l' }, '↑'));
        chain.forEach((a, i) => {
          if (i > 0) ancestorBar.appendChild(h('span', { className: 'page-ancestors-sep' }, '›'));
          ancestorBar.appendChild(h('a', {
            className: 'page-ancestors-crumb',
            href: '#page/' + a.id,
            onClick: (e) => { e.preventDefault(); openPage(a.id); },
          }, a.title || '(untitled)'));
        });
      })();
    }

    const header = h('div', { className: 'page-hd' },
      ancestorBar,
      h('div', { className: 'page-hd-row' },
        /* `metaForPage` already picks a page's CHROME from its content — a
           note with a url gets the bookmark layout. It now picks the LABEL
           too. The nav facet said "Bookmark" and the page pill said "Note",
           which is the derived-facet model (kind === note && url) leaking
           into the interface; the user does not know or care that bookmark
           is not a stored kind. */
        h('span', { className: 'page-kind-pill', style: { '--k-c': m.color }, title: m.hint },
          h('span', { className: 'kind-chip-g' }, icon(m.icon || 'file-text')),
          h('span', { className: 'page-kind-label' }, m.label)),
        h('input', {
          className: 'page-title-input',
          placeholder: 'Untitled',
          value: page.title,
          onInput: (e) => { page.title = e.target.value; queueSave(); },
        }),
        h('div', { className: 'page-meta-side' },
          // Sits before the timestamp so the eye finds "did that land?" in
          // the same place it already looks for "when did this change".
          h('span', { className: 'save-state', 'data-state': 'idle', role: 'status', 'aria-live': 'polite' }),
          h('span', { className: 'page-meta-when' }, 'updated ', fmtDate(page.updated)),
          obsidianUrl(page.path) ? h('a', {
            className: 'page-meta-obs', href: obsidianUrl(page.path),
            title: 'open this file in Obsidian — deeper search, backlinks, canvas arranging',
          }, 'obsidian ↗') : null,
          /* The delete control lives in Actions, at the bottom of the
             metadata rail, with the rest of the page-level operations. It
             used to ALSO sit here as a bare "delete" link beside the
             timestamp — a destructive verb rendered quieter than a date and
             one slip away from "obsidian ↗". One of them had to go, and it
             was not going to be the one in Actions. */
        )),
      h('div', { className: 'page-chips-row' },
        h('div', { className: 'chip-strip' },
          h('span', { className: 'chip-strip-l' }, 'tags'),
          page.tags.map((t, i) => h('span', {
            className: 'tag-chip rm tag-chip-click',
            title: 'Click to see all pages with #' + t,
            onClick: (e) => {
              if (e.target.tagName === 'BUTTON') return;  // remove btn handled separately
              setRoute('tag:' + t);
            },
          },
            h('span', { className: 'tag-chip-t' }, t),
            h('button', { title: 'Remove this tag', onClick: (e) => {
              e.stopPropagation();
              page.tags.splice(i, 1); queueSave(); layout();
            } }, '×'))),
          AutocompleteInput({
            placeholder: '+ tag',
            allowCreate: true,
            fetchSuggestions: (q) => searchTags(q, page.tags),
            renderItem: (it) => [
              h('span', { className: 'ac-row-l' }, it.tag),
              h('span', { className: 'ac-row-r' }, String(it.count)),
            ],
            onPick: ({ existing, created }) => {
              const val = existing ? existing.tag : created;
              if (!val) return;
              page.tags.push(val);
              invalidateTagsCache();
              queueSave(); layout();
            },
          })),
        h('div', { className: 'chip-strip' },
          h('span', { className: 'chip-strip-l' }, 'mentions'),
          // A mention is a LINK to another page; a tag is a label you apply.
          // They read as two different objects now — this one carries a link
          // glyph and squared corners, the tag is a rounded #pill.
          // A mention chip means "a link to another page". Two things were
          // getting in that are neither: the page's OWN path (a board
          // mentioning itself) and asset paths like attachments/foo.png,
          // which rendered as five identical truncated chips. Both are
          // filtered for display only — the underlying array is untouched,
          // so nothing is dropped from the file.
          visibleMentions().map(({ mn, i }) => h('span', { className: 'mention-chip rm' },
            h('span', { className: 'mention-chip-i' }, icon('link-2')),
            h('span', { className: 'mention-chip-t' }, mn),
            h('button', { title: 'Remove this link',
              onClick: () => { page.mentions.splice(i, 1); queueSave(); layout(); } }, '×'))),
          AutocompleteInput({
            placeholder: '+ mention (search title…)',
            allowCreate: false,
            fetchSuggestions: (q) => searchMentions(q, page.mentions),
            renderItem: (it) => [
              h('span', { className: 'ac-row-l' }, it.title || '(untitled)'),
              h('span', { className: 'ac-row-r' }, it.kind),
            ],
            onPick: ({ existing }) => {
              if (!existing) return;
              page.mentions.push(existing.id);  // canonical ref by id
              queueSave(); layout();
            },
          })),
        /* An "in content" strip used to list every #hashtag found in the
           body. It restated information the reader can already see — the
           tags are right there in the prose, styled as tags — and on an
           inspo wall, where every item carries tags, it produced a third
           consecutive row of near-identical lime pills before any image.
           The tags are visible where they are written; the filter strip is
           how you act on them. */
        ));

    // Dispatch body + side per kind
    let body, side;
    let extraClass = '';
    // A project's folder note IS the project screen. Detected by path — the
    // file says `kind: note` (SPEC: project is a folder, not a kind), so
    // dispatching on kind alone sent every project to the plain text editor,
    /* Every kind gets the metadata rail.
       Several used to pass `side = null` — a leftover from when the right
       column held the chat composer. With chat gone, null did not mean "this
       kind wants width", it meant boards, walls, bookmarks and snippets had
       no delete, no export and no version history at all. A kind you cannot
       manage is not a simpler kind, it is an unfinished one. Width is
       recoverable by collapsing the sidebar; the actions were not
       recoverable by anything.

       The project note keeps `null` on purpose: its body IS a full-width
       management surface, with its own details, description and contents. */
    // which made a container look like a note.
    const _pj = /^projects\/([^/]+)\/([^/]+)\.md$/.exec(page.path || '');
    const isProjectNote = !!(_pj && _pj[1] === _pj[2]);
    if (isProjectNote) {
      body = renderProjectBody(_pj[1]);
      side = null;
      extraClass = ' project-grid';
    } else if (page.kind === 'canvas') {
      // One kind, two file formats, and the split decides who owns the scene:
      // a `.excalidraw.md` is ours, so it mounts the editor and writes; a
      // `.canvas` is Obsidian's, so it renders and never writes. The pill above
      // says which (see `metaForPage`), because "can I edit this?" should be
      // answerable from the page rather than by trying it.
      if (page.meta && page.meta.excalidraw) {
        body = renderExcalidrawBody();
      } else {
        body = withBoardBody(renderCanvasBody());
      }
      side = renderTopicSide();
      extraClass = ' canvas-grid';
    } else if (page.kind === 'inspo') {
      // No withBoardBody wrapper: the body IS the wall now, not a caption
      // under a board.
      body = renderInspoBody();
      side = renderTopicSide();
      extraClass = ' canvas-grid inspo-grid';
    } else if (page.kind === 'note') {
      // 6.9 / SPEC §5: `note` chrome is decided by FRONTMATTER, not by kind.
      // This is why bookmark, snippet and markdown could collapse into one kind
      // — the distinction was always in the metadata, never in the storage.
      // The decision lives in app/vault/data.js so it is testable headlessly
      // and cannot drift from what the tests assert (task 2.7).
      // Fall back to the safest chrome rather than throwing: a missing global
      // used to surface as "Page not found", which is a lie about the data.
      const chrome = typeof window.SB_CHROME === 'function'
        ? window.SB_CHROME(page) : 'article';
      if (chrome === 'bookmark card') {
        body = renderBookmarkBody();
        extraClass = ' bookmark-grid';
      } else if (chrome === 'link with source line') {
        body = renderBookmarkBody();
        extraClass = ' bookmark-grid bookmark-plain';
      } else if (chrome === 'pull-quote') {
        body = renderSnippetBody();
        extraClass = ' snippet-grid';
      } else {
        body = renderMarkdownBody();
        extraClass = ' md-grid';
      }
      side = renderTopicSide();
    } else if (page.kind === 'topic') {
      body = renderTopicBody().body;   // attached materials + the writing surface
      side = renderTopicSide();        // metadata / backlinks / sub-pages / actions
      extraClass = ' topic-grid';
    } else if (page.kind === 'markdown') {
      body = renderMarkdownBody();
      side = renderTopicSide();  // reuse: METADATA / BACKLINKS / SUB-PAGES / ACTIONS
      extraClass = ' md-grid';
    } else if (page.kind === 'bookmark') {
      body = renderBookmarkBody();
      side = renderTopicSide();
      extraClass = ' bookmark-grid';
    } else if (page.kind === 'snippet') {
      body = renderSnippetBody();
      side = renderTopicSide();
      extraClass = ' snippet-grid';
    } else if (page.kind === 'project' || page.kind === 'wproject') {
      body = renderProjectBody();
      side = null;
      extraClass = ' project-grid';
    } else {
      body = renderDefaultBody();
      side = renderTopicSide();
    }

    wrap.appendChild(h('div', { className: 'page-grid' + (side ? '' : ' no-chat') + extraClass },
      h('div', { className: 'page-main' }, header, body),
      side)); // right column
  };

  getPageCached(pageId).then((p) => {
    // A resolved-but-null page is "no such id", not a crash. Without this the
    // view throws on `p.tags` and the catch below reports a render failure.
    if (!p) throw new Error('no page with id ' + pageId);
    page = { ...p, tags: [...(p.tags || [])], mentions: [...(p.mentions || [])], meta: { ...(p.meta || {}) } };
    layout();
    /* Rebuild the breadcrumb once we have the real page — crumbsFor runs
       before the fetch resolves, so it had neither the title (it printed an
       id prefix) nor, when the route you arrived from was not a container,
       any way to know where the page actually lives. Both are answers only
       the loaded page has. */
    try {
      const row = document.querySelector('.crumb-row');
      if (row) row.replaceWith(BreadcrumbRow(crumbsFor('page')));
    } catch (_) {}
  }).catch((e) => {
    // Distinguish "no such page" from "the renderer threw" — reporting a render
    // bug as a missing page sends you looking in the wrong place entirely.
    console.error('page view failed:', e);
    wrap.appendChild(EmptyState(
      'Could not open this page.',
      (e && e.message) ? String(e.message) : 'It may have been deleted.'));
  });

  // Save on unmount + clean up any body listeners (canvas/inspo paste, etc.)
  wrap.__teardown = () => {
    if (dirty) commit();
    runBodyTeardowns();
  };
  return wrap;
}

// ── Tags index: every page-level tag, click to filter ─────────────
// Note: PageHeader returns an *array* of two elements, so use append(wrap, …)
// helpers (which flatten) — wrap.appendChild on an array would throw.
function TagsIndexScreen() {
  const wrap = h('div', { className: 'screen' });
  append(wrap, PageHeader('Tags', null,
    'Every tag used across your pages. Click any to see the pages using it.', null));
  wrap.appendChild(h('div', { className: 'loading-stub' }, 'loading…'));
  Promise.resolve(SB.data().tags()).then(({ tags }) => {
    clear(wrap);
    append(wrap, PageHeader('Tags', null,
      nOf((tags || []).length, 'tag') + ' in the vault. Click any to filter.', null));
    if (!tags || !tags.length) {
      wrap.appendChild(EmptyState('No tags yet.', 'Add tags to your pages — they\'ll show up here.'));
      return;
    }
    const cloud = h('div', { className: 'tags-cloud' });
    const sorted = [...tags].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
    sorted.forEach((t) => {
      /* A tag is a tag wherever it appears. This screen drew grey outlined
         boxes while every other surface draws lime pills, so the one screen
         devoted to tags was the one that did not look like it.

         Frequency used to be carried by font-size — an inline em value that
         sat off the type scale entirely, and redundant besides, since the
         count is printed right there. It rides on the count badge now. */
      cloud.appendChild(h('button', {
        className: 'tag-chip tag-chip-btn tag-cloud-chip',
        title: nOf(t.count, 'page'),
        onClick: () => setRoute('tag:' + t.tag),
      },
        h('span', { className: 'tag-cloud-name' }, t.tag),
        h('span', { className: 'tag-cloud-count' }, String(t.count))));
    });
    wrap.appendChild(cloud);
  }).catch((e) => {
    clear(wrap);
    wrap.appendChild(EmptyState('Failed to load tags.', String(e.message || e)));
  });
  return wrap;
}

// ── Filter pages by tag (reuses the existing /pages?tag= endpoint) ─
function TagFilterScreen(tag) {
  const wrap = h('div', { className: 'screen' });
  const backToTags = h('button', { className: 'side-action',
    onClick: () => setRoute('tags') }, '← all tags');
  append(wrap, PageHeader('#' + tag, null, 'Pages tagged ' + tag, backToTags));
  wrap.appendChild(h('div', { className: 'loading-stub' }, 'loading…'));
  Promise.resolve(SB.data().pages({ tag, limit: 500 })).then(({ items }) => {
    (items || []).forEach((p) => cacheSetPage(p));
    clear(wrap);
    append(wrap, PageHeader('#' + tag, null,
      nOf((items || []).length, 'page'),
      h('button', { className: 'side-action', onClick: () => setRoute('tags') }, '← all tags')));
    if (!items || !items.length) {
      wrap.appendChild(EmptyState('No pages with #' + tag + ' yet.', 'Add the tag to a page to see it here.'));
      return;
    }
    wrap.appendChild(ListView_Table(items, openPage));
  }).catch((e) => {
    clear(wrap);
    wrap.appendChild(EmptyState('Failed to load.', String(e.message || e)));
  });
  return wrap;
}

// ── Filter pages by mention-tag (pages that reference this hub) ────
function MentionFilterScreen(slug) {
  const wrap = h('div', { className: 'screen' });
  const backTo = () => h('button', { className: 'side-action',
    onClick: () => setRoute('mention-tags') }, '← all mention tags');
  append(wrap, PageHeader('@' + slug, null, 'Pages mentioning ' + slug, backTo()));
  wrap.appendChild(h('div', { className: 'loading-stub' }, 'loading…'));
  Promise.resolve({ items: [], mention_tag: null }).then(({ items, mention_tag }) => {
    (items || []).forEach((p) => cacheSetPage(p));
    clear(wrap);
    append(wrap, PageHeader(
      '@' + slug,
      mention_tag && mention_tag.name ? mention_tag.name : null,
      nOf((items || []).length, 'page') + ((items || []).length === 1 ? ' mentions this' : ' mention this'),
      backTo()));
    if (!items || !items.length) {
      wrap.appendChild(EmptyState('No pages mention @' + slug + ' yet.',
        'Reference it inline with [[mt:' + slug + ']] or add it to a page\'s mentions list.'));
      return;
    }
    wrap.appendChild(ListView_Table(items, openPage));
  }).catch((e) => {
    clear(wrap);
    wrap.appendChild(EmptyState('Failed to load.', String(e.message || e)));
  });
  return wrap;
}


function AboutMeScreen() {
  const wrap = h('div', { className: 'screen page-screen' });
  let me = null;
  let dirty = false;
  let saveTimer = null;

  const queueSave = () => {
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(commit, 600);
  };
  const commit = async () => {
    if (!dirty || !me) return;
    dirty = false;
    try {
      const patched = await SB.data().updateAboutMe({
        identity: me.identity, taste: me.taste,
        communication: me.communication, state: me.state, body: me.body,
        experience: me.experience, skills: me.skills,
        education: me.education, highlights: me.highlights,
      });
      me.updated = patched.updated;
    } catch (e) { console.warn('about-me save failed', e); }
  };

  // ── Resume sections (lives in about_me.extras) ──────────────────────
  // Each is an array of dicts; user can add/remove entries.
  const ensureArr = (key) => { if (!Array.isArray(me[key])) me[key] = []; };

  function entryList(key, fields, addLabel) {
    ensureArr(key);
    const wrap = h('div', { className: 'am-list' });
    me[key].forEach((entry, idx) => {
      const row = h('div', { className: 'am-entry' });
      fields.forEach(([fkey, label, opts]) => {
        const isLong = opts && opts.long;
        const input = isLong
          ? h('textarea', {
              placeholder: label, value: String(entry[fkey] || ''),
              onInput: (e) => { entry[fkey] = e.target.value; queueSave(); },
            })
          : h('input', {
              type: 'text', placeholder: label, value: String(entry[fkey] || ''),
              onInput: (e) => { entry[fkey] = e.target.value; queueSave(); },
            });
        row.appendChild(h('label', { className: isLong ? 'am-full' : '' },
          h('span', { className: 'cb-field-label' }, label), input));
      });
      row.appendChild(h('button', {
        className: 'am-remove', title: 'remove',
        onClick: () => { me[key].splice(idx, 1); queueSave(); layout(); },
      }, '×'));
      wrap.appendChild(row);
    });
    // `.sb-secondary` stretched to the container, so "+ experience" rendered
    // as a full-width empty bar that reads as a dropzone rather than a
    // button. An add control should be the size of its own label.
    wrap.appendChild(h('button', {
      className: 'btn am-add',
      onClick: () => {
        me[key].push(Object.fromEntries(fields.map(([k]) => [k, ''])));
        queueSave(); layout();
      },
    }, icon('plus'), 'Add ' + addLabel));
    return wrap;
  }

  function highlightList() {
    ensureArr('highlights');
    const wrap = h('div', { className: 'am-list' });
    me.highlights.forEach((line, idx) => {
      wrap.appendChild(h('div', { className: 'am-entry' },
        h('input', {
          className: 'am-full', type: 'text',
          placeholder: 'Shipped X in Q4, +30% retention …',
          value: String(line || ''),
          onInput: (e) => { me.highlights[idx] = e.target.value; queueSave(); },
        }),
        h('button', {
          className: 'am-remove',
          onClick: () => { me.highlights.splice(idx, 1); queueSave(); layout(); },
        }, '×')));
    });
    wrap.appendChild(h('button', {
      className: 'sb-secondary',
      onClick: () => { me.highlights.push(''); queueSave(); layout(); },
    }, '+ highlight'));
    return wrap;
  }


  const subField = (sectionKey, fieldKey, label, kind, hint) => {
    me[sectionKey] = me[sectionKey] || {};
    const val = me[sectionKey][fieldKey];
    const renderVal = Array.isArray(val) ? val.join(', ') : (val == null ? '' : String(val));
    /* Labels sit ABOVE their field, not in a column beside it.
       These are sentences, not keys — "Tone to match", "Preferred form" —
       and in the shared 84px label column they wrapped into three-line
       uppercase stacks that took longer to read than the answers would. */
    // The label sits above the field rather than wrapping it, so the pairing
    // has to be stated. `sectionKey.fieldKey` is already unique per field.
    const fid = 'am-' + sectionKey + '-' + fieldKey;
    return h('div', { className: 'am-field' },
      h('label', { className: 'am-lbl', for: fid }, label,
        hint ? h('span', { className: 'am-hint' }, hint) : null),
      h('input', {
        className: 'am-input',
        id: fid,
        value: renderVal,
        placeholder: kind === 'list' ? 'Separate with commas' : '',
        onInput: (e) => {
          const v = e.target.value;
          me[sectionKey][fieldKey] = kind === 'list'
            ? v.split(',').map((s) => s.trim()).filter(Boolean)
            : v;
          queueSave();
        },
      }));
  };

  const section = (title, key, fields) => h('div', { className: 'am-sect' },
    h('div', { className: 'am-sect-hd' }, title),
    fields.map(([fkey, label, kind, hint]) => subField(key, fkey, label, kind, hint)));

  const layout = () => {
    clear(wrap);
    wrap.appendChild(h('div', { className: 'page-grid no-chat' },
      h('div', { className: 'page-main' },
        h('div', { className: 'page-hd' },
          h('div', { className: 'page-hd-row' },
            // The pill and the title both read "About me". One of them is
            // enough, and the title is the one that matches every other page.
            h('span', { className: 'page-kind-pill', style: { '--k-c': 'var(--k-self)' } },
              h('span', { className: 'kind-chip-g' }, icon('circle-user')),
              h('span', null, 'You')),
            h('span', { className: 'page-title-static' }, 'About me'),
            h('div', { className: 'page-meta-side' },
              h('span', { className: 'page-meta-when' }, me.updated ? 'updated ' + fmtDate(me.updated) : '')))),
        h('div', { className: 'am-grid' },
          section('Identity', 'identity', [
            ['name', 'Name', 'text'],
            ['values', 'Core values', 'list', 'What you will not trade away'],
            ['current_focus', 'Current focus', 'text', 'What you are on right now'],
          ]),
          section('Taste', 'taste', [
            ['visual', 'Visual taste', 'list'],
            ['writing', 'Writing style', 'text'],
            ['music', 'Music', 'list'],
          ]),
          section('Communication', 'communication', [
            /* Was "Tone the AI should match" — this app has no AI. The
               file is read by whichever agent you point at your vault, so
               the label says that instead of implying a feature. */
            ['tone', 'Tone to match', 'text', 'How you want your writing to sound'],
            ['preferred_form', 'Preferred form', 'text', 'Bullets, prose, something else'],
          ]),
          section('State', 'state', [
            ['energy_pattern', 'Energy pattern', 'text', 'When you do your best work'],
            ['mood_baseline', 'Mood baseline', 'text'],
          ])),

        // ── Resume sections (stored in about_me.extras) ──────────────────
        h('div', { className: 'sect-hd', style: { marginTop: '24px' } }, 'Experience'),
        entryList('experience', [
          ['role',     'Role',     {}],
          ['org',      'Organization', {}],
          ['start',    'Start', { placeholder: '2023' }],
          ['end',      'End', { placeholder: 'present' }],
          ['location', 'Location', {}],
          ['summary',  'Summary', { long: true, placeholder: 'What you shipped, and what it changed' }],
        ], 'experience'),

        h('div', { className: 'sect-hd', style: { marginTop: '20px' } }, 'Skills'),
        entryList('skills', [
          ['name',  'Skill name', {}],
          ['area',  'Area (Code / Design / Product / …)', {}],
          ['level', 'Level (expert / proficient / learning)', {}],
        ], 'skill'),

        h('div', { className: 'sect-hd', style: { marginTop: '20px' } }, 'Education'),
        entryList('education', [
          ['school', 'School / institution', {}],
          ['degree', 'Degree', {}],
          ['field',  'Field', {}],
          ['start',  'Start', {}],
          ['end',    'End', {}],
        ], 'education'),

        h('div', { className: 'sect-hd', style: { marginTop: '20px' } }, 'Highlights'),
        highlightList(),

        /* "download resume.md" and "critique with AI" both threw the moment
           you pressed them — the export went through gone() and the critique
           raised before its first await. Two more buttons that existed only
           to fail, the same shape as the AI activity log. About me is a file
           in your vault; export it with the page Actions like anything else. */

        h('div', { className: 'sect-hd', style: { marginTop: '24px' } }, 'Notes'),
        h('textarea', {
          className: 'page-body-ta', placeholder: 'Anything that does not fit a field above.',
          value: me.body,
          onInput: (e) => { me.body = e.target.value; queueSave(); },
        }))));
  };

  SB.data().aboutMe().then((d) => { me = d; layout(); }).catch(() => {
    wrap.appendChild(EmptyState('Failed to load About Me.', 'Check the server.'));
  });
  wrap.__teardown = () => { if (dirty) commit(); };
  return wrap;
}



/* ── screen: Ask (live POST /chat) ────────────────────────────────────── */
const ASK_EXAMPLES = [
  'What have I been reading about lately?',
  'Summarize my active projects.',
  'What concepts keep recurring across my notes?',
  'Where do my notes contradict each other?',
  'What should I revisit from long-term memory?',
];
/* ── renderMarkdown ───────────────────────────────────────────────
   Tiny block + inline markdown renderer for chat output. Handles:
     - ``` fenced ``` code blocks (preserve newlines)
     - `inline code`
     - **bold** / __bold__
     - *italic* / _italic_
     - [text](url) links
     - # headings (1-3)
     - - / * unordered lists
     - 1. ordered lists
     - blockquotes (> …)
     - paragraphs (blank-line separated)
   Returns an array of DOM nodes so callers can mount it anywhere. We hand-roll
   this rather than pull a library — keeps the SPA zero-deps. */
function _escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function _inlineMarkdown(text) {
  // Escape first, then re-insert HTML for the tokens we control.
  let html = _escHtml(text);
  // Inline code — done before bold/italic so backticks aren't confused with *.
  html = html.replace(/`([^`\n]+)`/g, (_, c) => '<code>' + c + '</code>');
  // Links [label](url) — only http(s) or relative/anchor to avoid XSS.
  html = html.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
    const safe = /^(https?:|\/|#)/i.test(url) ? url : '#';
    return '<a href="' + safe + '" target="_blank" rel="noopener">' + label + '</a>';
  });
  // Bold (** or __), then italic (* or _). Order matters.
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
  html = html.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  html = html.replace(/(^|[\s(])_([^_\n]+)_/g, '$1<em>$2</em>');
  return html;
}
/* ── ProseEditor ────────────────────────────────────────────────────────
   ONE writing surface, used by every kind that holds prose.

   There were six. Three kinds (topic, markdown, project) had each grown
   their own view/edit toggle — same idea, three code paths, three different
   labels ("edit"/"done", "✎ edit", "Edit"/"Done") and three layouts. The
   other three (note default, snippet, bookmark context, about-me) had no
   rendered view at all: they were permanent mono textareas, so a bookmark's
   context — the user's own prose — sat in JetBrains Mono forever, breaking
   the system's one typographic rule that mono means machine text.

   The split that matters is preserved: the EDITOR is mono, because you are
   editing raw markdown and `##`, `-` and `[[…]]` are structure you need to
   see as characters. The VIEW is proportional, because it is prose. Toggling
   between them is the same gesture on every kind. */
function ProseEditor(opts) {
  const {
    getValue, setValue, placeholder = 'Write…',
    label = null, minHeight = 240, measure = true,
  } = opts;

  const wrap = h('div', { className: 'prose-editor' });
  const view = h('div', { className: 'md-rendered' + (measure ? '' : ' md-wide') });
  const ta = h('textarea', {
    className: 'page-body-ta md-edit-ta',
    placeholder,
    value: getValue() || '',
    style: { minHeight: minHeight + 'px' },
    onInput: (e) => { setValue(e.target.value); schedule(); },
  });

  let mode = (getValue() || '').trim() ? 'view' : 'edit';
  let timer = null;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(paint, 350); };

  async function paint() {
    const body = (getValue() || '').trim();
    clear(view);
    if (!body) {
      view.appendChild(h('div', { className: 'prose-empty' },
        'Nothing written yet.'));
      return;
    }
    try {
      const r = SB.data().renderHtml(body);
      const rendered = h('div', { html: r.html });
      await getPageIndex();
      decorateMentions(rendered);
      decorateHashtags(rendered);
      view.appendChild(rendered);
    } catch (e) {
      view.appendChild(h('div', { className: 'prose-empty' },
        'Could not render: ' + (e.message || e)));
    }
  }

  const toggle = h('button', {
    className: 'md-mode-btn',
    onClick: () => { mode = mode === 'view' ? 'edit' : 'view'; apply(); },
  });

  function apply() {
    const editing = mode === 'edit';
    wrap.classList.toggle('is-editing', editing);
    clear(toggle);
    toggle.appendChild(icon(editing ? 'check' : 'pen-line'));
    toggle.appendChild(document.createTextNode(editing ? 'Done' : 'Edit'));
    toggle.setAttribute('title', editing ? 'Finish editing' : 'Edit this text');
    if (!editing) paint(); else setTimeout(() => ta.focus(), 0);
  }

  wrap.appendChild(h('div', { className: 'prose-editor-hd' },
    label ? h('span', { className: 'prose-editor-l' }, label) : h('span'),
    toggle));
  wrap.appendChild(view);
  wrap.appendChild(ta);
  apply();
  return wrap;
}

function renderMarkdown(text) {
  if (text == null) return [];
  const raw = String(text);
  const out = [];
  // Pull fenced code blocks out first so their content isn't mangled by other rules.
  const parts = raw.split(/(```[\s\S]*?```)/g);
  for (const part of parts) {
    if (part.startsWith('```')) {
      const inner = part.slice(3, -3).replace(/^[A-Za-z0-9_+\-]*\n/, '');  // strip optional language tag
      out.push(h('pre', { className: 'md-pre' }, h('code', null, inner.replace(/\n$/, ''))));
      continue;
    }
    // Split into block-level chunks on blank lines.
    const blocks = part.split(/\n{2,}/);
    for (let block of blocks) {
      block = block.replace(/\n+$/, '');
      if (!block.trim()) continue;
      const lines = block.split('\n');

      // Heading: # / ## / ### (only treat top-of-block lines)
      const hMatch = /^(#{1,3})\s+(.+)$/.exec(lines[0]);
      if (hMatch && lines.length === 1) {
        const level = hMatch[1].length;
        const tag = 'h' + (level + 1);  // h1→h2, h2→h3 to avoid clashing with page H1
        const el = document.createElement(tag);
        el.className = 'md-h md-h' + level;
        el.innerHTML = _inlineMarkdown(hMatch[2]);
        out.push(el);
        continue;
      }

      // Blockquote
      if (lines.every((l) => l.startsWith('>'))) {
        const inner = lines.map((l) => l.replace(/^>\s?/, '')).join('\n');
        const bq = document.createElement('blockquote');
        bq.className = 'md-quote';
        bq.innerHTML = _inlineMarkdown(inner).replace(/\n/g, '<br>');
        out.push(bq);
        continue;
      }

      // Unordered list
      if (lines.every((l) => /^[\-*+]\s+/.test(l))) {
        const ul = document.createElement('ul');
        ul.className = 'md-list';
        for (const l of lines) {
          const li = document.createElement('li');
          li.innerHTML = _inlineMarkdown(l.replace(/^[\-*+]\s+/, ''));
          ul.appendChild(li);
        }
        out.push(ul);
        continue;
      }

      // Ordered list
      if (lines.every((l) => /^\d+\.\s+/.test(l))) {
        const ol = document.createElement('ol');
        ol.className = 'md-list';
        for (const l of lines) {
          const li = document.createElement('li');
          li.innerHTML = _inlineMarkdown(l.replace(/^\d+\.\s+/, ''));
          ol.appendChild(li);
        }
        out.push(ol);
        continue;
      }

      // Default: paragraph with inline markdown + <br> for soft line breaks
      const p = document.createElement('p');
      p.className = 'md-p';
      p.innerHTML = _inlineMarkdown(lines.join(' \n')).replace(/\s*\n/g, '<br>');
      out.push(p);
    }
  }
  return out;
}




/* ── screen: Projects (containers — group anything under one project) ── */
function ProjectsScreen() {
  const wrap = h('div', { className: 'screen sb-pane projects-screen' });
  let projects = [];
  let busy = true;
  let counts = {};      // projectId → number of pages mentioning it

  async function load() {
    busy = true; layout();
    try {
      // `project` is not a kind — asking for one returned nothing, forever.
      // A project is a folder under `projects/` with a `<name>/<name>.md`
      // folder note, so the vault derives them from the tree.
      const data = await SB.data().projects();
      projects = data.items || [];
      projects.forEach((p) => { counts[p.id] = p.memberCount; });
    } catch (_) { projects = []; }
    busy = false;
    layout();
  }

  /* Opens the app's own picker, pre-stepped to the project-name field, rather
     than a browser prompt(). prompt() cannot be themed, cannot be styled, and
     drops the user into an OS dialog in the middle of an app that has spent
     some effort looking like itself. */
  function newProject() {
    app.createOpen = 'project';
    render();
  }

  /* Status order is the hierarchy. A project list exists to answer "what am I
     actually working on", and a flat alphabetical grid answers it worst —
     a shipped project from last year sat at the same weight as the live one. */
  const PJ_STATUS = [
    ['active',   'Active'],
    ['planning', 'Planning'],
    ['paused',   'Paused'],
    ['',         'No status'],
    ['shipped',  'Shipped'],
    ['archived', 'Archived'],
  ];

  // The excerpt is raw markdown, so `**Where it is:**` was leaking into the
  // card. This is a summary, not a document — strip the syntax rather than
  // render it.
  function plainExcerpt(md, max) {
    return String(md || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!?\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, '$1')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/[*_`>]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
  }

  function projectCard(p) {
    const meta = p.meta || {};
    const status = String(meta.status || '');
    const when = (meta.start_date || meta.end_date)
      ? (meta.start_date ? 'Started ' + meta.start_date : 'Ends ' + meta.end_date)
        + (meta.start_date && !meta.end_date ? ' · ongoing' : '')
        + (meta.end_date && meta.start_date ? ' · ended ' + meta.end_date : '')
      : null;
    const desc = plainExcerpt(p.excerpt, 150);
    return h('div', {
      className: 'project-card' + (status ? ' pj-is-' + status : ''),
      onClick: (e) => {
        if (e.metaKey || e.ctrlKey) { newTab('page', p.id, { switchTo: true }); return; }
        const t = activeTab();
        if (t) { t.parentRoute = 'projects'; persistTabs(); }
        openPage(p.id);
      },
    },
      h('div', { className: 'project-card-hd' },
        h('span', { className: 'project-card-glyph' }, icon('folder')),
        h('div', { className: 'project-card-name' }, p.title || p.slug || 'Untitled project'),
        status
          ? h('span', { className: 'pj-status pj-status-' + status },
              h('span', { className: 'pj-status-dot' }), status)
          : null),
      // Clamped to two lines, so the whole thing lives in the tooltip —
      // truncation the reader cannot get past is just missing text.
      h('div', { className: 'project-card-desc' + (desc ? '' : ' dim'),
        title: desc || '' }, desc || 'No description yet.'),
      h('div', { className: 'project-card-meta' },
        h('span', { 'data-pjcount': p.id },
          counts[p.id] != null
            ? (nOf(counts[p.id], 'page') + ' inside')
            : 'counting…'),
        when ? h('span', { className: 'project-card-when' }, when) : null));
  }

  function projectGroups(items) {
    const by = {};
    items.forEach((p) => {
      const k = String((p.meta || {}).status || '');
      (by[k] = by[k] || []).push(p);
    });
    return PJ_STATUS
      .filter(([k]) => by[k] && by[k].length)
      .map(([k, label]) => ({ key: k, label, items: by[k] }));
  }

  function layout() {
    clear(wrap);
    const headerRow = h('div', { className: 'projects-hd' },
      h('div', null,
        h('h1', null, 'Projects'),
        h('p', { className: 'sb-sub' },
          busy ? 'loading…' : projects.length === 0
            ? 'no projects yet — projects are containers; create one and drop topics / canvases under it'
            : nOf(projects.length, 'project'))),
      h('div', { className: 'sb-row' },
        h('button', { className: 'sb-primary', onClick: newProject }, '+ new project')));

    append(wrap, [
      headerRow,
      busy
        ? h('div', { className: 'sb-meta' }, 'loading projects…')
        : (projects.length === 0
            ? EmptyState('No projects yet.',
                'Click "+ new project" to create one. Inside it you can attach topics, canvases — anything.')
            : h('div', { className: 'projects-groups' },
                projectGroups(projects).map((g, _i, all) => h('div', { className: 'pj-group-sec' },
                  // With one group the header is noise — and a one-project
                  // vault opened to a heading reading "No status", which
                  // lands as nagging rather than as structure.
                  all.length > 1 ? h('div', { className: 'sect-hd' },
                    h('span', null, g.label),
                    h('span', { className: 'sect-hd-c' }, String(g.items.length))) : null,
                  h('div', { className: 'projects-grid' }, g.items.map(projectCard)))))),
    ]);
  }

  load();
  return wrap;
}




/* ── app root (v2) ────────────────────────────────────────────────────── */
// Light is the default, not System. System is the more fashionable default,
// but it means anyone whose OS is dark never sees the theme this app was
// designed around — and light IS the design here. System stays one click away
// for people who want it.
const TWEAK_DEFAULTS = { theme: 'light', density: 'cozy' };
function _newTabId() {
  return 'tab-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

const app = {
  t: { ...TWEAK_DEFAULTS },
  // ── Tabs (Notion-style multi-tab work surface) ────────────────────────
  // app.route + app.openPageId mirror the *active* tab so existing code can
  // keep reading those two fields. Tab switches sync them.
  tabs: [{ id: 'tab-init', route: 'home', openPageId: null }],
  activeTabId: 'tab-init',
  route: 'home',                // home | pages | page | ask | graph | kind:<k> | …
  search: '',
  searchOpen: false,            // command-palette / quick-search modal
  openPageId: null,             // id of currently-open v2 page
  pendingFilter: null,
  kindCounts: {},
  recentPages: [],
  listCache: { kind: null, pages: [], stale: true },
  offline: false,
  loaded: false,
  createOpen: false,
  lastSynced: '',               // surfaced in sidebar footer
  navW: (() => { try { return Number(localStorage.getItem('sb.navW')) || 244; } catch (_) { return 244; } })(),
  navCollapsed: (() => { try { return localStorage.getItem('sb.navCollapsed') === '1'; } catch (_) { return false; } })(),
};
let currentMain = null;
const root = document.getElementById('root');

// The sidebar width is a live CSS variable rather than a constant baked into
// the grid templates, so dragging it costs one custom-property write and no
// re-render. Collapsing is a separate attribute: it swaps to an icon rail
// rather than animating the width to zero, because a 0px column would take
// the nav's borders and focus targets with it.
function applyNavW() {
  document.documentElement.style.setProperty('--nav-w', (app.navW || 244) + 'px');
}
function setNavCollapsed(v) {
  app.navCollapsed = !!v;
  try { localStorage.setItem('sb.navCollapsed', app.navCollapsed ? '1' : '0'); } catch (_) {}
  const el = document.querySelector('.app');
  if (el) el.setAttribute('data-nav', app.navCollapsed ? 'collapsed' : 'open');
}
function startNavResize(e, handle) {
  e.preventDefault();
  if (app.navCollapsed) return;
  const min = 190;
  const max = Math.min(420, Math.round(window.innerWidth * 0.4));
  handle.classList.add('dragging');
  document.body.classList.add('col-resizing');
  const onMove = (ev) => {
    app.navW = Math.max(min, Math.min(max, ev.clientX));
    applyNavW();
  };
  const onUp = () => {
    handle.classList.remove('dragging');
    document.body.classList.remove('col-resizing');
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    try { localStorage.setItem('sb.navW', String(app.navW)); } catch (_) {}
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}
/* The single writer for look-and-feel preferences.
   There used to be two: this one, which updated `app.t` in memory, and the
   Settings screen, which wrote localStorage. So a mode chosen from the
   sidebar looked applied and then vanished on reload, while the same choice
   made two clicks away in Settings stuck. Both now go through here, and
   `sb.prefs` is the one store. */
function setTweak(key, val) {
  app.t = { ...app.t, [key]: val };
  if (key === 'theme' || key === 'density') {
    applyHtmlAttrs();
    try {
      const p = loadPrefs();
      p[key] = val;
      savePrefs(p);
    } catch (_) { /* private mode / quota — the choice still applies for the session */ }
  }
  render();
}
/* ── Colour modes ───────────────────────────────────────────────────────
   Four palettes across two families, plus System. `swatch` is the pair the
   picker paints — page colour and ink — so the control shows you the actual
   mode rather than naming it and hoping.

   Adding a fifth is six CSS lines and one row here; see DESIGN.md. */
const THEMES = [
  { id: 'system',   label: 'System',   family: null,   swatch: null },
  { id: 'light',    label: 'Light',    family: 'light', swatch: ['#faf9f8', '#1c1917'] },
  { id: 'sepia',    label: 'Sepia',    family: 'light', swatch: ['#f2e9d8', '#1f1a12'] },
  { id: 'dark',     label: 'Dark',     family: 'dark',  swatch: ['#09090b', '#fafafa'] },
  { id: 'midnight', label: 'Midnight', family: 'dark',  swatch: ['#0b1020', '#f5f7fa'] },
];
const THEME_IDS = THEMES.map((t) => t.id);

/* "System" is a preference, not a theme — it has to resolve to a real one at
   paint time, and re-resolve when the OS flips while the app is open. */
function prefersDark() {
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches; }
  catch (_) { return false; }
}
function resolveTheme(pref) {
  if (pref === 'system' || !pref) return prefersDark() ? 'dark' : 'light';
  return THEME_IDS.includes(pref) ? pref : 'light';
}
/* Four modes, two families. Anything asking "is this a dark surface?" — a
   vendored editor with its own two-value theme, an embedded document — has to
   ask this, not compare against the string 'light', or Sepia comes out dark. */
function themeFamily() {
  const t = THEMES.find((x) => x.id === document.documentElement.getAttribute('data-theme'));
  return (t && t.family) || (prefersDark() ? 'dark' : 'light');
}
try {
  window.matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => { if (app.t.theme === 'system') applyHtmlAttrs(); });
} catch (_) {}

function applyHtmlAttrs() {
  const resolved = resolveTheme(app.t.theme);
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.setAttribute('data-density', app.t.density || 'cozy');
  // Keep the browser chrome in step with the mode — otherwise the address bar
  // stays light while the app is midnight.
  const meta = THEMES.find((t) => t.id === resolved);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  if (meta && meta.swatch) {
    const m = document.createElement('meta');
    m.setAttribute('name', 'theme-color');
    m.setAttribute('content', meta.swatch[0]);
    document.head.appendChild(m);
  }
}
/* ── Hash-based routing ─────────────────────────────────────────────
   URL format:
     #home              → home
     #pages             → all pages
     #kind:canvas       → kind tab
     #page/<id>         → a specific page
     #ask               → ask widget
     #graph / #about-me / #mention-tags / #import
   We use hashes so the SPA works without any server-side rewrite. */
function routeToHash(r, openPageId) {
  if (r === 'page' && openPageId) return '#page/' + openPageId;
  return '#' + r;
}
function hashToRoute(hash) {
  const h = (hash || '').replace(/^#/, '');
  if (!h) return { route: 'home', openPageId: null };
  if (h.startsWith('page/')) return { route: 'page', openPageId: h.slice(5) };
  return { route: h, openPageId: null };
}

// ── Tab helpers ──────────────────────────────────────────────────────────
// Tabs are persisted to localStorage so a reload restores your work surface.
// All routing (setRoute, openPage, popstate) keeps the active tab in sync.
function activeTab() {
  return app.tabs.find((t) => t.id === app.activeTabId) || app.tabs[0];
}

function persistTabs() {
  try {
    localStorage.setItem('sb.tabs', JSON.stringify({
      tabs: app.tabs.map((t) => ({
        id: t.id, route: t.route, openPageId: t.openPageId,
        parentRoute: t.parentRoute || null,
        title: t.title || null,
      })),
      activeTabId: app.activeTabId,
    }));
  } catch (_) {}
}

function loadTabs() {
  try {
    const raw = localStorage.getItem('sb.tabs');
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (!s || !Array.isArray(s.tabs) || s.tabs.length === 0) return false;
    // Sanitize: keep only well-formed records.
    const clean = s.tabs.filter((t) => t && t.id && typeof t.route === 'string');
    if (clean.length === 0) return false;
    app.tabs = clean;
    app.activeTabId = s.activeTabId && clean.find((t) => t.id === s.activeTabId)
      ? s.activeTabId
      : clean[0].id;
    const t = activeTab();
    app.route = t.route;
    app.openPageId = t.openPageId;
    return true;
  } catch (_) { return false; }
}

function tabLabel(t) {
  if (t.route === 'page' && t.openPageId) {
    // Recorded on the tab by noteTabTitle, so it survives a reload and an
    // evicted cache. The cache is the fallback; the ULID is the last resort.
    if (t.title) return t.title;
    const cached = (typeof cacheGetPage === 'function') ? cacheGetPage(t.openPageId) : null;
    if (cached && (cached.title || cached.slug)) return cached.title || cached.slug;
    return 'Page · ' + t.openPageId.slice(0, 6);
  }
  const r = t.route;
  if (r === 'home') return 'Home';
  if (r === 'pages') return 'All pages';
  if (r === 'about-me') return 'About me';
  if (r === 'tags') return 'Tags';
  if (r === 'projects') return 'Projects';
  if (r.startsWith('kind:')) {
    const k = r.slice(5);
    return (KIND_META[k] && KIND_META[k].label) || k;
  }
  if (r.startsWith('tag:')) return '#' + r.slice(4);
  if (r.startsWith('mention:')) return '@' + r.slice(8);
  return r;
}

function newTab(route, openPageId, opts) {
  opts = opts || {};
  const t = { id: _newTabId(), route: route || 'home', openPageId: openPageId || null };
  app.tabs.push(t);
  if (opts.switchTo !== false) {
    app.activeTabId = t.id;
    app.route = t.route;
    app.openPageId = t.openPageId;
  }
  persistTabs();
  if (opts.switchTo !== false) {
    pushHash(t.route, t.openPageId);
    render();
  }
  return t;
}

function closeTab(id) {
  const idx = app.tabs.findIndex((t) => t.id === id);
  if (idx < 0) return;
  app.tabs.splice(idx, 1);
  if (app.tabs.length === 0) {
    app.tabs.push({ id: _newTabId(), route: 'home', openPageId: null });
  }
  if (app.activeTabId === id) {
    const next = app.tabs[Math.max(0, idx - 1)] || app.tabs[0];
    app.activeTabId = next.id;
    app.route = next.route;
    app.openPageId = next.openPageId;
    pushHash(next.route, next.openPageId);
  }
  persistTabs();
  render();
}

function switchTab(id) {
  const t = app.tabs.find((x) => x.id === id);
  if (!t) return;
  app.activeTabId = id;
  app.route = t.route;
  app.openPageId = t.openPageId;
  persistTabs();
  pushHash(t.route, t.openPageId);
  render();
}

function _syncActiveTab() {
  const t = activeTab();
  if (!t) return;
  t.route = app.route;
  // The recorded name belongs to the page that was open. Point the tab
  // somewhere else and the name has to go with it, or the strip lies.
  if (t.openPageId !== app.openPageId) t.title = null;
  t.openPageId = app.openPageId;
  persistTabs();
}
let _suppressHashPush = false;
function setRoute(r) {
  app.route = r;
  // setRoute always clears openPageId — switching screens unloads the page view.
  // (openPage() handles the page-detail case and sets openPageId itself.)
  if (r !== 'page') app.openPageId = null;
  _syncActiveTab();
  if (r.startsWith('kind:')) app.listCache.stale = true;
  if (r === 'pages') app.listCache.stale = true;
  if (r === 'home') {
    Promise.all([refreshCounts(), refreshRecent()]).then(render);
  }
  pushHash(r, app.openPageId);
  render();
}
function pushHash(r, openPageId) {
  if (_suppressHashPush) return;
  const target = routeToHash(r, openPageId);
  if (location.hash !== target) history.pushState({ r, openPageId }, '', target);
}
window.addEventListener('popstate', () => {
  _suppressHashPush = true;
  try {
    const { route, openPageId } = hashToRoute(location.hash);
    app.route = route;
    app.openPageId = openPageId;
    _syncActiveTab();
    if (route === 'home') Promise.all([refreshCounts(), refreshRecent()]).then(render);
    render();
  } finally { _suppressHashPush = false; }
});
function submitSearch(q) {
  // 'ask' was one of the screens the migration removed, and nothing renders it,
  // so Enter used to drop the user on the dashboard under an `~/ask` crumb with
  // no explanation. Search now opens the full list filtered by what was typed.
  app.pendingFilter = q;
  setRoute('pages');
}

function openPage(id, opts) {
  opts = opts || {};
  // Cmd / Ctrl click → open the page in a new tab without disturbing this one.
  if (opts.newTab) {
    newTab('page', id, { switchTo: true });
    return;
  }
  // Capture the route we're navigating *from* before we overwrite app.route.
  // Page → page navigation (clicking a [[wikilink]] inside an open page)
  // keeps the existing parentRoute — we want crumbs to still point at the
  // list view, not at the previous page.
  const fromRoute = app.route;
  if (fromRoute && fromRoute !== 'page') app._returnRoute = fromRoute;
  app.openPageId = id;
  app.route = 'page';
  const t = activeTab();
  if (t) {
    t.route = 'page';
    if (t.openPageId !== id) t.title = null;
    t.openPageId = id;
    if (fromRoute && fromRoute !== 'page') t.parentRoute = fromRoute;
    persistTabs();
  }
  pushHash('page', id);
  render();
}

function _fmtTimeAgo() {
  const d = new Date();
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

async function refreshCounts() {
  try {
    const { counts } = SB.data().counts();
    app.kindCounts = counts || {};
    // The true page count, for the sidebar header. Summing the by-kind
    // counts double-counts bookmarks, which are notes with a url rather
    // than a kind of their own.
    try {
      const all = SB.data().pages({ limit: 5000 });
      const items = (all && all.items) || [];
      app.stats = { pages_total: items.length };
    } catch (_) {}
    app.lastSynced = _fmtTimeAgo();
  } catch (_) {}
}
async function refreshRecent() {
  try {
    const { items } = SB.data().pages({ limit: 12 });
    app.recentPages = items || [];
    // Seed page cache so clicking a recent tile is instant.
    (items || []).forEach((p) => cacheSetPage(p));
  } catch (_) {}
}

async function createPage(kind, name) {
  app.createOpen = false;
  try {
    // A project is a folder, not a kind, so it takes a different call — but
    // that is the data layer's business, not the picker's. From the user's
    // side it is one more thing you can create.
    const p = kind === 'project'
      ? await SB.data().createProject(name)
      : await SB.data().createPage({ kind, title: '', body: '' });
    if (p && p.ok === false) throw new Error(p.message || p.reason || 'refused');
    if (!p || !p.id) throw new Error('no page id came back — ' + JSON.stringify(p).slice(0, 180));
    invalidatePageIndex();
    cacheSetPage(p);
    await refreshCounts();
    openPage(p.id);
  } catch (e) {
    toast('Could not create that — ' + e.message, { tone: 'error' });
    render();
  }
}

// Work mode is project-first: the entry point is creating a project, which
// opens as a workspace where IA / flows / screens / components / tokens are

// Render a label for the parent-route portion of a page crumb chain.
// Returns the array of intermediate crumbs (between `~` and the page title).
function _parentCrumbsFor(parent) {
  if (!parent || parent === 'pages' || parent === 'home') {
    return [{ label: 'pages', route: 'pages' }];
  }
  if (parent === 'projects') {
    return [{ label: 'projects', route: 'projects' }];
  }
  if (parent && parent.startsWith('project:')) {
    // page that lives inside a specific project — show the project's title
    const projectId = parent.slice(8);
    const cached = (typeof cacheGetPage === 'function') ? cacheGetPage(projectId) : null;
    const label = (cached && (cached.title || cached.slug)) || 'project';
    return [
      { label: 'projects', route: 'projects' },
      { label, route: 'page', openPageId: projectId },
    ];
  }
  if (parent.startsWith('kind:')) {
    return [
      { label: 'pages', route: 'pages' },
      { label: parent.slice(5), route: parent },
    ];
  }
  if (parent.startsWith('tag:')) {
    return [
      { label: 'tags', route: 'tags' },
      { label: '#' + parent.slice(4), route: parent },
    ];
  }
  if (parent === 'tags') return [{ label: 'tags', route: 'tags' }];
  if (parent.startsWith('mention:')) {
    return [
      { label: 'mention tags', route: 'mention-tags' },
      { label: '@' + parent.slice(8), route: parent },
    ];
  }
  if (parent === 'mention-tags') return [{ label: 'mention tags', route: 'mention-tags' }];
  return null;
}

/* A breadcrumb is a containment claim, not a history trail. Only these routes
   are places a page can be *in*; arriving from anywhere else — Settings, About
   me, the dashboard — used to be reported as "settings / Bindery", which says
   the page lives in Settings. */
function routeContainsPages(r) {
  // `tag:x` lists pages; `tags` lists tags. Only the first is somewhere a page
  // can be. Same for `mention:` versus `mention-tags`.
  return !!r && (r === 'pages' || r === 'projects' || r.startsWith('project:')
    || r.startsWith('kind:') || r.startsWith('tag:') || r.startsWith('mention:'));
}

/* Where the page actually lives, for when the route you came from cannot say. */
function containerRouteOf(p) {
  if (!p) return 'pages';
  if (/^projects\/[^/]+\//.test(String(p.path || ''))) return 'projects';
  const m = metaForPage(p);
  const k = (m === KIND_META.bookmark) ? 'bookmark' : p.kind;
  return KIND_ORDER.includes(k) ? 'kind:' + k : 'pages';
}

function crumbsFor(route) {
  const home = { label: '~', route: 'home' };
  if (route === 'home') return [home, 'home'];
  if (route === 'pages') return [home, 'pages'];
  if (route === 'projects') return [home, 'projects'];
  if (route === 'settings') return [home, 'settings'];
  if (route === 'page') {
    // Build chain: ~ / <parent-chain> / <page title>
    const t = activeTab();
    // Resolve the page title from cache when we have it; fall back to the
    // id prefix and let V2PageView patch the DOM once it loads.
    const cached = (typeof cacheGetPage === 'function' && app.openPageId)
      ? cacheGetPage(app.openPageId) : null;
    const recorded = t && t.parentRoute;
    const parent = routeContainsPages(recorded) ? recorded : containerRouteOf(cached);
    const chain = [home, ...(_parentCrumbsFor(parent) || _parentCrumbsFor('pages'))];
    const title = (cached && (cached.title || cached.slug)) ||
                  (app.openPageId ? app.openPageId.slice(0, 8) + '…' : '?');
    chain.push(title);
    return chain;
  }
  if (route.startsWith('kind:')) {
    return [home, { label: 'pages', route: 'pages' }, route.slice(5)];
  }
  if (route === 'tags') return [home, 'tags'];
  if (route.startsWith('tag:')) {
    return [home, { label: 'tags', route: 'tags' }, '#' + route.slice(4)];
  }
  if (route === 'mention-tags') return [home, 'mention tags'];
  if (route.startsWith('mention:')) {
    return [home, { label: 'mention tags', route: 'mention-tags' }, '@' + route.slice(8)];
  }
  return [home, route];
}

// Settings — model / provider / API keys (with env-lock awareness) + a
// copy-paste MCP connect panel. Talks to /api/v2/settings*. Model save/layout
// pattern mirrors AboutMeScreen.
/* ── Settings (6.17) ───────────────────────────────────────────────
   Everything server-shaped is gone: model, provider, MCP, storage backend and
   API token had a backend to talk to and no longer do. What is left is genuinely
   local preference, and it is stored in localStorage — never in the vault, because
   the vault belongs equally to Obsidian and to your agent, and neither of them
   should have to read this app's UI state. */
const SB_PREFS_KEY = 'sb.prefs';
const SB_PREF_DEFAULTS = {
  theme: 'light',
  density: 'cozy',
  historyKeep: 10,
  obsidianVault: '',       // blank = derive from the picked folder
  thumbCacheOn: true,
};
function loadPrefs() {
  try {
    return { ...SB_PREF_DEFAULTS, ...JSON.parse(localStorage.getItem(SB_PREFS_KEY) || '{}') };
  } catch (_) { return { ...SB_PREF_DEFAULTS }; }
}
function savePrefs(p) {
  try { localStorage.setItem(SB_PREFS_KEY, JSON.stringify(p)); } catch (_) {}
  if (window.SB_VAULT) window.SB_VAULT.historyKeep = p.historyKeep;
}

function SettingsScreen() {
  const wrap = h('div', { className: 'screen settings' });
  let prefs = loadPrefs();

  const section = (title, sub, ...rows) => h('div', { className: 'set-sec' },
    h('div', { className: 'set-sec-hd' }, h('b', null, title),
      sub ? h('span', { className: 'set-sec-sub' }, sub) : null),
    ...rows);

  // Every settings row is built here, so the label association is made here
  // too — a row's text is its control's name, and a screen reader had no way
  // to know that from a sibling <div>. The hint becomes the description.
  const row = (label, hint, control) => {
    const native = control && /^(INPUT|SELECT|TEXTAREA)$/.test(control.tagName || '');
    // A radiogroup cannot be the target of `for`; it takes aria-labelledby.
    const group = !native && control && control.getAttribute
      && control.getAttribute('role') === 'radiogroup';
    if ((native || group) && !control.id) control.id = 'set-' + (++row._n);
    const hintEl = hint ? h('div', { className: 'set-row-hint' }, hint) : null;
    if ((native || group) && hintEl) {
      hintEl.id = control.id + '-hint';
      control.setAttribute('aria-describedby', hintEl.id);
    }
    const labelEl = h(native ? 'label' : 'div',
      native ? { className: 'set-row-label', for: control.id }
             : { className: 'set-row-label' },
      label);
    if (group) {
      labelEl.id = control.id + '-label';
      control.setAttribute('aria-labelledby', labelEl.id);
      control.removeAttribute('aria-label');   // the visible label is the name
    }
    return h('div', { className: 'set-row' },
      h('div', { className: 'set-row-l' }, labelEl, hintEl),
      h('div', { className: 'set-row-c' }, control));
  };
  row._n = 0;

  /* Options take `[value, label]` pairs. They used to be bare strings used as
     both, so the one screen where you choose your colour mode offered
     "midnight" and "cozy" in lowercase while the swatch row two panels away
     called them Midnight and Cozy. */
  const select = (key, options) => h('select', {
    className: 'set-input',
    onChange: (e) => { prefs[key] = e.target.value; savePrefs(prefs); applyHtmlAttrs2(); },
  }, options.map(([v, l]) => h('option', { value: v, selected: prefs[key] === v }, l)));

  function applyHtmlAttrs2() {
    document.documentElement.setAttribute('data-theme', prefs.theme);
    document.documentElement.setAttribute('data-density', prefs.density);
    app.t.theme = prefs.theme; app.t.density = prefs.density;
  }

  const vaultName = window.SB_VAULT_NAME || '(not connected)';

  wrap.appendChild(h('div', { className: 'screen-hd' },
    h('h1', null, 'Settings'),
    h('div', { className: 'screen-sub' },
      'Local preferences only. Nothing here is written into your vault.')));

  wrap.appendChild(section('Vault', 'the folder this app reads and writes',
    row('Connected folder', vaultName === '(not connected)'
        ? 'No folder connected yet.' : 'Everything stays on your disk.',
      h('button', {
        className: 'btn', onClick: () => location.reload(),
      }, vaultName === '(not connected)' ? 'connect…' : 'reconnect')),
    row('Obsidian vault name',
      'Used for obsidian:// deep links. Blank derives it from the folder you picked.',
      h('input', {
        className: 'set-input', value: prefs.obsidianVault,
        placeholder: vaultName,
        onInput: (e) => {
          prefs.obsidianVault = e.target.value.trim();
          savePrefs(prefs);
          window.SB_VAULT_NAME = prefs.obsidianVault || window.SB_VAULT_NAME;
        },
      }))));

  wrap.appendChild(section('Appearance', null,
    // The swatch row, not a dropdown: the chip paints the mode's own page and
    // ink, so the control answers "what will this look like" instead of
    // naming it and hoping. System is the split chip.
    row('Colour mode', 'System follows your operating system.', ThemePicker()),
    row('Density', null, select('density',
      [['compact', 'Compact'], ['cozy', 'Cozy'], ['comfortable', 'Comfortable']]))));

  wrap.appendChild(section('Write safety', 'how much undo the app keeps for you',
    row('History snapshots per page',
      'Kept in .history/ beside your notes. Older ones are pruned.',
      h('input', {
        className: 'set-input', type: 'number', min: '1', max: '50',
        value: String(prefs.historyKeep),
        onInput: (e) => {
          const n = Math.max(1, Math.min(50, parseInt(e.target.value, 10) || 10));
          prefs.historyKeep = n; savePrefs(prefs);
        },
      }))));

  wrap.appendChild(section('Images', 'thumbnails live in the browser, not the vault',
    row('Cache thumbnails', 'Speeds up the inspo grid. Never writes a file.',
      h('input', {
        type: 'checkbox', checked: prefs.thumbCacheOn,
        onChange: (e) => { prefs.thumbCacheOn = e.target.checked; savePrefs(prefs); },
      })),
    row('Clear thumbnail cache', 'Frees browser storage. Images are re-read from disk.',
      h('button', {
        className: 'btn', onClick: async () => {
          try {
            if (window.indexedDB && indexedDB.deleteDatabase) indexedDB.deleteDatabase('sb-thumbs');
            toast('Thumbnail cache cleared');
          } catch (e) { toast('Could not clear the cache — ' + e.message, { tone: 'error' }); }
        },
      }, 'clear'))));

  applyHtmlAttrs2();
  return wrap;
}

function buildMain() {
  const r = app.route;
  if (r === 'home') {
    return V2Home(app, openPage, () => { app.createOpen = true; render(); }, (k) => setRoute('kind:' + k));
  }
  if (r === 'pages' || r.startsWith('kind:')) {
    const kind = r.startsWith('kind:') ? r.slice(5) : null;
    const wrap = h('div', { className: 'screen' });
    wrap.appendChild(h('div', { className: 'loading-stub' }, 'loading…'));
    const path = '/pages?limit=200' + (kind ? '&kind=' + encodeURIComponent(kind) : '');
    Promise.resolve(SB.data().pages(pathToQuery(path))).then(({ items }) => {
      // Seed the page cache — list_pages already returns full PageOut, so
      // clicking a row should not require another round trip.
      (items || []).forEach((p) => cacheSetPage(p));
      clear(wrap);
      const view = V2PagesList(kind, items || [], openPage,
        () => { kind ? createPage(kind) : (app.createOpen = true, render()); });
      while (view.firstChild) wrap.appendChild(view.firstChild);
      // copy className additions
      wrap.className = view.className;
    }).catch((e) => {
      clear(wrap);
      wrap.appendChild(EmptyState('Failed to load.', String(e.message)));
    });
    return wrap;
  }
  if (r === 'page') {
    if (!app.openPageId) return EmptyState('No page selected.', 'Pick one from a list.');
    return V2PageView(app.openPageId,
      async (patched) => { await refreshCounts(); /* keep nav counts in sync */ },
      async () => {
        // Return to wherever we came from — usually the list filter the user
        // was browsing (kind:canvas, tags, etc.). Falls back to 'pages'.
        const back = app._returnRoute || 'pages';
        app._returnRoute = null;
        app.openPageId = null;
        setRoute(back);
        await refreshCounts();
      });
  }
  if (r === 'projects') return ProjectsScreen();
  if (r === 'about-me') return AboutMeScreen();
  if (r === 'settings') return SettingsScreen();
  if (r === 'tags') return TagsIndexScreen();
  if (r.startsWith('tag:')) return TagFilterScreen(r.slice(4));
  if (r.startsWith('mention:')) return MentionFilterScreen(r.slice(8));
  return V2Home(app, openPage, () => { app.createOpen = true; render(); }, (k) => setRoute('kind:' + k));
}

function render() {
  if (currentMain && currentMain.__teardown) currentMain.__teardown();
  applyNavW();
  clear(root);
  markSettled();
  const appEl = h('div', { className: 'app app-tabs',
    'data-log': 'hidden',
    'data-nav': app.navCollapsed ? 'collapsed' : 'open' });
  const openSearch = () => { app.searchOpen = true; render(); };
  const closeSearch = () => { app.searchOpen = false; render(); };

  // Top: tabs + breadcrumbs span the full width above sidebar + main.
  appEl.appendChild(TabBar(
    app.tabs, app.activeTabId,
    switchTab, closeTab,
    () => newTab('home', null, { switchTo: true }),
  ));
  appEl.appendChild(BreadcrumbRow(crumbsFor(app.route)));

  // Sidebar (search icon up top, status + settings at bottom).
  appEl.appendChild(Sidebar(
    app.route, setRoute, app.kindCounts,
    () => { app.createOpen = true; render(); },
    app.offline,
    app.lastSynced,
  ));

  currentMain = buildMain();
  appEl.appendChild(h('div', { className: 'main' }, currentMain));

  if (app.createOpen) appEl.appendChild(CreateModal(app.createOpen, createPage, () => { app.createOpen = false; render(); }));
  if (app.searchOpen) appEl.appendChild(SearchPanel(closeSearch));
  root.appendChild(appEl);
}

// Keep our `body.canvas-fullscreen` class synced with the browser's real
// fullscreen state. Pressing Esc to exit OS fullscreen also exits our
// in-page fullscreen, and vice-versa.
function _syncCanvasFullscreen() {
  const inOsFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  // Only sync DOWN: leaving OS fullscreen also clears our class. We don't
  // force ENTERING OS fullscreen when the user toggles in-page (that path
  // is the click-handler's job, since requestFullscreen needs a gesture).
  if (!inOsFs && app.canvasFullscreen) {
    app.canvasFullscreen = false;
    document.body.classList.remove('canvas-fullscreen');
  }
}
document.addEventListener('fullscreenchange', _syncCanvasFullscreen);
document.addEventListener('webkitfullscreenchange', _syncCanvasFullscreen);

/* Arrow-key movement within a list.
   Every row is focusable now, but walking a fifty-row table by Tab is a
   chore — Tab is for moving between regions, arrows are for moving within
   one. This deliberately does NOT reintroduce single-letter navigation
   (removed because it hijacked typing): arrows only act when focus is
   already on a row, and never inside a field. */
const ROW_SEL = '.pages-row, .list-row, .board-card, .bento-tile, .project-card, .obs-member, .side-link';
window.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const act = document.activeElement;
  if (!act || !act.matches || !act.matches(ROW_SEL)) return;
  const rows = [...document.querySelectorAll(ROW_SEL)].filter((n) => n.offsetParent);
  const i = rows.indexOf(act);
  if (i < 0) return;
  const next = rows[i + (e.key === 'ArrowDown' ? 1 : -1)];
  if (!next) return;
  e.preventDefault();
  next.focus();
  next.scrollIntoView({ block: 'nearest' });
}, true);

window.addEventListener('keydown', (e) => {
  // ⌘K / Ctrl-K focuses the always-visible search in the top bar.
  if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault();
    const el = document.querySelector('.tab-search-input');
    if (el) { el.focus(); el.select(); }
    return;
  }
  // ⌘T / Ctrl-T opens a new tab.
  if ((e.metaKey || e.ctrlKey) && (e.key === 't' || e.key === 'T')) {
    e.preventDefault();
    newTab('home', null, { switchTo: true });
    return;
  }
  // ⌘W / Ctrl-W closes the active tab.
  if ((e.metaKey || e.ctrlKey) && (e.key === 'w' || e.key === 'W')) {
    e.preventDefault();
    closeTab(app.activeTabId);
    return;
  }
  // ⌘N / Ctrl-N opens the create picker. Capture is the one primary action in
  // the app, and reaching it meant travelling to the sidebar every time —
  // which is a long way to go for the thing you do most.
  if ((e.metaKey || e.ctrlKey) && (e.key === 'n' || e.key === 'N')) {
    e.preventDefault();
    app.createOpen = true;
    render();
    return;
  }
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'Escape' && app.searchOpen) { app.searchOpen = false; render(); return; }
  if (e.key === 'Escape' && app.createOpen) { app.createOpen = false; render(); return; }
  // Single-letter and digit navigation was removed on purpose: it hijacked
  // typing and cluttered the nav with key hints. ⌘K / ⌘T / ⌘W above still work,
  // and Escape still closes overlays.
});


/* The entrance stagger is a first-impression device. After the first screen
   has painted it becomes a tax on every navigation, so it retires itself. */
function markSettled() {
  if (document.body.classList.contains('cv-settled')) return;
  setTimeout(() => document.body.classList.add('cv-settled'), 900);
}

async function boot() {
  // Seed the in-memory tweaks from the persisted store before first paint,
  // otherwise the app flashes the default mode and then corrects itself.
  try {
    const p = loadPrefs();
    if (p.theme) app.t.theme = p.theme;
    if (p.density) app.t.density = p.density;
  } catch (_) {}
  applyHtmlAttrs();
  applyNavW();
  // 1) Restore persisted tabs (best-effort).
  const hadTabs = loadTabs();
  // 2) Hash takes precedence — direct links / refresh on a deep URL should
  //    open into that route, replacing the current active tab.
  const initial = hashToRoute(location.hash);
  if (initial.route && (initial.route !== 'home' || !hadTabs)) {
    app.route = initial.route;
    app.openPageId = initial.openPageId;
    _syncActiveTab();
  }
  // 3) Fresh load with no deep link / no restored tabs → land on the
  //    active mode's home (work mode reloads back into the workspace).
  render();
  try {
    await Promise.all([refreshCounts(), refreshRecent()]);
    app.offline = false;
  } catch (e) {
    app.offline = true;
  }
  app.loaded = true;
  render();
}
boot();
