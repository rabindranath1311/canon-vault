// Task 9.1: dashboard.py, ported. The landing screen is the one thing neither
// Obsidian nor an agent gives you unasked, so it is the reason the app exists
// at all — which makes exact parity with the Python worth the fuss.
//
// Checked against app/test/fixtures/dashboard-python.json, snapshotted from the
// real dashboard.py before task 7.2 deletes it (task 9.5).

export const SPARK_DAYS = 30;
export const MIN_OBSESSION_PAGES = 2;
export const MAX_OBSESSIONS = 4;
export const BUCKET_FRESH_DAYS = 7;
export const BUCKET_WORKING_DAYS = 30;
export const BUCKET_FRESH_CAP = 60;
export const BUCKET_WORKING_CAP = 200;

// Python's round() is half-to-EVEN. Math.round is half-up, so `round(0.125, 2)`
// is 0.12 in Python and 0.13 here — a silent parity break on any exact half.
export function pyRound(x, digits = 0) {
  const f = 10 ** digits;
  const y = x * f;
  const frac = y - Math.floor(y);
  let r;
  if (frac === 0.5) {
    const fl = Math.floor(y);
    r = fl % 2 === 0 ? fl : fl + 1;
  } else {
    r = Math.round(y);
  }
  return r / f;
}

function parseIso(ts, fallback) {
  const d = new Date(String(ts).replace(/([+-]\d{2}):?(\d{2})$/, "$1:$2"));
  return isNaN(d.getTime()) ? fallback : d;
}

function daysBetween(a, b) {
  return Math.max(0, Math.floor(Math.abs(a.getTime() - b.getTime()) / 86400000));
}

function sparkFor(updatedIsos, now, days = SPARK_DAYS) {
  const bins = new Array(days).fill(0);
  for (const iso of updatedIsos) {
    const d = daysBetween(parseIso(iso, now), now);
    if (d < days) bins[days - 1 - d] += 1;      // newest goes to the right
  }
  return bins;
}

/**
 * @param pages index entries: {id, slug?, kind, title, updated, tags, mentions, meta}
 * @param nowDate pinned clock; defaults to real now
 */
export function computeDashboard(pages, nowDate = new Date()) {
  const now = nowDate;
  // list_pages() returns newest-first; the recent-window fallback slices it
  // directly, so the order is part of the contract, not a detail.
  const sorted = [...pages].sort((a, b) => String(b.updated).localeCompare(String(a.updated)));

  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const freshCount = sorted.filter((p) => parseIso(p.updated, now) >= weekAgo).length;
  const mentionsTotal = sorted.reduce((n, p) => n + (p.mentions || []).length, 0);
  const lastSynced = sorted.length
    ? sorted.map((p) => p.updated).reduce((a, b) => (String(a) > String(b) ? a : b))
    : now.toISOString();

  // Insertion order matters: it is the tie-break when clusters are equal-sized,
  // because Python's sort is stable over dict order.
  const tagPages = new Map();
  for (const p of sorted) {
    for (const t of p.tags || []) {
      if (!tagPages.has(t)) tagPages.set(t, []);
      tagPages.get(t).push(p);
    }
  }

  const candidates = [...tagPages.entries()].filter(([, ps]) => ps.length >= MIN_OBSESSION_PAGES);
  candidates.sort((a, b) => b[1].length - a[1].length);          // stable, like Python's
  const maxSize = candidates.length ? Math.max(...candidates.map(([, ps]) => ps.length)) : 1;

  const obsessions = candidates.slice(0, MAX_OBSESSIONS).map(([theme, members], i) => {
    const updates = members.map((m) => m.updated);
    const tsSorted = updates.map((u) => parseIso(u, now)).sort((a, b) => a - b);
    const spanDays = tsSorted.length
      ? Math.max(1, daysBetween(tsSorted[tsSorted.length - 1], tsSorted[0])) : 1;
    const coTags = new Map();
    for (const m of members) {
      for (const t of m.tags || []) {
        if (t !== theme) coTags.set(t, (coTags.get(t) || 0) + 1);
      }
    }
    const related = [...coTags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t]) => t);
    return {
      id: `obs-${i}`,
      title: theme,
      weight: pyRound(members.length / maxSize, 2),
      captures: members.length,
      days: spanDays,
      confidence: pyRound((members.length / maxSize) * 100),
      sparkline: sparkFor(updates, now),
      related_tags: related,
      members: members.slice(0, 5).map((m) => ({
        id: m.id, title: m.title || m.slug || m.id.slice(0, 8), kind: m.kind,
      })),
    };
  });

  const threeDaysAgo = new Date(now.getTime() - 72 * 3600000);
  let recentWindow = sorted.filter((p) => parseIso(p.updated, now) >= threeDaysAgo);
  if (recentWindow.length < 4) recentWindow = sorted.slice(0, 8);
  recentWindow = recentWindow.slice(0, 10);
  const recent = recentWindow.map((p) => ({
    id: p.id,
    short_id: p.id.slice(0, 6),
    kind: p.kind,
    title: p.title || p.slug || "(untitled)",
    via: (p.meta || {}).imported_from || "self",
    tags: (p.tags || []).slice(0, 3),
    updated: p.updated,
  }));

  const fresh = [], working = [], reference = [];
  for (const p of sorted) {
    const d = daysBetween(parseIso(p.updated, now), now);
    if (d <= BUCKET_FRESH_DAYS) fresh.push(p);
    else if (d <= BUCKET_WORKING_DAYS) working.push(p);
    else reference.push(p);
  }

  const buckets = [
    { id: "fresh", label: "Fresh", caption: `updated in the last ${BUCKET_FRESH_DAYS} days`,
      count: fresh.length, cap: BUCKET_FRESH_CAP,
      footer_l: BUCKET_FRESH_CAP ? `${pyRound((fresh.length / BUCKET_FRESH_CAP) * 100)}% of soft cap` : "",
      footer_r: "active thinking", letter: "F" },
    { id: "working", label: "Working",
      caption: `updated ${BUCKET_FRESH_DAYS + 1}-${BUCKET_WORKING_DAYS} days ago`,
      count: working.length, cap: BUCKET_WORKING_CAP,
      footer_l: BUCKET_WORKING_CAP ? `${pyRound((working.length / BUCKET_WORKING_CAP) * 100)}% of soft cap` : "",
      footer_r: "consolidating", letter: "W" },
    { id: "reference", label: "Reference", caption: `older than ${BUCKET_WORKING_DAYS} days`,
      count: reference.length, cap: 0, footer_l: "", footer_r: "long-term recall", letter: "R" },
  ];

  return {
    name: "vault",
    stats: {
      fresh_this_week: freshCount,
      mentions_total: mentionsTotal,
      pages_total: sorted.length,
      last_synced: lastSynced,
    },
    obsessions,
    recent,
    buckets,
  };
}
