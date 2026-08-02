/* Canon Vault — terminal/brutalist research-lab UI, wired to the real vault.
   Served by the FastAPI backend (server/secondbrain). All data is live:
   /api/overview, /api/activity, /api/category, /api/page, /api/graph,
   POST /api/capture, plus /chat (Ask) and /search (⌘K). No mock content —
   sparse vault → honest empty states. Zero deps, no build step. */

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
      else if (key === 'onClick') el.addEventListener('click', val);
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
    // Focus the confirm button so Enter works immediately
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

function EmptyState(msg, sub) {
  return h('div', {
    style: {
      border: '1px dashed var(--line-soft)', background: 'var(--paper)',
      padding: '28px 22px', color: 'var(--muted)', fontSize: 'var(--fz-mini)',
      lineHeight: '1.7', textAlign: 'center',
    },
  }, msg, sub ? h('div', { style: { color: 'var(--faint)', marginTop: '6px' } }, sub) : null);
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
  if (p && p.id && p.bodyIsFull !== false) _pageCache.set(p.id, { page: p, ts: Date.now() });
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

/* ── Global per-page chat (survives navigation) ────────────────────
   sendPageChat() owns the full chat lifecycle for one turn. It saves the
   optimistic state immediately, kicks off the API call, and finishes by
   patching the final response into the page's meta.thread. This way:
   - The in-flight request keeps going even if the user navigates away.
   - When the answer arrives we surface a notification if the user isn't
     on that page; otherwise the chat UI re-renders via the listener. */
const _chatNotifs = [];   // [{pageId, title, message, status, ts}]
const _chatListeners = new Set();  // (pageId) => void

function onChatThreadChange(fn) { _chatListeners.add(fn); return () => _chatListeners.delete(fn); }
function emitChatThreadChange(pageId) {
  _chatListeners.forEach((fn) => { try { fn(pageId); } catch (_) {} });
}

function pushChatNotif(n) { _chatNotifs.push(n); renderChatNotifs(); }
function updateChatNotif(pageId, status, extra = {}) {
  for (let i = _chatNotifs.length - 1; i >= 0; i--) {
    if (_chatNotifs[i].pageId === pageId && _chatNotifs[i].status === 'pending') {
      Object.assign(_chatNotifs[i], { status, ts: new Date().toISOString() }, extra);
      break;
    }
  }
  renderChatNotifs();
}
function dismissChatNotif(idx) { _chatNotifs.splice(idx, 1); renderChatNotifs(); }
function renderChatNotifs() {
  let host = document.getElementById('chat-notifs');
  if (!host) {
    host = document.createElement('div');
    host.id = 'chat-notifs';
    host.className = 'chat-notifs';
    document.body.appendChild(host);
  }
  clear(host);
  _chatNotifs.forEach((n, idx) => {
    // Hide stale completed notifs — auto-dismiss after 12s.
    if (n.status !== 'pending' && Date.now() - new Date(n.ts).getTime() > 12000) return;
    const isReady = n.status === 'ready';
    const isError = n.status === 'error';
    const cls = 'chat-notif chat-notif-' + n.status;
    const item = h('div', { className: cls,
      onClick: () => {
        if (app.openPageId !== n.pageId) openPage(n.pageId);
        dismissChatNotif(idx);
      } },
      h('span', { className: 'chat-notif-dot' }),
      h('div', { className: 'chat-notif-body' },
        h('div', { className: 'chat-notif-title' },
          isReady ? '✓ reply ready' : isError ? '✗ chat failed' : '⋯ thinking',
          h('span', { className: 'chat-notif-page' }, ' · ', n.title || 'untitled')),
        h('div', { className: 'chat-notif-msg' }, (n.message || '').slice(0, 80))),
      h('button', { className: 'chat-notif-x',
        onClick: (e) => { e.stopPropagation(); dismissChatNotif(idx); } }, '×'));
    host.appendChild(item);
  });
  // Auto-cleanup pass for stale entries
  if (_chatNotifs.some((n) => n.status !== 'pending' && Date.now() - new Date(n.ts).getTime() > 12000)) {
    setTimeout(() => {
      const before = _chatNotifs.length;
      for (let i = _chatNotifs.length - 1; i >= 0; i--) {
        const n = _chatNotifs[i];
        if (n.status !== 'pending' && Date.now() - new Date(n.ts).getTime() > 12000) _chatNotifs.splice(i, 1);
      }
      if (_chatNotifs.length !== before) renderChatNotifs();
    }, 12500);
  }
}

async function sendPageChat(pageId, message) {
  if (!pageId || !message) return;
  let p = cacheGetPage(pageId);
  if (!p) { try { p = await SB.data().page(pageId); cacheSetPage(p); } catch (_) { return; } }
  p.meta = p.meta || {};
  if (!Array.isArray(p.meta.thread)) p.meta.thread = [];
  // History captured BEFORE we add the new turn.
  const history = p.meta.thread.map((m) => ({ role: m.role, content: m.content }));
  p.meta.thread.push({ role: 'user', content: message, ts: new Date().toISOString() });
  p.meta.thread.push({ role: 'assistant', content: '…', ts: new Date().toISOString() });
  cacheSetPage(p);
  emitChatThreadChange(pageId);
  // Persist optimistic state (don't await — fire-and-forget so UI updates fast).
  SB.data().updatePage(pageId, { meta: p.meta }).catch(() => {});
  pushChatNotif({ pageId, title: p.title, message, status: 'pending', ts: new Date().toISOString() });
  try {
    throw new Error('per-page chat is gone — in-app LLM features were removed (SPEC §16)');
    const cur = cacheGetPage(pageId) || p;
    cur.meta = cur.meta || {}; cur.meta.thread = cur.meta.thread || [];
    const last = cur.meta.thread[cur.meta.thread.length - 1];
    if (last) last.content = r.reply || '(empty reply)';
    cacheSetPage(cur);
    await SB.data().updatePage(pageId, { meta: cur.meta }).catch(() => {});
    emitChatThreadChange(pageId);
    updateChatNotif(pageId, 'ready');
  } catch (e) {
    const cur = cacheGetPage(pageId) || p;
    cur.meta = cur.meta || {}; cur.meta.thread = cur.meta.thread || [];
    const last = cur.meta.thread[cur.meta.thread.length - 1];
    if (last) last.content = '✗ ' + (e.message || e);
    cacheSetPage(cur);
    await SB.data().updatePage(pageId, { meta: cur.meta }).catch(() => {});
    emitChatThreadChange(pageId);
    updateChatNotif(pageId, 'error');
  }
}

/* In-memory cache so we don't re-fetch the same URL multiple times in one session. */
const _ogCache = new Map();
async function fetchLinkPreview(url) {
  url = (url || '').trim();
  if (!url || !/^https?:\/\//i.test(url)) return null;
  if (_ogCache.has(url)) return _ogCache.get(url);
  try {
    const res = await gone('link preview', 'a browser page cannot fetch arbitrary URLs; previews come from the clipper (SPEC §7)');
    // Only cache successful previews. Errors are transient — caching them would
    // mean a one-time network blip makes the preview disappear until reload.
    if (res && !res.error) _ogCache.set(url, res);
    return res;
  } catch (e) {
    return { url, error: String(e.message || e) };
  }
}

/* ── Icons — inlined lucide (shadcn's icon set) ─────────────────────────
   Path markup vendored so the no-build rule holds. Rendered through a span
   wrapper via innerHTML because h() has no SVG namespace support. Icons
   inherit `currentColor` and size via font-size (1em). */
const LUCIDE = {
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

const KIND_META = {
  'note':     { label: 'Note',     icon: 'file-text', glyph: '§', color: 'var(--k-mdwn)',   hint: 'Anything read as prose. A bookmark, a quote, an article — the chrome follows the frontmatter.' },
  'canvas':   { label: 'Canvas',   icon: 'shapes', glyph: '▦', color: 'var(--k-canvas)',  hint: 'A board for pasted links, text, images. Talk to the AI about everything on it.' },
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
// "by kind" capture types.
// SPEC §5: 13 kinds collapsed to 4. The old markdown/bookmark/snippet entries
// stay in KIND_META only as a fallback for a stranger's vault; they are not
// offered anywhere, because `note` chrome is decided by frontmatter (§5).
const KIND_ORDER = ['note', 'topic', 'canvas', 'inspo'];
// Work-mode (design architecture) kinds. Same store + same mention/tag graph
// as the personal kinds above; only the surface (nav, home, create) differs.

function KindChip(kind, opts = {}) {
  const meta = KIND_META[kind] || { label: kind, glyph: '?', color: 'var(--muted)' };
  return h('span', {
    className: 'kind-chip' + (opts.large ? ' lg' : ''),
    style: { '--k-c': meta.color },
    title: meta.hint,
  },
    h('span', { className: 'kind-chip-g' }, kindIcon(kind)),
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
function vaultImage(assetPath, props = {}) {
  const img = h('img', { loading: 'lazy', alt: '', ...props });
  const vault = window.SB_VAULT;
  if (!vault || !assetPath) return img;
  vault.readBlob(assetPath)
    .then((bytes) => {
      const url = URL.createObjectURL(new Blob([bytes]));
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
        const url = URL.createObjectURL(new Blob([bytes]));
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
  const wrap = h('div', { className: 'tab-search', title: 'search pages · ⌘K · enter to ask AI' });
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
          ? h('div', null, 'No page matches "',
              h('b', null, askHint),
              '". ', h('span', { className: 'kbd' }, 'Enter'), ' to ask the AI.')
          : 'Type to search pages, or ask a question.'));
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
        h('span', { className: 'tab-search-kind' },
          kindIcon(p.kind), ' ', p.kind),
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
    h('div', { className: 'tab-brand' },
      h('span', { className: 'glyph' }, '◐'),
      h('span', null, 'SECOND BRAIN'),
      h('small', null, 'v0.6')),
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
        'No page matches. Press Enter to ask the AI instead.'));
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
    placeholder: 'search pages · enter to ask AI · esc to close',
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


function Sidebar(route, setRoute, kindCounts, onCreate, _unusedSearchOpen, onSettingsToggle, offline, lastSynced) {
  const order = KIND_ORDER;
  const total = order.reduce((a, k) => a + ((kindCounts || {})[k] || 0), 0);
  const groupLabel = (g) => g.group === 'kinds'
    ? `by kind — ${total} pages`
    : g.label;
  return h('div', { className: 'nav' },
    // ── top: Create button (search lives in the top tab bar now) ────────
    // Work mode is project-first: this makes a new project (the container),
    // not a lone design page.
    h('div', { className: 'nav-create' },
      h('button', {
        className: 'btn-create',
        onClick: onCreate,
        title: 'Create new page (n)',
      },
        h('span', { className: 'btn-create-plus' }, icon('plus')),
        h('span', null, 'Create new'))),

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
            title: 'click · ⌘-click to open in new tab',
            style: meta ? { '--k-c': meta.color } : null,
          },
            h('span', { className: 'nav-icon' + (meta ? ' kind-glyph' : '') },
              icon(it.icon || (meta && meta.icon) || 'file-text')),
            h('span', null, it.label),
            it.href ? h('span', { className: 'ct' }, '↗') : h('span', { className: 'ct' }, c != null ? String(c) : ''));
        })))),

    // ── bottom: agent status + sync + settings ──────────────────────────
    h('div', { className: 'nav-foot' },
      h('div', { className: 'nav-status-row' },
        h('span', { className: 'dot', style: offline ? { background: 'var(--signal-alert)' } : null }),
        h('span', { className: 'nav-status-label' }, offline ? 'vault unavailable' : 'vault ready')),
      h('div', { className: 'nav-status-row' },
        h('span', { className: 'nav-status-label nav-status-sync' },
          offline ? 'not synced' : ('synced ' + (lastSynced || 'just now')))),
      h('button', {
        className: 'nav-gear', onClick: onSettingsToggle, title: 'Settings / tweak',
        'aria-expanded': String(!!app.settingsOpen),
      },
        h('span', null, icon('settings')),
        h('span', null, 'Settings'))));
}

function startLogResize(e, handle) {
  e.preventDefault();
  const min = 240;
  const max = Math.min(680, window.innerWidth - 460);
  handle.classList.add('dragging');
  document.body.classList.add('col-resizing');
  const onMove = (ev) => {
    const w = Math.max(min, Math.min(max, window.innerWidth - ev.clientX));
    app.logW = w;
    applyLogW();
  };
  const onUp = () => {
    handle.classList.remove('dragging');
    document.body.classList.remove('col-resizing');
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    try { localStorage.setItem('sb.logW', String(app.logW)); } catch (_) {}
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

function ActivityLog(entries, agentBusy, offline) {
  const handle = h('div', { className: 'log-resize', title: 'drag to resize' });
  handle.addEventListener('pointerdown', (e) => startLogResize(e, handle));
  return h('div', { className: 'log' },
    handle,
    h('div', { className: 'log-head' },
      h('span', null, 'agent · activity'),
      h('span', { className: 'live' }, h('span', { className: 'pulse' }), offline ? 'offline' : 'live')),
    h('div', { className: 'log-body' },
      entries && entries.length
        ? entries.map((e) => h('div', { className: `log-entry ${e.actor === 'you' ? 'you' : ''}` },
            h('span', { className: 't' }, e.t),
            h('span', { className: `tag ${e.tag}` }, e.tag),
            h('span', { className: 'msg' },
              e.actor === 'you' ? [h('b', null, 'you · '), e.msg] : e.msg)))
        : h('div', { style: { padding: '14px', color: 'var(--faint)', fontSize: 'var(--fz-mini)' } },
            offline ? 'log unavailable — backend offline' : 'no activity logged yet')),
    h('div', { className: 'log-foot' },
      agentBusy
        ? [h('span', { style: { color: 'var(--signal-warn)' } }, '●'), ' working…']
        : [h('span', { style: { color: 'var(--signal-pos)' } }, '●'), ' idle · monitoring inbox']));
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

function CreateModal(open, onPick, onClose) {
  if (!open) return null;
  return h('div', { className: 'modal-bg', onClick: (e) => { if (e.target.classList.contains('modal-bg')) onClose(); } },
    h('div', { className: 'modal' },
      h('div', { className: 'modal-hd' },
        h('b', null, false ? 'CREATE DESIGN PAGE' : 'CREATE NEW'),
        h('button', { className: 'sb-twk-x', onClick: onClose }, '✕')),
      h('div', { className: 'modal-body' },
        h('div', { className: 'kind-grid' },
          KIND_ORDER.map((k) => {
            const m = KIND_META[k];
            return h('button', {
              className: 'kind-card', style: { '--k-c': m.color },
              onClick: () => onPick(k),
            },
              h('div', { className: 'kind-card-g' }, kindIcon(k)),
              h('div', { className: 'kind-card-l' }, m.label),
              h('div', { className: 'kind-card-h' }, m.hint));
          })))));
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
          h('h1', { className: 'dash-title' }, 'dashboard',
            h('span', { className: 'dash-title-c' }, ' // ',
              h('span', { className: 'dim' }, 'nothing captured yet')))),
        FirstRunPanel(onCreate),
      ]);
      return;
    }

    append(wrap, [
      h('div', { className: 'dash-hd' },
        h('h1', { className: 'dash-title' }, 'dashboard',
          h('span', { className: 'dash-title-c' }, ' // ', h('span', { className: 'dim' }, "what's in the air"))),
        h('div', { className: 'dash-sub' },
          h('span', null,
            h('b', null, String(s.fresh_this_week || 0)), ' new this week · ',
            h('b', null, String(s.mentions_total || 0)), ' mentions · ',
            h('b', null, String(s.pages_total || 0)), ' pages total'),
          h('span', { className: 'dash-sub-r' },
            'updated ', fmtDate(s.last_synced || ''))),
        h('button', { className: 'btn-primary dash-cta', onClick: onCreate }, '+ new page')),

      // ── Current obsessions ──
      h('div', { className: 'sect-hd' },
        h('span', null, 'CURRENT OBSESSIONS'),
        h('span', { className: 'sect-hd-c' }, '// detected by tag clustering')),
      obs.length === 0
        ? EmptyState('No themes detected yet.',
            'Once a tag is on 2+ pages it starts surfacing here as a cluster.')
        : h('div', { className: 'obs-grid' },
            obs.map((o) => obsessionCard(o))),

      // ── Recent captures ──
      h('div', { className: 'sect-hd' },
        h('span', null, 'RECENT PAGES'),
        h('span', { className: 'sect-hd-c' }, '// last 72h')),
      recent.length === 0
        ? EmptyState('No recent pages.', 'Create one above.')
        : h('div', { className: 'pages-table recent-table' },
            h('div', { className: 'pages-th recent-th' },
              h('span', null, 'ID'),
              h('span', null, 'KIND'),
              h('span', null, 'TITLE'),
              h('span', null, 'VIA'),
              h('span', null, 'TAGS'),
              h('span', null, 'WHEN')),
            recent.map((r) => h('div', {
              className: 'pages-row recent-row', onClick: () => onOpen(r.id),
            },
              h('span', { className: 'recent-id' }, r.short_id),
              h('span', null, KindChip(r.kind)),
              h('span', { className: 'pages-title' }, r.title),
              h('span', { className: 'recent-via' }, '← ', r.via),
              h('span', { className: 'pages-tags' },
                (r.tags || []).slice(0, 2).map((t) => h('span', { className: 'tag-chip' }, t))),
              h('span', { className: 'pages-when' }, fmtDate(r.updated))))),

      // ── Activity buckets (replaces v1's "memory tiers") ──
      h('div', { className: 'sect-hd' },
        h('span', null, 'ACTIVITY BUCKETS'),
        h('span', { className: 'sect-hd-c' }, '// auto-cohorted by recency')),
      h('div', { className: 'tier-grid' },
        buckets.map((b) => bucketCard(b))),
    ]);
  }

  function obsessionCard(o) {
    return h('div', { className: 'obs-card' },
      h('div', { className: 'obs-hd' },
        h('span', { className: 'obs-title' }, o.title),
        h('span', { className: 'obs-weight' }, 'w=', String(o.weight))),
      h('div', { className: 'obs-stats' },
        h('span', null, h('b', null, String(o.captures)), ' pages'),
        ' · ',
        h('span', null, h('b', null, String(o.days)), ' days'),
        ' · ',
        h('span', null, h('b', null, String(o.confidence)), '% confidence')),
      h('div', { className: 'spark' },
        (o.sparkline || []).map((v) => {
          const m = Math.max(1, Math.max(...(o.sparkline || [1])));
          const pct = Math.round((v / m) * 100);
          return h('div', { className: 'spark-bar', style: { height: pct + '%', opacity: v ? '1' : '0.18' } });
        })),
      h('div', { className: 'obs-tags' },
        (o.related_tags || []).slice(0, 6).map((t) => h('span', { className: 'tag-chip' }, t))),
      h('div', { className: 'obs-members' },
        h('div', { className: 'obs-members-l' }, 'top pages in this theme'),
        (o.members || []).map((m) => h('button', {
          className: 'obs-member', onClick: () => onOpen(m.id),
        },
          h('span', { className: 'obs-member-g', style: { color: (KIND_META[m.kind] || {}).color || 'var(--muted)' } },
            kindIcon(m.kind)),
          h('span', null, m.title)))));
  }

  function bucketCard(b) {
    const pct = b.cap ? Math.min(100, Math.round((b.count / b.cap) * 100)) : 0;
    return h('div', { className: 'tier-card' },
      h('div', { className: 'tier-hd' },
        h('span', null, b.label.toUpperCase()),
        h('span', { className: 'tier-letter' }, b.letter)),
      h('div', { className: 'tier-n' },
        h('span', { className: 'tier-count' }, String(b.count)),
        b.cap ? h('span', { className: 'tier-cap' }, ' of ', String(b.cap)) : h('span', { className: 'tier-cap' }, ' pages (unbounded)')),
      h('div', { className: 'tier-cap-line' }, b.caption),
      b.cap
        ? h('div', { className: 'tier-bar' }, h('div', { className: 'tier-bar-fill', style: { width: pct + '%' } }))
        : h('div', { className: 'tier-bar tier-bar-flat' }),
      h('div', { className: 'tier-foot' },
        h('span', null, b.footer_l || ''),
        h('span', null, b.footer_r || '')));
  }

  // Initial paint with a minimal scaffold so the screen isn't blank during fetch.
  append(wrap, [
    h('div', { className: 'dash-hd' },
      h('h1', { className: 'dash-title' }, 'dashboard',
        h('span', { className: 'dash-title-c' }, ' // ', h('span', { className: 'dim' }, 'loading…'))),
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
  return null;
}
function itemCount(p) {
  const items = (p.meta && Array.isArray(p.meta.layout)) ? p.meta.layout : [];
  return items.length;
}

function ListView_Board(pages, onOpen) {
  return h('div', { className: 'pages-board' },
    pages.map((p) => {
      const items = (p.meta && Array.isArray(p.meta.layout)) ? p.meta.layout : [];
      const previewItems = items.slice(0, 4);
      return h('div', { className: 'board-card', onClick: () => onOpen(p.id) },
        h('div', { className: 'board-card-hd' },
          h('span', { className: 'board-card-title' }, p.title || '(untitled)'),
          h('span', { className: 'board-card-when' }, fmtDate(p.updated))),
        h('div', { className: 'board-card-preview' },
          previewItems.length === 0
            ? h('div', { className: 'board-card-empty' }, 'empty canvas')
            : previewItems.map((it) => h('div', { className: 'board-card-mini board-card-mini-' + it.type },
                it.type === 'image' && (it.assetUrl || it.asset)
                  ? (it.assetUrl
                      ? h('img', { src: it.assetUrl, loading: 'lazy', alt: '' })
                      : vaultImage(it.asset))
                  : it.type === 'link'
                    ? h('span', null, '↗ ', (it.url || '').replace(/^https?:\/\//, '').slice(0, 32))
                    : h('span', null, (it.text || '').slice(0, 50)))) ),
        h('div', { className: 'board-card-ft' },
          h('span', { className: 'board-card-count' }, items.length + ' items'),
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
            h('span', null, itemCount(p) + ' items'),
            h('span', null, fmtDate(p.updated)))));
    }));
}

function ListView_Table(pages, onOpen) {
  return h('div', { className: 'pages-table' },
    h('div', { className: 'pages-th' },
      h('span', null, 'KIND'),
      h('span', null, 'TITLE'),
      h('span', null, 'TAGS'),
      h('span', null, 'UPDATED')),
    pages.map((p) => h('div', { className: 'pages-row', onClick: () => onOpen(p.id) },
      h('span', null, KindChip(p.kind)),
      h('span', { className: 'pages-title' }, p.title || '(untitled)'),
      h('span', { className: 'pages-tags' },
        (p.tags || []).slice(0, 4).map((t) => h('span', { className: 'tag-chip' }, t))),
      h('span', { className: 'pages-when' }, fmtDate(p.updated)))));
}

function V2PagesList(kind, pages, onOpen, onCreate) {
  const meta = kind ? KIND_META[kind] : null;
  const title = meta ? meta.label.toLowerCase() : 'all pages';
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
    if (countEl) countEl.textContent = (query ? filtered.length + ' of ' : '') + pages.length + ' page' + (pages.length === 1 ? '' : 's');
  }

  const countEl = h('span', null, pages.length + ' page' + (pages.length === 1 ? '' : 's'));
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
    meta ? meta.hint : (pages.length + ' pages total'),
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
  const runBodyTeardowns = () => {
    bodyTeardowns.forEach((fn) => { try { fn(); } catch (_) {} });
    bodyTeardowns = [];
  };

  const queueSave = () => {
    if (!page) return;
    dirty = true;
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
      if (!patched) return;                 // refused; the user has been told
      page.updated = patched.updated;
      cacheSetPage(patched);  // keep page cache fresh so revisits are instant
      invalidatePageIndex();  // title may have changed → refresh mention labels
      onChange && onChange(patched);
    } catch (e) { console.warn('save failed', e); }
  };

  /* 6.3: conflict UI. put() re-reads `updated` from disk before writing and
     refuses when it moved, so an Obsidian edit is never silently clobbered.
     On overwrite the disk version is preserved as `<name> (conflict <date>).md`
     first — neither side's work is ever lost (SPEC §8). */
  async function savePage(patch, force) {
    const r = await SB.data().updatePage(page.id, force ? { ...patch, force: true } : patch);
    if (!r || r.ok !== false) return r;
    if (r.reason !== 'conflict') {
      console.warn('save refused:', r.reason, r.message || '');
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
      h('textarea', {
        className: 'page-body-ta',
        placeholder: page.kind === 'snippet' ? 'a quick thought…' :
                     page.kind === 'bookmark' ? 'context for this link…' :
                     'body…',
        value: page.body,
        onInput: (e) => { page.body = e.target.value; queueSave(); },
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
    if (!Array.isArray(page.meta.thread)) page.meta.thread = [];

    const wrap = h('div', { className: 'page-body topic-chat-body' });

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
        if (!body) { alert('paste or upload something first'); return; }
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

      // Chat: also let the user paste a public share URL (ChatGPT / Claude)
      // and fetch the conversation transcript into the textarea.
      if (spec.kind === 'chat') {
        const shareI = h('input', { className: 'topic-att-titleI',
          placeholder: 'paste a public share URL (ChatGPT / Claude / Gemini) — optional', type: 'url' });
        const status = h('span', { className: 'att-modal-extra-or' });
        const fetchBtn = h('button', { className: 'side-action', onClick: async () => {
          const url = shareI.value.trim();
          if (!url) { alert('paste a share URL first'); return; }
          fetchBtn.disabled = true; fetchBtn.textContent = '… fetching';
          status.textContent = '';
          try {
            const r = await gone('shared-chat import', 'in-app LLM features were removed (SPEC §16)');
            if (r.body) {
              bodyT.value = r.body;
              if (r.title && !titleI.value.trim()) titleI.value = r.title;
              status.textContent = '✓ ' + (r.source || 'chat') + ' · ' + r.body.length + ' chars';
            } else {
              status.textContent = '✗ ' + (r.error || 'no content fetched');
            }
          } catch (e) {
            status.textContent = '✗ ' + (e.message || e);
          } finally {
            fetchBtn.disabled = false; fetchBtn.textContent = '↓ fetch';
          }
        } }, '↓ fetch');
        extraRow.appendChild(h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', flex: '1' } },
          h('div', { style: { display: 'flex', gap: '6px' } }, shareI, fetchBtn),
          status));
      }

      bg.appendChild(h('div', { className: 'modal' },
        h('div', { className: 'modal-hd' },
          h('b', null, '+ ' + spec.label.toUpperCase()),
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
      titleI.focus();
    }

    // Special link flow — paste URL → fetch + show preview → save
    function linkAttachmentModal() {
      const urlI = h('input', { className: 'topic-att-titleI', placeholder: 'https://…', type: 'url' });
      const previewBox = h('div', { className: 'topic-att-link-preview' });
      const statusLine = h('div', { className: 'topic-att-link-status' });
      let fetched = null;  // {url, kind, title, body, og}
      const bg = h('div', { className: 'modal-bg' });
      const close = () => bg.remove();

      async function doFetch() {
        const url = urlI.value.trim();
        if (!url) { alert('paste a URL first'); return; }
        statusLine.textContent = 'fetching…';
        clear(previewBox);
        try {
          const og = await fetchLinkPreview(url);
          const r = await gone('link fetch', 'a browser page cannot fetch arbitrary URLs (SPEC §7)');
          fetched = {
            url, kind: r.kind, title: r.title || (og && og.title) || url,
            body: r.body || '', og: og || null, error: r.error || '',
          };
          renderPreview();
          statusLine.textContent = r.body
            ? '✓ ' + r.kind + ' · ' + r.body.length + ' chars'
            : (r.error || '✗ no body fetched');
        } catch (e) {
          statusLine.textContent = '✗ ' + (e.message || e);
        }
      }
      function renderPreview() {
        clear(previewBox);
        if (!fetched) return;
        const og = fetched.og;
        if (og && og.image) previewBox.appendChild(h('img', {
          className: 'topic-att-link-img', src: og.image, loading: 'lazy', alt: '' }));
        previewBox.appendChild(h('div', { className: 'topic-att-link-meta' },
          h('div', { className: 'topic-att-link-title' }, fetched.title || og && og.title || fetched.url),
          og && og.description ? h('div', { className: 'topic-att-link-desc' }, og.description.slice(0, 160)) : null,
          h('div', { className: 'topic-att-link-host' }, (fetched.url || '').replace(/^https?:\/\//, '').slice(0, 60))));
      }
      function save() {
        if (!fetched || !fetched.body) {
          if (!confirm('No body was fetched. Save the link without context anyway?')) return;
        }
        page.meta.attachments.push({
          id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          type: 'link',
          title: fetched.title || urlI.value.trim(),
          source: 'link',
          body: (fetched && fetched.body) || '',
          meta: fetched ? { url: fetched.url, og: fetched.og, kind: fetched.kind } : { url: urlI.value.trim() },
        });
        queueSave(); renderAttachments(); close();
      }

      bg.appendChild(h('div', { className: 'modal' },
        h('div', { className: 'modal-hd' },
          h('b', null, '+ LINK'),
          h('button', { className: 'sb-twk-x', onClick: close }, '✕')),
        h('div', { className: 'modal-body' },
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
            urlI,
            h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
              h('button', { className: 'side-action', onClick: doFetch }, '↓ fetch'),
              statusLine),
            previewBox,
            h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } },
              h('button', { className: 'side-action', onClick: close }, 'cancel'),
              h('button', { className: 'btn-primary', onClick: save }, 'attach'))))));
      bg.addEventListener('click', (e) => { if (e.target === bg) close(); });
      document.body.appendChild(bg);
      urlI.focus();
    }

    // Dropdown menu for "+ chat" — picks a specific LLM source
    function openChatPicker(anchorBtn) {
      // Close any existing
      document.querySelectorAll('.att-chat-menu').forEach((n) => n.remove());
      const menu = h('div', { className: 'att-chat-menu' });
      const rect = anchorBtn.getBoundingClientRect();
      menu.style.position = 'fixed';
      menu.style.top = (rect.bottom + 4) + 'px';
      menu.style.left = rect.left + 'px';
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
      document.body.appendChild(menu);
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
      const chatBtn = h('button', { className: 'att-chat-trigger' });
      chatBtn.textContent = '+ chat ▾';
      chatBtn.addEventListener('click', () => openChatPicker(chatBtn));
      attSec.appendChild(h('div', { className: 'topic-att-hd' },
        h('span', null, 'ATTACHED MATERIALS · ', String(page.meta.attachments.length)),
        h('div', { className: 'topic-att-actions' },
          h('button', { onClick: () => pasteAttachmentModal('text') }, '+ text'),
          h('button', { onClick: () => pasteAttachmentModal('markdown') }, '+ markdown'),
          h('button', { onClick: () => linkAttachmentModal() }, '+ link'),
          chatBtn)));

      if (!page.meta.attachments.length) {
        attSec.appendChild(h('div', { className: 'topic-att-empty' },
          'Paste text, markdown, URLs, or chat exports from ChatGPT / Claude / Gemini / NotebookLM. ',
          'The AI sees everything you attach.'));
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

    // ── Chat thread ──
    const threadList = h('div', { className: 'topic-thread-list' });

    function renderThread() {
      clear(threadList);
      if (!page.meta.thread.length) {
        threadList.appendChild(h('div', { className: 'topic-thread-empty' },
          'Start a conversation about this topic. The AI sees About Me + this page + everything you attach.'));
        return;
      }
      page.meta.thread.forEach((m) => {
        const c = h('div', { className: 'topic-msg-c md-body' });
        if (m.role === 'assistant') {
          renderMarkdown(m.content).forEach((node) => c.appendChild(node));
        } else {
          c.textContent = m.content;
        }
        threadList.appendChild(h('div', { className: 'topic-msg topic-msg-' + m.role },
          h('div', { className: 'topic-msg-r' }, m.role === 'user' ? 'you' : m.role),
          c));
      });
      threadList.scrollTop = threadList.scrollHeight;
    }

    const input = h('textarea', {
      className: 'topic-chat-input',
      placeholder: 'message… (⏎ to send, ⇧⏎ for newline)',
      onKeyDown: async (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          await send();
        }
      },
    });

    // Topic chat goes through the global sendPageChat so it survives navigation
    // and surfaces a notification when the answer is ready elsewhere.
    function send() {
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      input.style.height = '';
      sendPageChat(page.id, text);
    }
    // Re-render the topic thread whenever sendPageChat updates this page
    const _topicChatUnsub = onChatThreadChange((cid) => {
      if (cid !== page.id) return;
      const cached = cacheGetPage(page.id);
      if (cached && cached.meta && Array.isArray(cached.meta.thread)) {
        page.meta.thread = cached.meta.thread;
      }
      renderThread();
    });
    onBodyTeardown(_topicChatUnsub);


    renderAttachments();
    renderThread();

    // ── Topic description (collapsible, secondary) ──
    let descExpanded = !!(page.body && page.body.trim());
    const descSec = h('div', { className: 'topic-desc-sec' });
    const descToggle = h('button', {
      className: 'topic-desc-toggle',
      onClick: () => {
        descExpanded = !descExpanded;
        descSec.classList.toggle('expanded', descExpanded);
        descToggle.textContent = descExpanded ? '− topic description' : '+ topic description';
      },
    }, descExpanded ? '− topic description' : '+ topic description');
    descSec.classList.toggle('expanded', descExpanded);
    descSec.appendChild(descToggle);

    /* 6.7 / 6.19: a topic body is markdown like any other page, so it renders as
       markdown by default and only becomes a textarea when you choose to edit.
       This is what makes a migrated `## Thread` section a real heading instead
       of literal text — the thread lives in the body now (task 1.24), and an
       always-on editor was hiding it. */
    let descMode = (page.body && page.body.trim()) ? 'view' : 'edit';
    const descHost = h('div', { className: 'topic-desc-host' });
    const descEdit = h('button', { className: 'topic-desc-mode' }, 'edit');

    function paintDesc() {
      clear(descHost);
      descEdit.textContent = descMode === 'view' ? 'edit' : 'done';
      if (descMode === 'edit') {
        descHost.appendChild(h('textarea', {
          className: 'topic-desc-ta',
          placeholder: 'optional context · markdown, [[wikilinks]] and #tags…',
          value: page.body,
          onInput: (e) => { page.body = e.target.value; queueSave(); },
        }));
        return;
      }
      const rendered = h('div', { className: 'md-rendered topic-desc-md' });
      try {
        rendered.innerHTML = SB.data().renderHtml(page.body || '').html;
        decorateMentions(rendered);
        decorateHashtags(rendered);
      } catch (e) {
        rendered.textContent = page.body || '';
      }
      descHost.appendChild(rendered);
    }
    descEdit.addEventListener('click', () => {
      descMode = descMode === 'view' ? 'edit' : 'view';
      paintDesc();
    });
    if (page.body && page.body.trim()) descSec.appendChild(descEdit);
    descSec.appendChild(descHost);
    paintDesc();

    wrap.appendChild(attSec);
    wrap.appendChild(descSec);

    // The chat section is returned separately so the layout can place it as
    // its own grid column (centre of the 3-col topic layout).
    const chatSec = h('div', { className: 'topic-chat-sec' },
      h('div', { className: 'topic-chat-hd' },
        h('span', null, 'CHAT'),
        h('span', { className: 'topic-chat-clear', onClick: async () => {
          if (!page.meta.thread.length) return;
          if (!confirm('Clear all messages in this thread?')) return;
          page.meta.thread = [];
          const cached = cacheGetPage(page.id) || page;
          cached.meta = cached.meta || {};
          cached.meta.thread = [];
          cacheSetPage(cached);
          await SB.data().updatePage(page.id, { meta: cached.meta }).catch(() => {});
          emitChatThreadChange(page.id);
        } }, page.meta.thread.length ? 'clear' : '')),
      threadList,
      // 6.13: no message input. Existing threads stay visible, read-only.
      h('div', { className: 'topic-chat-ro' }, 'thread is read-only'));

    return { body: wrap, chatSec };
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

  function renderBoardBody(opts = {}) {
    const { withImages = false, kindLabel = 'canvas' } = opts;
    // SPEC §10: geometry lives in the `.canvas` file and Obsidian owns it —
    // the app never writes it. So every control that would create or move a
    // node is omitted, not merely styled inert. Leaving "+ text" and the pen
    // on screen let a user do work the app had no way to save, which is the
    // exact "appears to work, silently discarded" failure this was meant to
    // avoid. One flag drives the class and the controls so they cannot drift.
    const READ_ONLY = true;
    if (!page.meta) page.meta = {};
    if (!Array.isArray(page.meta.layout)) page.meta.layout = [];
    // Page-level strokes (the whole canvas is a sketch board). Points are
    // stored in *world* coords so they pan + zoom with the rest of the canvas.
    if (!Array.isArray(page.meta.strokes)) page.meta.strokes = [];
    // Edges come from the `.canvas` file alongside the nodes. Same rule as
    // geometry: Obsidian owns them, we only draw them.
    if (!Array.isArray(page.meta.edges)) page.meta.edges = [];

    // Board-level drawing tool state. Mental model:
    //   - boardTool.mode ∈ 'move' | 'pen' | 'erase'.
    //     'move' (default): mouse pans + drags items; finger pans;
    //                       Apple Pencil contact AUTO-switches into 'pen'
    //                       so a stylus user doesn't need to tap the toolbar.
    //     'pen':            mouse + pencil draw. Finger still pans.
    //     'erase':          mouse + pencil erase. Finger still pans.
    //   - 2-finger touch always pinch-zooms (never draws).
    const boardTool = {
      mode: 'move',
      color: '#1a1a1a',
      width: 3,
    };

    // Undo / redo history for strokes. Each entry is an op:
    //   { type: 'add', stroke }          → undo removes it
    //   { type: 'erase', strokes: [...] } → undo restores them
    // Cleared on tab switch / page unload (not persisted).
    const sketchHistory = [];
    const sketchRedo = [];
    let refreshFloat = () => {};  // float toolbar repaint hook (set below)
    function recordOp(op) { sketchHistory.push(op); sketchRedo.length = 0; refreshFloat(); }
    function undoStroke() {
      const op = sketchHistory.pop();
      if (!op) return;
      if (op.type === 'add') {
        page.meta.strokes = page.meta.strokes.filter((s) => s.id !== op.stroke.id);
      } else if (op.type === 'erase') {
        page.meta.strokes.push(...op.strokes);
      }
      renderAllStrokes();
      queueSave();
      sketchRedo.push(op);
      refreshFloat();
    }
    function redoStroke() {
      const op = sketchRedo.pop();
      if (!op) return;
      if (op.type === 'add') {
        page.meta.strokes.push(op.stroke);
      } else if (op.type === 'erase') {
        const ids = new Set(op.strokes.map((s) => s.id));
        page.meta.strokes = page.meta.strokes.filter((s) => !ids.has(s.id));
      }
      renderAllStrokes();
      queueSave();
      sketchHistory.push(op);
      refreshFloat();
    }

    // Stroke ID generator (for undo/redo lookups).
    function genStrokeId() {
      return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    const surface = h('div', { className: 'canvas-surface' });
    // 6.12 / SPEC §10: the app never writes geometry. Arranging happens in
    // Obsidian, which removes the hardest and riskiest part of canvas support
    // entirely. The board renders, but pointer events are off so a drag cannot
    // even appear to work — silently discarding edits would be worse than
    // disallowing them.
    const viewport = h('div', { className: 'canvas-viewport' + (READ_ONLY ? ' board-ro' : '') });
    const _obsHref = obsidianUrl(page.path);
    viewport.appendChild(h('div', { className: 'board-readonly' },
      h('span', null, 'Boards are read-only here — arrange them in Obsidian.'),
      _obsHref ? h('a', { href: _obsHref }, 'open in Obsidian ↗') : null));

    // ── Strokes layer (inside surface so it inherits pan + zoom) ─────────
    const STROKES_NS = 'http://www.w3.org/2000/svg';
    const strokesSvg = document.createElementNS(STROKES_NS, 'svg');
    strokesSvg.setAttribute('class', 'canvas-strokes');
    strokesSvg.setAttribute('viewBox', '0 0 10000 10000');
    strokesSvg.setAttribute('width', '10000');
    strokesSvg.setAttribute('height', '10000');
    strokesSvg.setAttribute('preserveAspectRatio', 'none');
    Object.assign(strokesSvg.style, {
      position: 'absolute', left: '0', top: '0', pointerEvents: 'none',
    });
    const strokesG = document.createElementNS(STROKES_NS, 'g');
    strokesSvg.appendChild(strokesG);
    surface.appendChild(strokesSvg);

    // ── Edges layer ──────────────────────────────────────────────────────
    // Sits *below* the cards and the strokes (inserted before both), inside
    // `surface` so it inherits pan + zoom for free. No viewBox and
    // overflow:visible, because JSON Canvas coordinates are routinely
    // negative — a 0-origin viewBox like the strokes layer's would clip
    // every board whose nodes sit left of or above the origin.
    const edgesSvg = document.createElementNS(STROKES_NS, 'svg');
    edgesSvg.setAttribute('class', 'canvas-edges');
    edgesSvg.setAttribute('width', '0');
    edgesSvg.setAttribute('height', '0');
    const edgesG = document.createElementNS(STROKES_NS, 'g');
    edgesSvg.appendChild(edgesG);
    surface.insertBefore(edgesSvg, strokesSvg);

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
      for (const it of page.meta.layout) {
        boxes.set(it.id, {
          x: it.x || 0, y: it.y || 0, w: it.w || 240, h: it.h || 220,
        });
      }
      for (const e of page.meta.edges) {
        const g = geom(e, boxes.get(e.fromNode), boxes.get(e.toNode));
        if (!g) continue;               // an endpoint that isn't on the board
        const color = edgeColor(e.color);

        const path = document.createElementNS(STROKES_NS, 'path');
        path.setAttribute('d', g.d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('stroke-linecap', 'round');
        // Set via style, not the attribute: a CSS custom property is only
        // guaranteed to resolve as a style declaration.
        path.style.stroke = color;
        edgesG.appendChild(path);

        // Arrowheads. The tip sits on the anchor and the base steps back
        // along the outward normal, so it lines up with the curve's tangent.
        const HEAD = 9;
        for (const p of g.arrows) {
          const bx = p.x + p.nx * HEAD, by = p.y + p.ny * HEAD;
          // Perpendicular to the normal, for the two base corners.
          const px = -p.ny, py = p.nx;
          const tri = document.createElementNS(STROKES_NS, 'polygon');
          tri.setAttribute('points', [
            `${p.x},${p.y}`,
            `${bx + px * HEAD * 0.45},${by + py * HEAD * 0.45}`,
            `${bx - px * HEAD * 0.45},${by - py * HEAD * 0.45}`,
          ].join(' '));
          tri.style.fill = color;
          edgesG.appendChild(tri);
        }

        if (g.label) {
          const text = document.createElementNS(STROKES_NS, 'text');
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

    function strokeToPathStr(points, baseW) {
      if (!points || points.length === 0) return '';
      if (points.length === 1) {
        const p = points[0];
        const r = baseW * 0.5 * (0.6 + 0.6 * (p.p || 0.5));
        return 'M ' + (p.x - r) + ' ' + p.y +
               ' a ' + r + ' ' + r + ' 0 1 0 ' + (r * 2) + ' 0' +
               ' a ' + r + ' ' + r + ' 0 1 0 ' + (-r * 2) + ' 0 Z';
      }
      const left = [], right = [];
      for (let i = 0; i < points.length; i++) {
        const prev = points[i - 1] || points[i];
        const next = points[i + 1] || points[i];
        const dx = next.x - prev.x, dy = next.y - prev.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len;
        const w = baseW * (0.5 + 0.7 * (points[i].p || 0.5));
        const px = points[i].x, py = points[i].y;
        left.push((px + nx * w * 0.5) + ',' + (py + ny * w * 0.5));
        right.push((px - nx * w * 0.5) + ',' + (py - ny * w * 0.5));
      }
      return 'M ' + left.join(' L ') + ' L ' + right.reverse().join(' L ') + ' Z';
    }
    function renderAllStrokes() {
      while (strokesG.firstChild) strokesG.removeChild(strokesG.firstChild);
      for (const s of page.meta.strokes) {
        const path = document.createElementNS(STROKES_NS, 'path');
        path.setAttribute('d', strokeToPathStr(s.points, s.width || 3));
        path.setAttribute('fill', s.color || '#1a1a1a');
        path.setAttribute('stroke', 'none');
        strokesG.appendChild(path);
      }
    }

    // ── Pan + zoom state ──────────────────────────────────────────
    // Surface is transformed via translate + scale; viewport stays static
    // (no scrollbars). All item.x/.y coords are in *world* space — never
    // touched by zoom. Mouse → world conversion: (screen - pan) / zoom.
    let panX = 0, panY = 0, zoom = 1;
    const ZOOM_MIN = 0.2, ZOOM_MAX = 3;
    function applyTransform() {
      surface.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
      if (zoomReadout) zoomReadout.textContent = Math.round(zoom * 100) + '%';
    }
    function zoomAt(screenX, screenY, factor) {
      const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * factor));
      if (next === zoom) return;
      // Keep the world point under (screenX, screenY) stable.
      const rect = viewport.getBoundingClientRect();
      const mx = screenX - rect.left;
      const my = screenY - rect.top;
      panX = mx - (mx - panX) * (next / zoom);
      panY = my - (my - panY) * (next / zoom);
      zoom = next;
      applyTransform();
    }
    function resetView() { panX = 0; panY = 0; zoom = 1; applyTransform(); }
    function fitView() {
      if (!page.meta.layout.length) { resetView(); return; }
      // Compute world-space bbox of all items
      const W = viewport.clientWidth, H = viewport.clientHeight;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const it of page.meta.layout) {
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

    // Wheel: trackpad / Ctrl+wheel = zoom, plain wheel = pan.
    // Let textareas/inputs handle their own scroll first — don't hijack
    // the wheel when the user is reading inside a card.
    viewport.addEventListener('wheel', (e) => {
      const target = e.target;
      const inField = target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT');
      if (inField && !(e.ctrlKey || e.metaKey)) return;  // let the field scroll
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 0.92 : 1.08);
      } else {
        panX -= e.deltaX;
        panY -= e.deltaY;
        applyTransform();
      }
    }, { passive: false });

    // ── Pointer dispatch:
    //    - Apple Pencil → if mode='move' auto-switch to 'pen' and draw,
    //      else follow the active tool (pen draws, erase erases).
    //    - Finger (1 touch) → pan. Finger (2 touches) → pinch zoom.
    //    - Mouse → follow active tool: 'move' = pan + drag, 'pen' = draw,
    //      'erase' = erase. No separate "draw with mouse" toggle.
    let liveStroke = null, livePath = null;
    // Track active touch pointers for pinch detection.
    const touchPoints = new Map();   // pointerId → {x, y}
    let pinchState = null;
    // Track currently-erased strokes for one-shot undo at pointerup.
    let eraseSession = null;

    function eraseNear(wx, wy, radius) {
      const removed = [];
      page.meta.strokes = page.meta.strokes.filter((s) => {
        for (const p of (s.points || [])) {
          if (Math.hypot(p.x - wx, p.y - wy) <= radius) { removed.push(s); return false; }
        }
        return true;
      });
      if (removed.length) {
        renderAllStrokes();
        if (eraseSession) eraseSession.push(...removed);
      }
    }

    // `action` is 'pen' | 'erase' — the tool actually applied for this
    // gesture. `startDrawing` is reused by both pencil and mouse and may
    // override the visible mode (e.g. Apple Pencil auto-draws in move).
    function startDrawing(e, action) {
      e.preventDefault();
      try { viewport.setPointerCapture(e.pointerId); } catch (_) {}
      const [wx, wy] = screenToWorld(e.clientX, e.clientY);
      const eraseR = 14 / zoom;
      if (action === 'erase') {
        eraseSession = [];
        eraseNear(wx, wy, eraseR);
        const moveErase = (ev) => {
          if (!ev.buttons) return;
          const [x, y] = screenToWorld(ev.clientX, ev.clientY);
          eraseNear(x, y, eraseR);
        };
        const upErase = () => {
          viewport.removeEventListener('pointermove', moveErase);
          viewport.removeEventListener('pointerup', upErase);
          viewport.removeEventListener('pointercancel', upErase);
          if (eraseSession && eraseSession.length) {
            recordOp({ type: 'erase', strokes: eraseSession });
            queueSave();
          }
          eraseSession = null;
        };
        viewport.addEventListener('pointermove', moveErase);
        viewport.addEventListener('pointerup', upErase);
        viewport.addEventListener('pointercancel', upErase);
        return;
      }
      const pressure = e.pressure > 0 ? e.pressure : 0.5;
      liveStroke = {
        id: genStrokeId(),
        color: boardTool.color, width: boardTool.width,
        points: [{ x: wx, y: wy, p: pressure }],
      };
      livePath = document.createElementNS(STROKES_NS, 'path');
      livePath.setAttribute('fill', boardTool.color);
      livePath.setAttribute('stroke', 'none');
      livePath.setAttribute('d', strokeToPathStr(liveStroke.points, boardTool.width));
      strokesG.appendChild(livePath);
      const moveDraw = (ev) => {
        if (!liveStroke) return;
        ev.preventDefault();
        const samples = (typeof ev.getCoalescedEvents === 'function')
          ? ev.getCoalescedEvents() : [ev];
        for (const s of samples) {
          const [x, y] = screenToWorld(s.clientX, s.clientY);
          liveStroke.points.push({ x, y, p: s.pressure > 0 ? s.pressure : 0.5 });
        }
        livePath.setAttribute('d', strokeToPathStr(liveStroke.points, liveStroke.width));
      };
      const endDraw = () => {
        viewport.removeEventListener('pointermove', moveDraw);
        viewport.removeEventListener('pointerup', endDraw);
        viewport.removeEventListener('pointercancel', endDraw);
        if (!liveStroke) return;
        page.meta.strokes.push(liveStroke);
        recordOp({ type: 'add', stroke: liveStroke });
        liveStroke = null;
        livePath = null;
        queueSave();
      };
      viewport.addEventListener('pointermove', moveDraw);
      viewport.addEventListener('pointerup', endDraw);
      viewport.addEventListener('pointercancel', endDraw);
    }

    function startPanning(e) {
      const sx = e.clientX, sy = e.clientY;
      const startPanX = panX, startPanY = panY;
      try { viewport.setPointerCapture(e.pointerId); } catch (_) {}
      viewport.classList.add('panning');
      const mv = (ev) => {
        panX = startPanX + (ev.clientX - sx);
        panY = startPanY + (ev.clientY - sy);
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

    // ── Pinch zoom (two-finger touch) ────────────────────────────────────
    function startPinch() {
      const pts = Array.from(touchPoints.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const cx = (pts[0].x + pts[1].x) / 2;
      const cy = (pts[0].y + pts[1].y) / 2;
      pinchState = {
        startDist: dist, startZoom: zoom,
        startCenterX: cx, startCenterY: cy,
        startPanX: panX, startPanY: panY,
      };
    }
    function updatePinch() {
      if (!pinchState || touchPoints.size < 2) return;
      const pts = Array.from(touchPoints.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const cx = (pts[0].x + pts[1].x) / 2;
      const cy = (pts[0].y + pts[1].y) / 2;
      const ratio = dist / pinchState.startDist;
      const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, pinchState.startZoom * ratio));
      const rect = viewport.getBoundingClientRect();
      const mx = pinchState.startCenterX - rect.left;
      const my = pinchState.startCenterY - rect.top;
      // Zoom anchored at the original pinch centroid, plus drag by the
      // current centroid delta.
      panX = mx - (mx - pinchState.startPanX) * (newZoom / pinchState.startZoom)
             + (cx - pinchState.startCenterX);
      panY = my - (my - pinchState.startPanY) * (newZoom / pinchState.startZoom)
             + (cy - pinchState.startCenterY);
      zoom = newZoom;
      applyTransform();
    }

    viewport.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('.canvas-item')) return;
      if (e.target.closest('.canvas-toolbar')) return;
      if (e.target.closest('.sk-float')) return;

      // Track touches; if a 2nd lands, switch into pinch mode and abort
      // whatever the 1st was doing.
      if (e.pointerType === 'touch') {
        touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touchPoints.size >= 2) {
          // Cancel any in-progress 1-finger pan / draw and lock into pinch.
          viewport.classList.remove('panning');
          if (liveStroke) {
            // Abandon the partial stroke; user actually wanted pinch.
            if (livePath && livePath.parentNode) livePath.parentNode.removeChild(livePath);
            liveStroke = null; livePath = null;
          }
          startPinch();
          e.preventDefault();
          return;
        }
      }

      const isPen = e.pointerType === 'pen';
      const isMouse = e.pointerType === 'mouse';

      if (isPen) {
        // Apple Pencil: if user hasn't picked a tool, default to 'pen' and
        // light up the toolbar so they see what's active.
        let action = boardTool.mode === 'erase' ? 'erase' : 'pen';
        if (boardTool.mode === 'move') {
          boardTool.mode = 'pen';
          refreshFloat();
        }
        startDrawing(e, action);
        return;
      }

      if (isMouse) {
        // Mouse follows the currently-selected tool.
        if (boardTool.mode === 'pen' || boardTool.mode === 'erase') {
          startDrawing(e, boardTool.mode);
        } else {
          startPanning(e);
        }
        return;
      }

      // Touch (single finger) → pan. Two-finger touch is handled above.
      startPanning(e);
    });

    // Pinch move + cleanup. Listening on `viewport` would miss pointermove
    // events between the two fingers — `document` is more reliable.
    document.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'touch') return;
      if (!touchPoints.has(e.pointerId)) return;
      touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinchState) updatePinch();
    });
    const releaseTouch = (e) => {
      if (e.pointerType !== 'touch') return;
      if (!touchPoints.has(e.pointerId)) return;
      touchPoints.delete(e.pointerId);
      if (touchPoints.size < 2) pinchState = null;
    };
    document.addEventListener('pointerup', releaseTouch);
    document.addEventListener('pointercancel', releaseTouch);
    if (typeof onBodyTeardown === 'function') {
      onBodyTeardown(() => {
        document.removeEventListener('pointermove', releaseTouch);  // safety
      });
    }

    // Forward declarations so toolbar buttons can reference them
    let zoomReadout;
    // Use the SURFACE's bounding rect (already includes pan + scale + the
    // sticky toolbar's offset within the viewport) so a click at (cx, cy)
    // converts to world coords exactly — no off-by-toolbar-height anymore.
    function screenToWorld(clientX, clientY) {
      const r = surface.getBoundingClientRect();
      return [
        (clientX - r.left) / zoom,
        (clientY - r.top) / zoom,
      ];
    }
    function viewportCenterWorld() {
      const W = viewport.clientWidth, H = viewport.clientHeight;
      return [
        (-panX + W / 2) / zoom,
        (-panY + H / 2) / zoom,
      ];
    }

    function buildItem(item) {
      const style = {
        left: (item.x || 0) + 'px',
        top: (item.y || 0) + 'px',
        width: (item.w || 240) + 'px',
      };
      // Persist height too if the user has resized the card vertically.
      if (item.h && item.h > 60) style.height = item.h + 'px';
      const el = h('div', {
        className: `canvas-item canvas-item-${item.type}`,
        style,
        'data-id': item.id,
      });
      // Track CSS-resize changes (the user drags the bottom-right corner) and
      // persist the new dimensions on the item. Skip the first fire which is
      // just the initial layout, not a real resize.
      try {
        let firstObserve = true;
        const ro = new ResizeObserver((entries) => {
          if (firstObserve) { firstObserve = false; return; }
          for (const entry of entries) {
            const w = Math.round(entry.contentRect.width);
            const h = Math.round(entry.contentRect.height);
            const dW = Math.abs(w - (item.w || 240));
            const dH = Math.abs(h - (item.h || 0));
            if (dW > 2 || dH > 2) {
              item.w = w; item.h = h;
              queueSave();
            }
          }
        });
        ro.observe(el);
        onBodyTeardown(() => ro.disconnect());
      } catch (_) { /* ResizeObserver missing in very old browsers — non-fatal */ }
      const glyph =
        item.type === 'text' ? '◇ text' :
        item.type === 'link' ? '↗ link' :
        item.type === 'image' ? '▢ image' : item.type;
      const handle = h('div', { className: 'canvas-item-handle' },
        h('span', null, glyph),
        h('button', { className: 'canvas-item-del', title: 'remove',
          onClick: () => removeItem(item.id) }, '×'));
      el.appendChild(handle);
      if (item.type === 'text') {
        el.appendChild(h('textarea', {
          className: 'canvas-item-text',
          value: item.text || '',
          placeholder: 'write…',
          onInput: (e) => { item.text = e.target.value; queueSave(); },
        }));
      } else if (item.type === 'image') {
        // Image asset + caption underneath (always editable).
        // assetUrl is the full URL the upload endpoint returned (a Supabase
        // public URL, or /assets/<name> for the file backend). Fall back to
        // the local path for items created before assetUrl existed.
        if (item.assetUrl) {
          el.appendChild(h('img', {
            className: 'canvas-item-image',
            src: item.assetUrl,
            loading: 'lazy', alt: item.caption || '',
          }));
        } else if (item.asset) {
          el.appendChild(vaultImage(item.asset,
            { className: 'canvas-item-image', alt: item.caption || '' }));
        } else {
          el.appendChild(h('div', { className: 'canvas-item-image-placeholder' }, 'drop an image…'));
        }
        el.appendChild(h('textarea', {
          className: 'canvas-item-caption',
          value: item.caption || '',
          placeholder: 'caption / context…',
          onInput: (e) => { item.caption = e.target.value; queueSave(); },
        }));
      } else if (item.type === 'link') {
        el.appendChild(h('input', {
          className: 'canvas-item-url',
          value: item.url || '',
          placeholder: 'https://…',
          onInput: (e) => {
            item.url = e.target.value;
            queueSave();
            clearTimeout(item._previewTimer);
            item._previewTimer = setTimeout(() => refreshLink(el, item), 500);
          },
        }));
        el.appendChild(h('input', {
          className: 'canvas-item-title',
          value: item.title || '',
          placeholder: 'optional title',
          onInput: (e) => { item.title = e.target.value; queueSave(); },
        }));

        // ── Context controls for the link ─────────────────────────────
        // Two ways to pin source content onto this link so the AI sees it:
        //   1. "↓ retrieve context" — auto-fetch (works for articles; YouTube
        //      is unreliable because HF's IP gets a stripped-down page)
        //   2. "✎ paste manually" — open an inline textarea where the user
        //      pastes the transcript (or any other body) themselves
        const ctxStatus = h('span', { className: 'canvas-item-ctx-status' });
        const pasteBox = h('div', { className: 'canvas-item-ctx-paste',
          style: { display: 'none' } });
        function refreshCtxStatus() {
          clear(ctxStatus);
          if (item.content && item.content.body) {
            const kind = item.content.kind || 'fetched';
            const len = item.content.body.length;
            ctxStatus.appendChild(h('span', { className: 'canvas-item-ctx-ok' },
              '✓ ', kind, ' · ', String(len), ' chars'));
            ctxStatus.appendChild(h('button', {
              className: 'canvas-item-ctx-clear',
              title: 'remove the stored content',
              onClick: () => {
                if (!confirm('Clear the stored context for this link?')) return;
                item.content = null;
                queueSave();
                refreshCtxStatus();
                ctxBtn.textContent = '↓ retrieve context';
              },
            }, '×'));
          } else if (item.content && item.content.error) {
            ctxStatus.appendChild(h('span', { className: 'canvas-item-ctx-err' },
              '✗ ', item.content.error.slice(0, 60)));
          }
        }
        const ctxBtn = h('button', {
          className: 'canvas-item-ctx-btn',
          onClick: async () => {
            const url = (item.url || '').trim();
            if (!url) { alert('add a URL first'); return; }
            ctxBtn.disabled = true;
            ctxBtn.textContent = '… fetching';
            clear(ctxStatus);
            try {
              const r = await gone('link fetch', 'a browser page cannot fetch arbitrary URLs (SPEC §7)');
              item.content = {
                url: r.url,
                kind: r.kind,
                title: r.title,
                body: r.body,
                error: r.error || '',
                fetched_at: new Date().toISOString(),
              };
              queueSave();
              refreshCtxStatus();
            } catch (e) {
              item.content = { url, kind: 'error', title: '', body: '', error: String(e.message || e), fetched_at: new Date().toISOString() };
              queueSave();
              refreshCtxStatus();
            } finally {
              ctxBtn.disabled = false;
              ctxBtn.textContent = item.content && item.content.body ? '↻ re-fetch' : '↓ retrieve context';
            }
          },
        }, item.content && item.content.body ? '↻ re-fetch' : '↓ retrieve context');

        // Manual-paste toggle. Opens an editable textarea that writes directly
        // to item.content.body. For YouTube: copy the transcript from the
        // "Show transcript" panel (⋮ menu → Show transcript → select all → ⌘C)
        // and paste it here.
        const pasteTA = h('textarea', {
          className: 'canvas-item-ctx-paste-ta',
          placeholder: 'paste a transcript, article body, or any source text here…',
        });
        pasteTA.value = (item.content && item.content.body && item.content.kind === 'manual')
          ? item.content.body : '';
        const pasteSave = h('button', {
          className: 'btn-primary canvas-item-ctx-paste-save',
          onClick: () => {
            const text = pasteTA.value.trim();
            if (!text) { pasteBox.style.display = 'none'; return; }
            item.content = {
              url: item.url || '',
              kind: 'manual',
              title: 'pasted source',
              body: text,
              error: '',
              fetched_at: new Date().toISOString(),
            };
            queueSave();
            refreshCtxStatus();
            ctxBtn.textContent = '↻ re-fetch';
            pasteBox.style.display = 'none';
          },
        }, 'save');
        const pasteCancel = h('button', { className: 'side-action',
          onClick: () => { pasteBox.style.display = 'none'; } }, 'cancel');
        pasteBox.appendChild(pasteTA);
        pasteBox.appendChild(h('div', { className: 'canvas-item-ctx-paste-actions' },
          pasteCancel, pasteSave));

        const pasteBtn = h('button', {
          className: 'canvas-item-ctx-btn canvas-item-ctx-paste-btn',
          title: 'paste a transcript / article body manually',
          onClick: () => {
            const visible = pasteBox.style.display !== 'none';
            pasteBox.style.display = visible ? 'none' : 'flex';
            if (!visible) setTimeout(() => pasteTA.focus(), 30);
          },
        }, '✎ paste');

        el.appendChild(h('div', { className: 'canvas-item-ctx-row' },
          ctxBtn, pasteBtn, ctxStatus));
        el.appendChild(pasteBox);
        refreshCtxStatus();

        // Show cached preview immediately on first render (if any)
        refreshLink(el, item);
      }
      bindDrag(el, handle, item);
      return el;
    }

    async function refreshLink(el, item) {
      // ── "open ↗" link
      let goLink = el.querySelector('.canvas-item-go');
      if (item.url && /^https?:/.test(item.url)) {
        if (!goLink) {
          goLink = h('a', { className: 'canvas-item-go', target: '_blank' }, 'open ↗');
          el.appendChild(goLink);
        }
        goLink.href = item.url;
      } else if (goLink) {
        goLink.remove();
      }

      // ── OG preview card (image + title + desc)
      let preview = el.querySelector('.canvas-item-preview');
      if (!item.url || !/^https?:/.test(item.url)) {
        if (preview) preview.remove();
        return;
      }

      // Skip refetch if URL hasn't changed since last preview
      if (item._previewUrl === item.url && preview) return;
      item._previewUrl = item.url;

      if (!preview) {
        preview = h('div', { className: 'canvas-item-preview' });
        // Insert above the "open ↗" link
        if (goLink) el.insertBefore(preview, goLink);
        else el.appendChild(preview);
      }

      // If we have a cached OG, render it immediately while we refresh in background
      function renderOg(og) {
        clear(preview);
        if (!og || og.error) {
          preview.appendChild(h('div', { className: 'canvas-item-preview-err' }, 'no preview'));
          return;
        }
        if (og.image) preview.appendChild(h('img', {
          className: 'canvas-item-preview-img', src: og.image, loading: 'lazy', alt: '',
        }));
        const body = h('div', { className: 'canvas-item-preview-body' });
        body.appendChild(h('div', { className: 'canvas-item-preview-title' }, og.title || og.site_name || og.url));
        if (og.description) body.appendChild(h('div', { className: 'canvas-item-preview-desc' }, og.description.slice(0, 160)));
        body.appendChild(h('div', { className: 'canvas-item-preview-site' }, og.site_name || ''));
        preview.appendChild(body);
      }

      if (item.og) renderOg(item.og);
      else {
        clear(preview);
        preview.appendChild(h('div', { className: 'canvas-item-preview-loading' }, 'fetching preview…'));
      }

      const og = await fetchLinkPreview(item.url);
      if (og && !og.error) {
        item.og = og;
        queueSave();
        renderOg(og);
      } else if (!item.og) {
        // No cached preview, and the fetch errored — show the error.
        renderOg(og);
      }
      // else: keep the cached item.og visible, swallow the transient error.
    }

    function bindDrag(el, handle, item) {
      handle.addEventListener('pointerdown', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        e.preventDefault();
        e.stopPropagation();  // don't trigger the viewport's pan handler
        handle.setPointerCapture && handle.setPointerCapture(e.pointerId);
        const sx = e.clientX, sy = e.clientY;
        const sl = item.x || 0, st = item.y || 0;
        el.classList.add('dragging');
        const mv = (ev) => {
          // Divide screen-space delta by zoom so the item tracks the cursor
          // at any zoom level (10px screen-move at 0.5x = 20 world-px).
          item.x = sl + (ev.clientX - sx) / zoom;
          item.y = st + (ev.clientY - sy) / zoom;
          el.style.left = item.x + 'px';
          el.style.top  = item.y + 'px';
        };
        const up = () => {
          el.classList.remove('dragging');
          document.removeEventListener('pointermove', mv);
          document.removeEventListener('pointerup', up);
          queueSave();
        };
        document.addEventListener('pointermove', mv);
        document.addEventListener('pointerup', up);
      });
    }

    function genItemId() {
      return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    function addItem(type) {
      // Drop the new item near the center of the current viewport in world space.
      const [wx, wy] = viewportCenterWorld();
      const cx = wx - 130, cy = wy - 60;
      let item;
      if (type === 'text') item = { id: genItemId(), type, x: cx, y: cy, w: 280, text: '' };
      else if (type === 'image') item = { id: genItemId(), type, x: cx, y: cy, w: 280, asset: '', caption: '' };
      else item = { id: genItemId(), type, x: cx, y: cy, w: 320, url: '', title: '' };
      page.meta.layout.push(item);
      surface.appendChild(buildItem(item));
      queueSave();
      return item;
    }

    function removeItem(id) {
      page.meta.layout = page.meta.layout.filter((i) => i.id !== id);
      const el = surface.querySelector('[data-id="' + id + '"]');
      if (el) el.remove();
      queueSave();
    }

    async function uploadImageFile(file, atX, atY) {
      let asset = null, assetUrl = null;
      try {
        const j = await SB.data().writeAsset(file);
        if (j && j.ok === false) throw new Error('refused: ' + j.reason);
        asset = j.path;
        assetUrl = j.url;
      } catch (e) {
        alert('image upload failed: ' + e.message);
        return null;
      }
      const item = { id: genItemId(), type: 'image', x: atX, y: atY, w: 280, asset, assetUrl, caption: '' };
      page.meta.layout.push(item);
      surface.appendChild(buildItem(item));
      queueSave();
      return item;
    }

    // Drop-to-add (only on boards that allow images)
    if (withImages) {
      viewport.addEventListener('dragover', (e) => {
        if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          viewport.classList.add('dropping');
        }
      });
      viewport.addEventListener('dragleave', () => viewport.classList.remove('dropping'));
      viewport.addEventListener('drop', async (e) => {
        viewport.classList.remove('dropping');
        if (!e.dataTransfer || !e.dataTransfer.files.length) return;
        e.preventDefault();
        // Convert the drop point from screen coords to world coords.
        const [wx, wy] = screenToWorld(e.clientX, e.clientY);
        let x = wx - 140;
        let y = wy - 60;
        for (const f of e.dataTransfer.files) {
          if (!f.type.startsWith('image/')) continue;
          await uploadImageFile(f, x, y);
          x += 24; y += 24;
        }
      });
    }

    // Paste-to-add: window-level listener while this board is mounted.
    // Image clipboard data → image item, URL text → link item with auto preview,
    // plain text → text item. Skipped when the focus is inside a card's
    // textarea/input so normal paste still works there.
    const onPaste = (e) => {
      const tgt = e.target;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA')) return;
      const items = e.clipboardData && e.clipboardData.items;
      if (!items || !items.length) return;

      const centerXY = () => {
        const [wx, wy] = viewportCenterWorld();
        return [wx - 130, wy - 80];
      };

      // First pass: image data trumps text (e.g. screenshots paste as both).
      for (const it of items) {
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) {
            e.preventDefault();
            const [x, y] = centerXY();
            uploadImageFile(f, x, y);
            return;
          }
        }
      }

      // Second pass: text → URL becomes a link card; otherwise a text card.
      for (const it of items) {
        if (it.kind === 'string' && (it.type === 'text/plain' || it.type === 'text/uri-list')) {
          e.preventDefault();
          it.getAsString((text) => {
            const t = (text || '').trim();
            if (!t) return;
            const [x, y] = centerXY();
            if (/^https?:\/\/\S+$/i.test(t) && t.length < 2000) {
              const link = addItem('link');
              link.x = x; link.y = y; link.url = t;
              const el = surface.querySelector('[data-id="' + link.id + '"]');
              if (el) {
                el.style.left = x + 'px'; el.style.top = y + 'px';
                const urlEl = el.querySelector('.canvas-item-url');
                if (urlEl) urlEl.value = t;
                refreshLink(el, link);
              }
              queueSave();
            } else {
              const txt = addItem('text');
              txt.x = x; txt.y = y; txt.text = t;
              const el = surface.querySelector('[data-id="' + txt.id + '"]');
              if (el) {
                el.style.left = x + 'px'; el.style.top = y + 'px';
                const ta = el.querySelector('.canvas-item-text');
                if (ta) ta.value = t;
              }
              queueSave();
            }
          });
          return;
        }
      }
    };
    window.addEventListener('paste', onPaste);
    if (typeof onBodyTeardown === 'function') {
      onBodyTeardown(() => window.removeEventListener('paste', onPaste));
    }

    const toolbarKids = READ_ONLY ? [] : [
      h('button', { onClick: () => addItem('text') }, '+ text'),
      h('button', { onClick: () => addItem('link') }, '+ link'),
    ];
    if (withImages && !READ_ONLY) {
      toolbarKids.push(h('label', { className: 'canvas-toolbar-upload' },
        h('input', {
          type: 'file', accept: 'image/*', multiple: true,
          style: { display: 'none' },
          onChange: async (e) => {
            const [wx, wy] = viewportCenterWorld();
            let dx = 0;
            for (const f of e.target.files) {
              await uploadImageFile(f, wx - 130 + dx, wy - 80 + dx);
              dx += 24;
            }
            e.target.value = '';
          },
        }),
        '+ image'));
    }
    // (Sketching tools live in a separate floating toolbar — see further down.)

    // Zoom controls (right side of toolbar)
    toolbarKids.push(h('div', { className: 'canvas-toolbar-spacer' }));
    toolbarKids.push(h('button', {
      className: 'canvas-expand-btn',
      title: 'expand canvas to full screen (hides app + browser chrome; Esc to exit)',
      onClick: async () => {
        const wantFs = !app.canvasFullscreen;
        // The body class is the source of truth for layout; the real OS
        // fullscreen request is "best effort" on top (browsers gate it
        // to user-gesture handlers, and some — old iOS Safari — don't
        // support requestFullscreen on arbitrary elements).
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
        } catch (_) { /* user denied or unsupported — in-page fullscreen still works */ }
        setTimeout(() => { applyTransform(); }, 80);
      },
    }, '⛶ expand'));
    toolbarKids.push(h('div', { className: 'canvas-zoom-controls' },
      h('button', { className: 'canvas-zoom-btn', title: 'zoom out',
        onClick: () => zoomAt(
          viewport.getBoundingClientRect().left + viewport.clientWidth / 2,
          viewport.getBoundingClientRect().top + viewport.clientHeight / 2,
          0.85,
        ) }, '−'),
      (zoomReadout = h('button', { className: 'canvas-zoom-readout', title: 'click to reset to 100%',
        onClick: () => resetView() }, '100%')),
      h('button', { className: 'canvas-zoom-btn', title: 'zoom in',
        onClick: () => zoomAt(
          viewport.getBoundingClientRect().left + viewport.clientWidth / 2,
          viewport.getBoundingClientRect().top + viewport.clientHeight / 2,
          1.15,
        ) }, '+'),
      h('button', { className: 'canvas-zoom-btn', title: 'fit all items',
        onClick: () => fitView() }, 'fit')));
    toolbarKids.push(h('div', { className: 'canvas-toolbar-hint' },
      page.meta.layout.length, ' items · ',
      page.meta.edges.length ? page.meta.edges.length + ' connections · ' : '',
      'drag empty area to pan · ⌘+scroll to zoom'));
    const toolbar = h('div', { className: 'canvas-toolbar' }, ...toolbarKids);

    page.meta.layout.forEach((it) => surface.appendChild(buildItem(it)));
    renderAllEdges();     // connections from the .canvas file (read-only)
    renderAllStrokes();   // page-level strokes (whole canvas sketch board)
    viewport.appendChild(toolbar);
    viewport.appendChild(surface);

    // ── Sketch toolbar: docked at bottom-center of the canvas viewport ──
    // Tools: Move (default) / Pen / Eraser. Picking a tool drives BOTH
    // the mouse and the Apple Pencil — no separate toggles. Finger always
    // pans (we forbid drawing on touch by design).
    const skBar = h('div', { className: 'sk-float' });

    // Lucide-style stroke icons. Inline so the SVG inherits currentColor
     // and scales with the .sk-float-btn svg size rule in CSS.
    const SK_ICONS = {
      hand:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 1 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>',
      pen:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21.17 6.81a1 1 0 0 0-3.98-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/><path d="m15 5 4 4"/></svg>',
      erase: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3a2.5 2.5 0 0 1 0-3.5l9.6-9.6a2.5 2.5 0 0 1 3.5 0l5.6 5.6a2.5 2.5 0 0 1 0 3.5L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>',
      undo:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>',
      redo:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg>',
    };

    refreshFloat = function refreshFloatImpl() {
      clear(skBar);
      const modeBtn = (m, iconKey, title) => h('button', {
        className: 'sk-float-btn' + (boardTool.mode === m ? ' active' : ''),
        title,
        html: SK_ICONS[iconKey],
        onClick: (e) => { e.stopPropagation(); boardTool.mode = m; refreshFloat(); },
      });
      skBar.appendChild(modeBtn('move',  'hand',  'Move + pan + drag items'));
      skBar.appendChild(modeBtn('pen',   'pen',   'Pen — draw on the canvas'));
      skBar.appendChild(modeBtn('erase', 'erase', 'Eraser — drag over strokes to remove'));
      skBar.appendChild(h('div', { className: 'sk-float-sep' }));

      // Colors + widths shown only when the pen tool is active.
      if (boardTool.mode === 'pen') {
        ['#1a1a1a', '#dc2626', '#2563eb', '#15803d'].forEach((c) => {
          skBar.appendChild(h('button', {
            className: 'sk-float-color' + (boardTool.color === c ? ' active' : ''),
            style: { background: c }, title: 'Color ' + c,
            onClick: (e) => { e.stopPropagation(); boardTool.color = c; refreshFloat(); },
          }));
        });
        skBar.appendChild(h('div', { className: 'sk-float-sep' }));
        [[1.5, '·'], [3, '•'], [6, '⬤']].forEach(([w, lab]) => {
          skBar.appendChild(h('button', {
            className: 'sk-float-width' + (boardTool.width === w ? ' active' : ''),
            title: 'Width ' + w + 'px',
            onClick: (e) => { e.stopPropagation(); boardTool.width = w; refreshFloat(); },
          }, lab));
        });
        skBar.appendChild(h('div', { className: 'sk-float-sep' }));
      }

      skBar.appendChild(h('button', {
        className: 'sk-float-btn',
        title: 'Undo (⌘Z)',
        disabled: sketchHistory.length === 0 ? 'disabled' : null,
        html: SK_ICONS.undo,
        onClick: (e) => { e.stopPropagation(); undoStroke(); },
      }));
      skBar.appendChild(h('button', {
        className: 'sk-float-btn',
        title: 'Redo (⌘⇧Z)',
        disabled: sketchRedo.length === 0 ? 'disabled' : null,
        html: SK_ICONS.redo,
        onClick: (e) => { e.stopPropagation(); redoStroke(); },
      }));
    };
    refreshFloat();

    // Belt-and-suspenders: explicitly stop pointerdown / click / touchstart
    // from bubbling out of the docked bar so the canvas viewport never
    // mistakes a button tap for a draw / pan.
    skBar.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
    skBar.addEventListener('click', (e) => { e.stopPropagation(); });
    skBar.addEventListener('touchstart', (e) => { e.stopPropagation(); }, { passive: true });

    if (!READ_ONLY) viewport.appendChild(skBar);

    // Keyboard: ⌘Z / ⌘⇧Z for undo / redo while this canvas is mounted.
    const onCanvasKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        if (e.shiftKey) redoStroke(); else undoStroke();
      }
    };
    window.addEventListener('keydown', onCanvasKey);
    if (typeof onBodyTeardown === 'function') {
      onBodyTeardown(() => window.removeEventListener('keydown', onCanvasKey));
    }

    // When V2PageView unmounts (user navigates away), drop the fullscreen
    // body class so the next screen renders normally.
    if (typeof onBodyTeardown === 'function') {
      onBodyTeardown(() => {
        if (app.canvasFullscreen) {
          app.canvasFullscreen = false;
          document.body.classList.remove('canvas-fullscreen');
        }
      });
    }

    // Initial view: fit all items if any, otherwise pan to (0,0).
    setTimeout(() => {
      applyTransform();  // initial render with zoom=1, pan=0,0
      if (page.meta.layout.length) fitView();
    }, 0);

    return viewport;
  }

  // Thin wrappers — keep the dispatch site simple.
  // Both boards support images now — canvas + inspo only differ visually (canvas
  // = neutral grid, inspo = warmer pink-tinted grid). Functionally identical.
  function renderCanvasBody() { return renderBoardBody({ withImages: true, kindLabel: 'canvas' }); }
  function renderInspoBody()  { return renderBoardBody({ withImages: true, kindLabel: 'inspo'  }); }

  function renderSnippetBody() {
    return h('div', { className: 'page-body snippet-body' },
      h('textarea', {
        className: 'page-body-ta snippet-ta',
        placeholder: 'a quick thought…',
        value: page.body,
        onInput: (e) => { page.body = e.target.value; queueSave(); },
      }));
  }

  function renderMarkdownBody() {
    if (!page.meta) page.meta = {};
    const wrap = h('div', { className: 'page-body md-body' });
    const article = h('article', { className: 'md-article' });
    const editBox = h('textarea', {
      className: 'page-body-ta md-edit-ta',
      placeholder: 'write markdown…\n\n## section headers\n- bullet lists\n\n> blockquote with em-dash and page no.\n\nUse [[id]] for mentions and {{tag:foo}} for inline tags.',
      value: page.body,
      onInput: (e) => {
        page.body = e.target.value;
        queueSave();
        clearTimeout(renderTimer);
        renderTimer = setTimeout(() => paintArticle(), 350);
      },
    });
    let renderTimer;
    let mode = (page.body && page.body.trim()) ? 'view' : 'edit';

    async function paintArticle() {
      clear(article);
      // Frontmatter pre-block (Source · Article / id / type / etc.)
      const fmRows = [];
      const m = KIND_META[page.kind] || {};
      fmRows.push(['id',       page.id]);
      fmRows.push(['kind',     m.label || page.kind]);
      if (page.tags && page.tags.length)
        fmRows.push(['tags',     page.tags.join(', ')]);
      if (page.meta && page.meta.url)
        fmRows.push(['url',      page.meta.url]);
      if (page.meta && page.meta.captured)
        fmRows.push(['captured', String(page.meta.captured)]);
      if (page.meta && page.meta.author)
        fmRows.push(['author',   String(page.meta.author)]);
      const fmEl = h('pre', { className: 'md-frontmatter' },
        '---\n',
        ...fmRows.map(([k, v]) => k.padEnd(10) + ' ' + v + '\n'),
        '---');
      article.appendChild(fmEl);

      // Render the markdown body via the server
      const body = (page.body || '').trim();
      if (!body) {
        article.appendChild(h('div', { className: 'md-empty' },
          'Empty. Switch to edit mode to write.'));
      } else {
        try {
          const r = SB.data().renderHtml(body);
          const rendered = h('div', { className: 'md-rendered', html: r.html });
          const idx = await getPageIndex();
          decorateMentions(rendered);  // [[Title]] → clickable page links (6.10)
          decorateHashtags(rendered);       // #tags → chips
          article.appendChild(rendered);
        } catch (e) {
          article.appendChild(h('div', { className: 'md-empty' }, 'Failed to render: ', String(e.message)));
        }
      }
    }

    function applyMode() {
      wrap.classList.toggle('md-mode-edit', mode === 'edit');
      wrap.classList.toggle('md-mode-view', mode === 'view');
      modeBtn.textContent = mode === 'view' ? '✎ edit' : '✓ done';
    }

    const modeBtn = h('button', { className: 'md-mode-btn', onClick: () => {
      mode = mode === 'view' ? 'edit' : 'view';
      if (mode === 'view') paintArticle();
      applyMode();
    } }, '✎ edit');

    wrap.appendChild(h('div', { className: 'md-mode-row' }, modeBtn));
    wrap.appendChild(article);
    wrap.appendChild(editBox);
    paintArticle();
    applyMode();
    return wrap;
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
        const previewBox = h('div', { className: 'bm-preview' });
        renderPreview(previewBox, link.og);
        let urlTimer;
        async function refetch() {
          const url = (link.url || '').trim();
          if (!url || !/^https?:\/\//i.test(url)) {
            link.og = null;
            clear(previewBox);
            syncLegacy(); queueSave();
            return;
          }
          clear(previewBox);
          previewBox.appendChild(h('div', { className: 'bm-preview-loading' }, 'fetching preview…'));
          const og = await fetchLinkPreview(url);
          if (og && !og.error) {
            link.og = og;
            syncLegacy(); queueSave();
          }
          renderPreview(previewBox, og);
        }
        const urlInput = h('input', {
          className: 'bm-url-input',
          placeholder: 'https://…',
          value: link.url || '',
          onInput: (e) => {
            link.url = e.target.value;
            syncLegacy(); queueSave();
            clearTimeout(urlTimer);
            urlTimer = setTimeout(refetch, 500);
          },
          onKeyDown: (e) => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(urlTimer); refetch(); } },
        });
        linksWrap.appendChild(h('div', { className: 'bm-link-card' },
          h('div', { className: 'bm-link-card-hd' },
            h('span', { className: 'bm-link-card-n' }, '#' + (idx + 1)),
            h('button', { className: 'bm-link-card-rm', title: 'remove this link',
              onClick: () => {
                if (page.meta.links.length === 1 && !link.url) return;
                page.meta.links.splice(idx, 1);
                syncLegacy(); queueSave(); renderLinks();
              } }, '×')),
          h('div', { className: 'bm-url-row' },
            urlInput,
            h('button', { className: 'bm-refresh', title: 'refresh preview',
              onClick: () => { clearTimeout(urlTimer); refetch(); } }, '↻'),
            h('a', { className: 'bm-open', href: link.url || '#', target: '_blank',
              onClick: (e) => { if (!link.url) e.preventDefault(); } }, 'open ↗')),
          previewBox));
      });
      // "+ add link" button at the bottom
      linksWrap.appendChild(h('button', {
        className: 'bm-link-add',
        onClick: () => {
          page.meta.links.push({ url: '', og: null });
          syncLegacy(); queueSave(); renderLinks();
        },
      }, '+ add link'));
    }

    // Ensure at least one link card is visible
    if (page.meta.links.length === 0) page.meta.links.push({ url: '', og: null });
    renderLinks();

    const linkSection = h('div', { className: 'bm-section bm-section-link' },
      h('div', { className: 'bm-section-l' }, 'LINKS · ', String(page.meta.links.length)),
      linksWrap);

    const contextSection = h('div', { className: 'bm-section bm-section-context' },
      h('div', { className: 'bm-section-l' }, 'CONTEXT'),
      h('textarea', {
        className: 'page-body-ta bm-context-ta',
        placeholder: 'why this matters · what to remember · who else cares…',
        value: page.body,
        onInput: (e) => { page.body = e.target.value; queueSave(); },
      }));

    wrap.appendChild(linkSection);
    wrap.appendChild(contextSection);
    return wrap;
  }

  // ── Project renderer (kind=project) ───────────────────────────────────
  // A project is a container. Its own body is the README. Everything else
  // that mentions this project shows up grouped by kind below.
  function renderProjectBody() {
    if (!page.meta) page.meta = {};
    const wrap = h('div', { className: 'page-body project-body' });

    const headerCard = h('div', { className: 'pj-card pj-header' });
    function refreshHeader() {
      clear(headerCard);
      headerCard.appendChild(h('div', { className: 'pj-name' }, page.title || 'Untitled project'));
      const meta = page.meta || {};
      const statusChip = meta.status
        ? h('span', { className: 'pj-status pj-status-' + String(meta.status) }, meta.status)
        : null;
      const dateChip = (meta.start_date || meta.end_date)
        ? h('span', { className: 'pj-dates' },
            meta.start_date || '?', ' → ', meta.end_date || 'ongoing')
        : null;
      if (statusChip || dateChip) {
        headerCard.appendChild(h('div', { className: 'pj-meta-row' }, statusChip, dateChip));
      }
    }
    refreshHeader();

    // ── Metadata editor (status, dates, links) ─────────────────────────
    const metaCard = h('div', { className: 'pj-card' },
      h('div', { className: 'pj-card-hd' }, 'PROJECT META'),
      h('div', { className: 'pj-meta-grid' },
        h('label', null,
          h('span', { className: 'cb-field-label' }, 'Status'),
          h('select', {
            value: String(page.meta.status || ''),
            onChange: (e) => { page.meta.status = e.target.value || null; queueSave(); refreshHeader(); },
          },
            h('option', { value: '' }, '—'),
            h('option', { value: 'planning' }, 'planning'),
            h('option', { value: 'active' }, 'active'),
            h('option', { value: 'paused' }, 'paused'),
            h('option', { value: 'shipped' }, 'shipped'),
            h('option', { value: 'archived' }, 'archived'),
          )),
        h('label', null,
          h('span', { className: 'cb-field-label' }, 'Start'),
          h('input', {
            type: 'text', placeholder: 'YYYY-MM-DD', value: String(page.meta.start_date || ''),
            onInput: (e) => { page.meta.start_date = e.target.value; queueSave(); refreshHeader(); },
          })),
        h('label', null,
          h('span', { className: 'cb-field-label' }, 'End'),
          h('input', {
            type: 'text', placeholder: 'YYYY-MM-DD or "ongoing"', value: String(page.meta.end_date || ''),
            onInput: (e) => { page.meta.end_date = e.target.value; queueSave(); refreshHeader(); },
          }))));

    // ── README / description ────────────────────────────────────────────
    const readme = h('div', { className: 'pj-card pj-readme' },
      h('div', { className: 'pj-card-hd' }, 'DESCRIPTION / README'),
      h('textarea', {
        className: 'page-body-ta',
        placeholder: 'what this project is, why it matters, what success looks like…',
        value: page.body,
        onInput: (e) => { page.body = e.target.value; queueSave(); },
      }));

    // ── Inside this project: grouped grid of pages that mention this id ─
    const insideCard = h('div', { className: 'pj-card pj-inside' });
    const projectId = page.id;
    let insidePages = [];

    async function loadInside() {
      clear(insideCard);
      insideCard.appendChild(h('div', { className: 'pj-card-hd' }, 'INSIDE THIS PROJECT'));
      insideCard.appendChild(h('div', { className: 'sb-meta' }, 'loading…'));
      try {
        const data = await SB.data().pages({ mention: projectId, limit: 500 });
        insidePages = (data.items || []).filter((p) => p.id !== projectId);
        renderInside();
      } catch (e) {
        clear(insideCard);
        insideCard.appendChild(h('div', { className: 'pj-card-hd' }, 'INSIDE THIS PROJECT'));
        insideCard.appendChild(h('div', { className: 'sb-meta' }, '✗ ', String(e.message || e)));
      }
    }

    function pageCard(p) {
      const m = KIND_META[p.kind] || {};
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
          h('span', { className: 'pj-inside-glyph' }, kindIcon(m.kind)),
          h('span', { className: 'pj-inside-kind' }, m.label || p.kind)),
        h('div', { className: 'pj-inside-title' }, p.title || p.slug || '(untitled)'),
        p.body
          ? h('div', { className: 'pj-inside-snip' }, firstLineOf(p.body, 100))
          : null);
    }

    function renderInside() {
      clear(insideCard);
      const addBar = h('div', { className: 'pj-add-bar' },
        h('span', { className: 'pj-add-label' }, '+ create inside this project:'),
        ...KIND_ORDER.map((k) => {
          const meta = KIND_META[k] || {};
          return h('button', {
            className: 'pj-add-btn',
            title: meta.hint || ('Add a new ' + k),
            style: { '--k-c': meta.color },
            onClick: async () => {
              try {
                const p = await SB.data().createPage({
                  kind: k, title: '', body: '',
                  mentions: [projectId],
                });
                if (!p || !p.id) throw new Error('server returned no page id — ' + JSON.stringify(p).slice(0, 180));
                invalidatePageIndex();
                cacheSetPage(p);
                const t = activeTab();
                if (t) { t.parentRoute = 'project:' + projectId; persistTabs(); }
                openPage(p.id);
              } catch (err) {
                alert('Create failed: ' + err.message);
              }
            },
          }, meta.glyph || '·', ' ', meta.label || k);
        }));
      insideCard.appendChild(h('div', { className: 'pj-card-hd' },
        'INSIDE THIS PROJECT · ', String(insidePages.length), ' pages'));
      insideCard.appendChild(addBar);

      if (insidePages.length === 0) {
        insideCard.appendChild(h('div', { className: 'pj-empty' },
          'Nothing here yet. Use the buttons above to create a topic / canvas / etc. — it\'ll auto-link to this project. Or open an existing page and add ',
          h('code', null, '[[' + projectId + ']]'),
          ' to its mentions to bring it in.'));
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
            h('span', { style: { color: m.color || 'inherit' } }, m.glyph || '·'),
            ' ',
            (m.label || k).toUpperCase(),
            h('span', { className: 'pj-group-ct' }, ' · ', String(groups[k].length))),
          h('div', { className: 'pj-group-grid' },
            groups[k].map(pageCard)));
        insideCard.appendChild(section);
      });
    }

    loadInside();

    wrap.appendChild(headerCard);
    wrap.appendChild(metaCard);
    wrap.appendChild(readme);
    wrap.appendChild(insideCard);
    return wrap;
  }

  // ── Side renderers ────────────────────────────────────────────────────
  // Real per-page chat. Conversation lives in page.meta.thread and is sent as
  // history on every turn. The send itself goes through sendPageChat() which
  // owns persistence + notifications, so chat survives navigation.
  function renderPageChat(open) {
    if (!page.meta.thread || !Array.isArray(page.meta.thread)) page.meta.thread = [];
    const pageId = page.id;

    // Restore last-used chat width from localStorage (per kind so canvas/inspo
    // can have a wider default than topic).
    const widthKey = 'sb-chat-w-' + page.kind;
    const savedW = parseInt(localStorage.getItem(widthKey) || '0', 10);
    const defaultW = page.kind === 'canvas' || page.kind === 'inspo' ? 420 : 340;
    const initialW = savedW > 280 ? savedW : defaultW;

    const aside = h('aside', { className: 'page-chat' + (open ? '' : ' collapsed') });

    // Apply the initial width to the page-grid parent (CSS var → grid column).
    // We can't set it now because aside isn't mounted yet, so defer with a
    // microtask. The .page-grid uses `grid-template-columns: 1fr var(--chat-w)`.
    function applyWidth(w) {
      const clamped = Math.max(280, Math.min(800, w));
      const grid = aside.closest('.page-grid');
      if (grid) grid.style.setProperty('--chat-w', clamped + 'px');
      return clamped;
    }
    queueMicrotask(() => applyWidth(initialW));

    // Drag handle on the left edge for resizing the chat column
    const resizer = h('div', { className: 'page-chat-resizer', title: 'drag to resize' });
    let dragging = false;
    let startX = 0, startW = 0;
    resizer.addEventListener('mousedown', (e) => {
      dragging = true; startX = e.clientX;
      // Read current width from CSS var (fall back to aside offset if unset)
      const grid = aside.closest('.page-grid');
      const cssW = grid && parseInt(getComputedStyle(grid).getPropertyValue('--chat-w'), 10);
      startW = cssW || aside.offsetWidth || initialW;
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });
    const onMouseMove = (e) => {
      if (!dragging) return;
      applyWidth(startW + (startX - e.clientX));
    };
    const onMouseUp = () => {
      if (!dragging) return;
      dragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // Persist the new width per-kind
      const w = aside.offsetWidth;
      if (w) { try { localStorage.setItem(widthKey, String(w)); } catch (_) {} }
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    onBodyTeardown(() => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    });

    const threadList = h('div', { className: 'page-chat-thread' });
    const input = h('textarea', {
      className: 'page-chat-input',
      placeholder: 'message… (⏎ to send, ⇧⏎ for newline)',
      onKeyDown: (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
      },
    });

    // Pull the thread from the page cache (the source of truth — sendPageChat
    // patches the cached page on every state change). Fallback to the closure
    // page if nothing's cached yet.
    function getThread() {
      const cached = cacheGetPage(pageId);
      return (cached && cached.meta && Array.isArray(cached.meta.thread))
        ? cached.meta.thread
        : (page.meta.thread || []);
    }

    function renderThread() {
      const thread = getThread();
      clear(threadList);
      if (!thread.length) {
        threadList.appendChild(h('div', { className: 'page-chat-empty' },
          'Talk about this ', KIND_META[page.kind]?.label?.toLowerCase() || 'page', '.',
          h('br'),
          'The AI sees About Me + this page + everything you attach.'));
        return;
      }
      thread.forEach((m) => {
        const c = h('div', { className: 'page-chat-msg-c md-body' });
        // User messages render as plain text (their bullets/asterisks are
        // probably literal). Assistant messages get full markdown treatment.
        if (m.role === 'assistant') {
          renderMarkdown(m.content).forEach((node) => c.appendChild(node));
        } else {
          c.textContent = m.content;
        }
        threadList.appendChild(h('div', { className: 'page-chat-msg page-chat-msg-' + m.role },
          h('div', { className: 'page-chat-msg-r' }, m.role === 'user' ? 'you' : m.role),
          c));
      });
      threadList.scrollTop = threadList.scrollHeight;
    }

    function send() {
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      // Mirror the optimistic state in the closure page so renderThread shows
      // it immediately even before the cache emit lands.
      page.meta.thread = getThread();
      sendPageChat(pageId, text);
    }

    // Re-render when sendPageChat reports a thread update for this page
    const unsubscribe = onChatThreadChange((changedId) => {
      if (changedId === pageId) {
        // Keep closure thread mirror in sync, so re-renders elsewhere see fresh data
        const t = getThread();
        page.meta.thread = t;
        renderThread();
      }
    });
    onBodyTeardown(unsubscribe);

    const clearBtn = h('button', { className: 'page-chat-clear',
      onClick: async () => {
        if (!confirm('Clear all messages in this thread?')) return;
        const cached = cacheGetPage(pageId) || page;
        cached.meta = cached.meta || {};
        cached.meta.thread = [];
        cacheSetPage(cached);
        page.meta.thread = [];
        await SB.data().updatePage(pageId, { meta: cached.meta }).catch(() => {});
        emitChatThreadChange(pageId);
        layout();
      } }, 'clear');
    aside.appendChild(resizer);
    aside.appendChild(h('div', { className: 'page-chat-hd' },
      h('span', null, 'chat · this page'),
      getThread().length ? clearBtn : null,
      h('button', { className: 'sb-twk-x', onClick: () => aside.classList.toggle('collapsed') }, '─')));
    aside.appendChild(h('div', { className: 'page-chat-body' },
      threadList,
      h('div', { className: 'page-chat-input-row' }, input,
        h('button', { className: 'btn-primary page-chat-send', onClick: send }, 'send'))));

    renderThread();
    return aside;
  }
  // Alias kept for any older callers that still reach for the placeholder name.
  const renderChatPlaceholder = renderPageChat;

  function renderTopicSide() {
    const aside = h('aside', { className: 'page-chat topic-side' });

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
    aside.appendChild(h('div', { className: 'side-card' },
      h('div', { className: 'side-card-hd' }, 'METADATA'),
      h('div', { className: 'side-card-body' },
        sRow('ID',       page.id.slice(0, 8) + '…'),
        sRow('SLUG',     page.slug),
        sRow('KIND',     KIND_META[page.kind].label),
        sRow('CREATED',  fmtDate(page.created)),
        sRow('UPDATED',  fmtDate(page.updated)),
        sRow('TAGS',     String(page.tags.length)),
        sRow('MENTIONS', String(page.mentions.length)))));

    // BACKLINKS — fetched live (pages that mention this one)
    const backHd = h('div', { className: 'side-card-hd' }, 'BACKLINKS · …');
    const backBody = h('div', { className: 'side-card-body side-card-empty' }, 'loading…');
    aside.appendChild(h('div', { className: 'side-card' }, backHd, backBody));
    Promise.resolve(SB.data().backlinks(page.id)).then(({ items }) => {
      backHd.textContent = 'BACKLINKS · ' + (items ? items.length : 0);
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
        h('span', { className: 'side-link-meta' }, (KIND_META[b.kind] || {}).label || b.kind))));
      backBody.appendChild(list);
    }).catch(() => {
      backHd.textContent = 'BACKLINKS · 0';
      clear(backBody); backBody.appendChild(document.createTextNode('—'));
    });

    // SUB-PAGES
    const children = (page.meta && Array.isArray(page.meta.children)) ? page.meta.children : [];
    const childList = h('div', { className: 'side-children' });
    const subCard = h('div', { className: 'side-card' },
      h('div', { className: 'side-card-hd' }, 'SUB-PAGES · ' + children.length),
      h('div', { className: 'side-card-body' },
        childList,
        h('button', { className: 'side-action',
          onClick: createSubpage }, '+ add sub-page')));
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
            h('span', { className: 'side-link-meta' }, KIND_META[cp.kind].label)));
        });
      });
    }

    // ACTIONS
    aside.appendChild(h('div', { className: 'side-card' },
      h('div', { className: 'side-card-hd' }, 'ACTIONS'),
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
            } catch (e) { alert('Export failed: ' + e.message); }
          } }, '↓ export .md'),
        h('a', { className: 'side-action', href: '/api/v2/pages/' + page.id, target: '_blank' },
          '≡ open raw json'),
        h('button', { className: 'side-action side-action-warn',
          onClick: async () => {
            if (!await confirmDialog({
              title: 'Delete this page?',
              body: 'This removes "' + (page.title || 'this page') + '" from your vault. Any backlinks to it will become dead.',
              confirmLabel: '× delete',
              danger: true,
            })) return;
            await SB.data().deletePage(page.id);
            cacheInvalidatePage(page.id);
            onDeleted && onDeleted();
          } }, '× forget this'))));

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
          alert('Sub-pages are capped at ' + SUBPAGE_MAX_DEPTH + ' levels. ' +
                'This page is already at level ' + (depth + 1) + ' — promote it before adding more.');
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
      } catch (e) { alert('Create subpage failed: ' + e.message); }
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
    const m = KIND_META[page.kind] || KIND_META.snippet;

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
        h('span', { className: 'page-kind-pill', style: { '--k-c': m.color }, title: m.hint },
          h('span', { className: 'kind-chip-g' }, m.glyph),
          h('span', { className: 'page-kind-label' }, m.label)),
        h('input', {
          className: 'page-title-input',
          placeholder: 'Untitled',
          value: page.title,
          onInput: (e) => { page.title = e.target.value; queueSave(); },
        }),
        h('div', { className: 'page-meta-side' },
          h('span', { className: 'page-meta-when' }, 'updated ', fmtDate(page.updated)),
          obsidianUrl(page.path) ? h('a', {
            className: 'page-meta-obs', href: obsidianUrl(page.path),
            title: 'open this file in Obsidian — deeper search, backlinks, canvas arranging',
          }, 'obsidian ↗') : null,
          h('button', { className: 'page-meta-del',
            onClick: async () => {
              if (!await confirmDialog({
                title: 'Delete this page?',
                body: 'This removes "' + (page.title || 'this page') + '" from your vault. Any backlinks to it will become dead.',
                confirmLabel: '× delete',
                danger: true,
              })) return;
              await SB.data().deletePage(page.id);
              cacheInvalidatePage(page.id);
              onDeleted && onDeleted();
            } }, 'delete'))),
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
            t,
            h('button', { onClick: (e) => {
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
          page.mentions.map((mn, i) => h('span', { className: 'mention-chip rm' },
            mn,
            h('button', { onClick: () => { page.mentions.splice(i, 1); queueSave(); layout(); } }, '×'))),
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
        // Content tags: #hashtags found in the body. Read-only (you edit them by
        // typing #tag in the content). Distinct styling from page-level tags.
        (() => {
          const inline = extractInlineTags(page.body || '');
          if (!inline.length) return null;
          return h('div', { className: 'chip-strip' },
            h('span', { className: 'chip-strip-l' }, 'in content'),
            inline.map((t) => h('span', { className: 'hashtag' }, '#' + t)));
        })()));

    // Dispatch body + side per kind
    let body, side, chat;
    let extraClass = '';
    if (page.kind === 'canvas') {
      body = withBoardBody(renderCanvasBody());
      side = null;                   // 6.13: no chat composer (SPEC §16)
      extraClass = ' canvas-grid';
    } else if (page.kind === 'inspo') {
      body = withBoardBody(renderInspoBody());
      side = null;                   // 6.13
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
      const tb = renderTopicBody();
      body = tb.body;                // left: attached materials + description
      chat = tb.chatSec;             // centre: existing topic chat section
      side = renderTopicSide();      // right: metadata / backlinks / cards
      extraClass = ' topic-grid';
    } else if (page.kind === 'markdown') {
      body = renderMarkdownBody();
      side = renderTopicSide();  // reuse: METADATA / BACKLINKS / SUB-PAGES / ACTIONS
      extraClass = ' md-grid';
    } else if (page.kind === 'bookmark') {
      body = renderBookmarkBody();
      side = null;
      extraClass = ' bookmark-grid';
    } else if (page.kind === 'snippet') {
      body = renderSnippetBody();
      side = null;
      extraClass = ' snippet-grid';
    } else if (page.kind === 'project' || page.kind === 'wproject') {
      body = renderProjectBody();
      side = null;
      extraClass = ' project-grid';
    } else {
      body = renderDefaultBody();
      side = null;   // 6.13: no per-page chat composer (SPEC §16)
    }

    wrap.appendChild(h('div', { className: 'page-grid' + (side || chat ? '' : ' no-chat') + extraClass },
      h('div', { className: 'page-main' }, header, body),
      chat,   // middle column (topic only; null/undefined = skipped)
      side)); // right column
  };

  getPageCached(pageId).then((p) => {
    // A resolved-but-null page is "no such id", not a crash. Without this the
    // view throws on `p.tags` and the catch below reports a render failure.
    if (!p) throw new Error('no page with id ' + pageId);
    page = { ...p, tags: [...(p.tags || [])], mentions: [...(p.mentions || [])], meta: { ...(p.meta || {}) } };
    layout();
    // Patch the breadcrumb in place once we have the real title — crumbsFor
    // initially renders the id prefix because the page wasn't cached yet.
    try {
      const last = document.querySelector('.crumb-row > b');
      const title = page.title || page.slug;
      if (last && title) last.textContent = title;
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
  append(wrap, PageHeader('tags', null,
    'Every tag used across your pages. Click any to see the pages using it.', null));
  wrap.appendChild(h('div', { className: 'loading-stub' }, 'loading…'));
  Promise.resolve(SB.data().tags()).then(({ tags }) => {
    clear(wrap);
    append(wrap, PageHeader('tags', null,
      (tags || []).length + ' tags in the vault. Click any to filter.', null));
    if (!tags || !tags.length) {
      wrap.appendChild(EmptyState('No tags yet.', 'Add tags to your pages — they\'ll show up here.'));
      return;
    }
    const cloud = h('div', { className: 'tags-cloud' });
    const sorted = [...tags].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
    sorted.forEach((t) => {
      const weight = Math.min(1.6, 0.85 + Math.log2(t.count + 1) * 0.18);
      cloud.appendChild(h('button', {
        className: 'tag-cloud-chip',
        style: { fontSize: weight + 'em' },
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
      (items || []).length + ' pages',
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
      (items || []).length + ' pages mention this',
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
    wrap.appendChild(h('button', {
      className: 'sb-secondary',
      onClick: () => {
        me[key].push(Object.fromEntries(fields.map(([k]) => [k, ''])));
        queueSave(); layout();
      },
    }, '+ ', addLabel));
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

  async function downloadResume() {
    const r = await gone('resume export', 'an LLM feature, removed per SPEC §16');
    const blob = new Blob([r.content], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'resume.md';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function critiqueResume() {
    const out = h('div', { className: 'sb-log' }, 'asking the AI for a critique…');
    critiqueBox.replaceWith(critiqueBox = out);
    try {
      throw new Error('resume critique is gone — an LLM feature, removed per SPEC §16');
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || r.status);
      const box = h('div', { className: 'sb-log' }, data.critique || '(no response)');
      critiqueBox.replaceWith(critiqueBox = box);
    } catch (e) {
      const box = h('div', { className: 'sb-log' }, '✗ ', String(e.message || e));
      critiqueBox.replaceWith(critiqueBox = box);
    }
  }
  let critiqueBox = h('div');

  const subField = (sectionKey, fieldKey, label, kind) => {
    me[sectionKey] = me[sectionKey] || {};
    const val = me[sectionKey][fieldKey];
    const renderVal = Array.isArray(val) ? val.join(', ') : (val == null ? '' : String(val));
    return h('div', { className: 'am-field' },
      h('label', { className: 'am-lbl' }, label),
      h('input', {
        className: 'am-input',
        value: renderVal,
        placeholder: kind === 'list' ? 'comma-separated values…' : '',
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
    fields.map(([fkey, label, kind]) => subField(key, fkey, label, kind)));

  const layout = () => {
    clear(wrap);
    wrap.appendChild(h('div', { className: 'page-grid no-chat' },
      h('div', { className: 'page-main' },
        h('div', { className: 'page-hd' },
          h('div', { className: 'page-hd-row' },
            h('span', { className: 'page-kind-pill', style: { '--k-c': 'var(--k-self)' } },
              h('span', { className: 'kind-chip-g' }, '☉'),
              h('span', null, 'ABOUT ME')),
            h('span', { className: 'page-title-static' }, 'who I am'),
            h('div', { className: 'page-meta-side' },
              h('span', { className: 'page-meta-when' }, me.updated ? 'updated ' + fmtDate(me.updated) : '')))),
        h('div', { className: 'am-grid' },
          section('Identity', 'identity', [
            ['name', 'Name', 'text'],
            ['values', 'Core values', 'list'],
            ['current_focus', 'Current focus', 'text'],
          ]),
          section('Taste', 'taste', [
            ['visual', 'Visual taste', 'list'],
            ['writing', 'Writing style', 'text'],
            ['music', 'Music', 'list'],
          ]),
          section('Communication', 'communication', [
            ['tone', 'Tone the AI should match', 'text'],
            ['preferred_form', 'Preferred form (bullets/prose/etc.)', 'text'],
          ]),
          section('State', 'state', [
            ['energy_pattern', 'Energy pattern', 'text'],
            ['mood_baseline', 'Mood baseline', 'text'],
          ])),

        // ── Resume sections (stored in about_me.extras) ──────────────────
        h('div', { className: 'sect-hd', style: { marginTop: '24px' } }, 'EXPERIENCE'),
        entryList('experience', [
          ['role',     'Role',     {}],
          ['org',      'Organization', {}],
          ['start',    'Start (e.g. 2023)', {}],
          ['end',      'End (or "present")', {}],
          ['location', 'Location', {}],
          ['summary',  'Summary — what you shipped / impact', { long: true }],
        ], 'experience'),

        h('div', { className: 'sect-hd', style: { marginTop: '20px' } }, 'SKILLS'),
        entryList('skills', [
          ['name',  'Skill name', {}],
          ['area',  'Area (Code / Design / Product / …)', {}],
          ['level', 'Level (expert / proficient / learning)', {}],
        ], 'skill'),

        h('div', { className: 'sect-hd', style: { marginTop: '20px' } }, 'EDUCATION'),
        entryList('education', [
          ['school', 'School / institution', {}],
          ['degree', 'Degree', {}],
          ['field',  'Field', {}],
          ['start',  'Start', {}],
          ['end',    'End', {}],
        ], 'education'),

        h('div', { className: 'sect-hd', style: { marginTop: '20px' } }, 'HIGHLIGHTS'),
        highlightList(),

        h('div', { className: 'sb-row', style: { marginTop: '16px' } },
          h('button', { className: 'sb-primary', onClick: downloadResume }, '↓ download resume.md'),
          h('button', { className: 'sb-secondary', onClick: critiqueResume }, '⚡ critique with AI')),
        critiqueBox,

        h('div', { className: 'sect-hd', style: { marginTop: '24px' } }, 'NOTES'),
        h('textarea', {
          className: 'page-body-ta', placeholder: 'freeform reflective writing…',
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

  async function newProject() {
    const title = (prompt('Project name') || '').trim();
    if (!title) return;
    try {
      // Writes projects/<Title>/<Title>.md. The old call asked createPage for
      // kind 'project', which is not one, and landed a page with a bogus kind
      // in notes/.
      const p = await SB.data().createProject(title);
      if (p && p.ok === false) { alert('Create failed: ' + (p.message || p.reason)); return; }
      invalidatePageIndex();
      cacheSetPage(p);
      const t = activeTab();
      if (t) { t.parentRoute = 'projects'; persistTabs(); }
      openPage(p.id);
    } catch (e) {
      alert('Create failed: ' + e.message);
    }
  }

  function projectCard(p) {
    const meta = p.meta || {};
    return h('div', {
      className: 'project-card',
      onClick: (e) => {
        if (e.metaKey || e.ctrlKey) { newTab('page', p.id, { switchTo: true }); return; }
        const t = activeTab();
        if (t) { t.parentRoute = 'projects'; persistTabs(); }
        openPage(p.id);
      },
    },
      h('div', { className: 'project-card-hd' },
        h('span', { className: 'project-card-glyph' }, '⚐'),
        h('div', { className: 'project-card-name' }, p.title || p.slug || 'Untitled project'),
        meta.status ? h('span', { className: 'project-card-status project-card-status-' + meta.status }, meta.status) : null),
      p.excerpt
        ? h('div', { className: 'project-card-desc' }, firstLineOf(p.excerpt, 140))
        : h('div', { className: 'project-card-desc dim' }, 'no description yet'),
      h('div', { className: 'project-card-meta' },
        h('span', { 'data-pjcount': p.id },
          counts[p.id] != null ? (counts[p.id] + ' pages inside') : 'counting…'),
        (meta.start_date || meta.end_date)
          ? h('span', null, (meta.start_date || '?'), ' → ', (meta.end_date || 'ongoing'))
          : null));
  }

  function layout() {
    clear(wrap);
    const headerRow = h('div', { className: 'projects-hd' },
      h('div', null,
        h('h1', null, 'Projects'),
        h('p', { className: 'sb-sub' },
          busy ? 'loading…' : projects.length === 0
            ? 'no projects yet — projects are containers; create one and drop topics / canvases under it'
            : (projects.length + ' projects'))),
      h('div', { className: 'sb-row' },
        h('button', { className: 'sb-primary', onClick: newProject }, '+ new project')));

    append(wrap, [
      headerRow,
      busy
        ? h('div', { className: 'sb-meta' }, 'loading projects…')
        : (projects.length === 0
            ? EmptyState('No projects yet.',
                'Click "+ new project" to create one. Inside it you can attach topics, canvases — anything.')
            : h('div', { className: 'projects-grid' }, projects.map(projectCard))),
    ]);
  }

  load();
  return wrap;
}




/* ── settings panel ───────────────────────────────────────────────────── */
function SettingsPanel(t, setTweak, route, setRoute, onClose) {
  function seg(label, value, options, onChange) {
    return h('div', { className: 'sb-twk-row' },
      h('div', { className: 'sb-twk-lbl' }, label),
      h('div', { className: 'sb-seg' },
        options.map((o) => h('button', {
          className: 'sb-seg-btn',
          'aria-current': value === o.value ? 'true' : 'false',
          onClick: () => onChange(o.value),
        }, o.label))));
  }
  return h('div', { className: 'sb-tweaks' },
    h('div', { className: 'sb-twk-hd' },
      h('b', null, 'SETTINGS'),
      h('button', { className: 'sb-twk-x', onClick: onClose }, '✕')),
    h('div', { className: 'sb-twk-body' },
      h('div', { className: 'sb-twk-sect' }, 'Look'),
      seg('Density', t.density, [
        { value: 'compact', label: 'compact' }, { value: 'cozy', label: 'cozy' },
        { value: 'comfortable', label: 'comfy' },
      ], (v) => setTweak('density', v)),
      h('div', { className: 'sb-twk-sect' }, 'Panes'),
      h('div', { className: 'sb-twk-row sb-twk-row-h' },
        h('div', { className: 'sb-twk-lbl' }, 'Show AI activity log'),
        h('button', {
          className: 'sb-toggle', 'data-on': t.showLog ? '1' : '0', role: 'switch',
          onClick: () => setTweak('showLog', !t.showLog),
        }, h('i'))),
      h('div', { className: 'sb-twk-sect' }, 'Jump to'),
      h('div', { className: 'sb-jump' },
        [['home', 'home'], ['pages', 'all pages'], ['ask', 'ask'],
         ['graph', 'graph'], ['about-me', 'about me'], ['mention-tags', 'mention tags']]
          .map(([id, lbl]) => h('span', {
            className: 'sb-jump-chip',
            'aria-current': route === id ? 'true' : 'false',
            onClick: () => setRoute(id),
          }, lbl)))));
}

/* ── app root (v2) ────────────────────────────────────────────────────── */
const TWEAK_DEFAULTS = { theme: 'dark', density: 'compact', showLog: false };
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
  settingsOpen: false,
  createOpen: false,
  lastSynced: '',               // surfaced in sidebar footer
  logW: (() => { try { return Number(localStorage.getItem('sb.logW')) || 340; } catch (_) { return 340; } })(),
};
let currentMain = null;
const root = document.getElementById('root');

function applyLogW() {
  document.documentElement.style.setProperty('--log-w', (app.logW || 340) + 'px');
}
function setTweak(key, val) {
  app.t = { ...app.t, [key]: val };
  if (key === 'theme' || key === 'density') applyHtmlAttrs();
  render();
}
// Switch workspace mode and jump to that mode's home. One click apart.
function applyHtmlAttrs() {
  document.documentElement.setAttribute('data-theme', app.t.theme || 'dark');
  document.documentElement.setAttribute('data-density', app.t.density || 'compact');
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
    // Use a cached page title when we have one (zero round trip).
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

async function createPage(kind) {
  app.createOpen = false;
  try {
    const p = await SB.data().createPage({ kind, title: '', body: '' });
    if (!p || !p.id) throw new Error('server returned no page id — ' + JSON.stringify(p).slice(0, 180));
    invalidatePageIndex();
    await refreshCounts();
    openPage(p.id);
  } catch (e) {
    alert('Create failed: ' + e.message);
    render();
  }
}

// Work mode is project-first: the entry point is creating a project, which
// opens as a workspace where IA / flows / screens / components / tokens are
// created inside it (each mentions the project id).
async function createProjectAndOpen() {
  app.createOpen = false;
  try {
    const p = await gone('work projects', 'the wproject kind was deleted (SPEC §5)');
    if (!p || !p.id) throw new Error('server returned no page id — ' + JSON.stringify(p).slice(0, 180));
    invalidatePageIndex();
    cacheSetPage(p);
    await refreshCounts();
    openPage(p.id);
  } catch (e) {
    alert('Create failed: ' + e.message);
    render();
  }
}

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
  // Other parent routes (graph, about-me, write, tweet, backup, import…)
  // get a single crumb back to themselves.
  return [{ label: tabLabel({ route: parent }).toLowerCase(), route: parent }];
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
    const parent = (t && t.parentRoute) || 'pages';
    const chain = [home, ..._parentCrumbsFor(parent)];
    // Resolve the page title from cache when we have it; fall back to the
    // id prefix and let V2PageView patch the DOM once it loads.
    const cached = (typeof cacheGetPage === 'function' && app.openPageId)
      ? cacheGetPage(app.openPageId) : null;
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
  theme: 'dark',
  density: 'compact',
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

  const row = (label, hint, control) => h('div', { className: 'set-row' },
    h('div', { className: 'set-row-l' },
      h('div', { className: 'set-row-label' }, label),
      hint ? h('div', { className: 'set-row-hint' }, hint) : null),
    h('div', { className: 'set-row-c' }, control));

  const select = (key, options) => {
    const el = h('select', {
      className: 'set-input',
      onChange: (e) => { prefs[key] = e.target.value; savePrefs(prefs); applyHtmlAttrs2(); },
    }, options.map((o) => h('option', { value: o, selected: prefs[key] === o }, o)));
    return el;
  };

  function applyHtmlAttrs2() {
    document.documentElement.setAttribute('data-theme', prefs.theme);
    document.documentElement.setAttribute('data-density', prefs.density);
    app.t.theme = prefs.theme; app.t.density = prefs.density;
  }

  const vaultName = window.SB_VAULT_NAME || '(not connected)';

  wrap.appendChild(h('div', { className: 'screen-hd' },
    h('h1', null, 'settings'),
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
    row('Theme', null, select('theme', ['dark', 'light'])),
    row('Density', null, select('density', ['compact', 'comfortable']))));

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
            alert('Thumbnail cache cleared.');
          } catch (e) { alert('Could not clear: ' + e.message); }
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
  applyLogW();
  clear(root);
  const appEl = h('div', { className: 'app app-tabs', 'data-log': app.t.showLog ? 'visible' : 'hidden' });
  const toggleSettings = () => { app.settingsOpen = !app.settingsOpen; render(); };
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
    openSearch,
    toggleSettings,
    app.offline,
    app.lastSynced,
  ));

  currentMain = buildMain();
  appEl.appendChild(h('div', { className: 'main' }, currentMain));
  if (app.t.showLog) appEl.appendChild(ActivityLog([], false, app.offline));

  if (app.settingsOpen) appEl.appendChild(SettingsPanel(app.t, setTweak, app.route, setRoute, toggleSettings));
  if (app.createOpen) appEl.appendChild(CreateModal(true, createPage, () => { app.createOpen = false; render(); }));
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
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'Escape' && app.searchOpen) { app.searchOpen = false; render(); return; }
  if (e.key === 'Escape' && app.createOpen) { app.createOpen = false; render(); return; }
  // Single-letter and digit navigation was removed on purpose: it hijacked
  // typing and cluttered the nav with key hints. ⌘K / ⌘T / ⌘W above still work,
  // and Escape still closes overlays.
});


async function boot() {
  applyHtmlAttrs();
  applyLogW();
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
