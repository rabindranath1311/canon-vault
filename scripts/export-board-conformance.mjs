// Record what app/vault/excalidraw.js does with boards, so any other writer of
// `.excalidraw.md` can be held to it.
//
// A second writer of the format is a second chance to write a board Obsidian
// or the web app reads differently — or to rewrite every drawing on every save
// because a compressor or a number printer differs by one character. So a
// port's tests should assert what THIS code does, byte for byte:
//
//     conformance/cases/boards/*.excalidraw.md   invented boards, every edge we know of
//     demo/**/*.excalidraw.md                    the demo vault's boards, as they ship
//     conformance/cases/boards/edits.json        scripted edits, replayed here and by a port
//
// and writes the answers to conformance/expected/boards.json:
//
//     lz        LZ-String round trips, including the "__proto__" quirk and garbage input
//     numbers   Number.prototype.toString over awkward and random doubles
//     json      JSON.parse → JSON.stringify: key order, escapes, duplicates
//     boards    parseExcalidraw, the derived sections, serializeExcalidraw — and the
//               file the web app's editor would save
//     edits     each scenario's final scene and file
//
//     node scripts/export-board-conformance.mjs          # write
//     node scripts/export-board-conformance.mjs --check  # exit 1 if stale
//
// The edits are a small JS model of a native editor's edits — there is no
// editor in app/vault to run — so they pin the arithmetic and the order of
// every key and random draw, and then hand the scene to excalidraw.js, the
// real reference, to be written. Invented content only (see CLAUDE.md).

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import LZString from "../app/vendor/lz-string.js";
import {
  parseExcalidraw, serializeExcalidraw, textElementsOf, elementLinksOf, embeddedFilesOf,
  compressScene, decompressScene, cleanScene, BLANK_SCENE,
} from "../app/vault/excalidraw.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CASES = join(ROOT, "conformance", "cases", "boards");
const OUT = join(ROOT, "conformance", "expected", "boards.json");

function walk(dir) {
  const out = [];
  (function go(d) {
    for (const entry of readdirSync(d).sort()) {
      if (entry.startsWith(".")) continue;
      const p = join(d, entry);
      statSync(p).isDirectory() ? go(p) : out.push(relative(dir, p).split(sep).join("/"));
    }
  })(dir);
  return out.sort();
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const units = (s) => Array.from({ length: s.length }, (_, i) => s.charCodeAt(i));
const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");

// ── LZ-String ──────────────────────────────────────────────────────────────

function lzExpected() {
  const rnd = mulberry32(42);
  const pick = (alphabet, n) => Array.from({ length: n }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join("");
  const ascii = "abcdefghij klmnop{}[]\":,0123456789";
  const wide = "aé☕陶芸 \u0000￿" + String.fromCharCode(0xd83c, 0xdffa);
  const strings = [
    "", "a", "ab", "aaaaaaaaaaaaaaaaaaaa", "abababababababababababab",
    "The quick brown fox jumps over the lazy dog",
    "é", "陶芸 kiln 陶芸 kiln", "🏺🏺🏺 vase",
    "__proto__", "x__proto__y__proto__z__proto____proto__", "__proto_", "___proto___",
    // LZW only grows a nine-unit phrase after many repeats; this one does.
    "__proto__".repeat(60) + " {\"__proto__\":1} ".repeat(20),
    "toString constructor hasOwnProperty valueOf",
    JSON.stringify({ type: "excalidraw", elements: [{ id: "a", x: 1 }, { id: "b", x: 2 }] }),
    pick(ascii, 300), pick(wide, 300), pick(ascii + wide, 2000),
  ];
  const cases = strings.map((input) => {
    const b64 = LZString.compressToBase64(input);
    // Code units, not a string: the random inputs hold lone surrogates on
    // purpose, and a strict JSON string decoder would refuse them.
    return { input: units(input), base64: b64, roundtrip: LZString.decompressFromBase64(b64) === input };
  });

  // Large: past 2^16 dictionary entries, so codes run wider than 16 bits.
  // A port generates it identically; only a digest is kept here.
  const big = [];
  {
    const r = mulberry32(7);
    const alphabet = Array.from({ length: 300 }, (_, i) => String.fromCharCode(i < 200 ? 32 + i : 0x4e00 + i));
    let s = "";
    for (let i = 0; i < 200000; i++) s += alphabet[Math.floor(r() * alphabet.length)];
    const b64 = LZString.compressToBase64(s);
    big.push({ seed: 7, length: 200000, alphabet: 300, base64Length: b64.length,
               base64Sha256: sha256(b64), base64Head: b64.slice(0, 64),
               roundtrip: LZString.decompressFromBase64(b64) === s });
  }

  const garbage = ["!!!!notbase64", "AAAA", "Q", "///", "zzzz", "BBBBBBBB", "N4Ig", "abc=", "M", "Ow", "D",
    "N4IgLgngDgpiBcIYA8DGBDANgSwCYCd0B3EAGhADcZ8BnbAewDsEAmcm+gV31TkQAswYKDXgB6MQ",
    LZString.compressToBase64("cut short, mid-stream").slice(0, 12),
    "ÿÿÿÿ", "4p2k", "Bg==", "BYQ", "CwA", "HYA"].map((input) => {
    let out;
    try { out = LZString.decompressFromBase64(input); } catch (e) { out = { threw: e.message }; }
    return { input, result: out === null ? null : typeof out === "string" ? { units: units(out) } : out };
  });

  const chunks = ["", "abc", JSON.stringify(BLANK_SCENE), "x".repeat(5000)].map((json) => ({
    json, compressed: compressScene(json),
  }));
  return { cases, big, garbage, chunks };
}

// ── Numbers and JSON ───────────────────────────────────────────────────────

function numbersExpected() {
  const fixed = [0, -0, 1, -1, 0.1, 0.2, 0.30000000000000004, 1 / 3, 2 / 3, 100, 1e21, 1e20, 123456789012345680000,
    1e-6, 1e-7, 1.5e-7, 0.000001234, 123e-20, 5e-324, 1.7976931348623157e308, 2 ** 53, 2 ** 53 + 2, 2 ** 31,
    1759900000000, 0.5, 1.25, 56.25, 4.35, 0.1 * 3, 1 / 7, Math.PI, Math.E, 2 * Math.PI, 1e300 * 10,
    9007199254740993, 4.940656458412465e-324, 2.2250738585072014e-308, 1e16, 1e15 + 0.3, 12.5, -12.5,
    0.0001, 0.00001, 1234.5678e10, 99.99999999999999, 0.7 + 0.1, 47.99999999999999, 48];
  const r = mulberry32(99);
  const view = new DataView(new ArrayBuffer(8));
  const values = [...fixed];
  for (let i = 0; i < 400; i++) {
    const kind = i % 4;
    if (kind === 0) values.push((r() - 0.5) * 10 ** Math.floor(r() * 40 - 20));
    if (kind === 1) values.push(Math.round(r() * 1e6) / 1e3);
    if (kind === 2) { view.setUint32(0, Math.floor(r() * 2 ** 32)); view.setUint32(4, Math.floor(r() * 2 ** 32)); values.push(view.getFloat64(0)); }
    if (kind === 3) values.push(Math.floor(r() * 2 ** 31) * r());
  }
  return values.filter((v) => Number.isFinite(v)).map((v) => {
    view.setFloat64(0, v);
    const bits = view.getBigUint64(0).toString(16).padStart(16, "0");
    return { bits, string: String(v), json: JSON.stringify(v) };
  });
}

function jsonExpected() {
  const texts = [
    `{"b":1,"a":2,"10":3,"2":4,"1":5,"01":6,"4294967294":7,"4294967295":8,"-1":9}`,
    `{"a":1,"b":2,"a":3}`,
    `{"__proto__":{"x":1},"y":2}`,
    `["\\u00e9","\\ud83c\\udffa","\\/","\\b\\f\\n\\r\\t","\\u0001\\u001f","\\u2028\\u2029","\\"\\\\"]`,
    `[1.0,1e2,1E-2,-0,0.1,1e400,-1e400,1e-400,123456789.123456789,5e-324]`,
    `  {"nested":[[[]],{}], "t":true, "f":false, "n":null}  `,
    `"é ☕ \\u0000"`,
    `[]`, `{}`, `0`, `"x"`,
    `{"a":}`, `[1,]`, `{"a" 1}`, `01`, `1.`, `.5`, `-`, `"\\x"`, `"\t"`, `[1 2]`, `nul`, ``, ` `, `{"a":1}}`, `"\\u12"`,
    `﻿{}`, `{'a':1}`, `NaN`, `[1e]`,
  ];
  return texts.map((text) => {
    try { return { text, ok: JSON.stringify(JSON.parse(text)) }; }
    catch (e) { return { text, ok: null }; }
  });
}

// ── Boards ─────────────────────────────────────────────────────────────────

const errorKind = (p) => p.error == null ? null
  : p.error.startsWith("the compressed") ? "undecodable"
  : p.error.startsWith("the drawing JSON") ? "malformed" : "missing";

/** What a port's editor must write on save: the web app editor's save. */
function documentFile(p, scene, embedMap) {
  return serializeExcalidraw(scene, {
    compressed: p.compressed ?? true,
    backOfNote: p.backOfNote || "",
    frontmatter: p.frontmatter || null,
    embeddedFiles: embedMap,
  });
}

/** Does any string in `v` hold an unpaired surrogate? */
function hasLoneSurrogate(v) {
  if (typeof v === "string") return !v.isWellFormed();
  if (Array.isArray(v)) return v.some(hasLoneSurrogate);
  if (isObj(v)) return Object.entries(v).some(([k, x]) => !k.isWellFormed() || hasLoneSurrogate(x));
  return false;
}

function boardCase(name, text) {
  const p = parseExcalidraw(text);
  const sceneJSON = p.scene == null ? null : JSON.stringify(p.scene);
  // A scene a Unicode-scalar string cannot hold exactly: a port opens it read-only
  // and never writes it, so only the parse is recorded.
  if (hasLoneSurrogate(p.scene)) {
    return { name, text, lossy: true, parse: { frontmatter: p.frontmatter, backOfNote: p.backOfNote,
      compressed: p.compressed, scene: sceneJSON, error: p.error, errorKind: errorKind(p) } };
  }
  const out = {
    name, text, lossy: false,
    parse: {
      frontmatter: p.frontmatter, backOfNote: p.backOfNote, compressed: p.compressed,
      scene: sceneJSON, error: p.error, errorKind: errorKind(p),
      textElements: p.textElements.map((t) => ({ key: t.id, value: t.raw })),
      elementLinks: p.elementLinks, embeddedFiles: p.embeddedFiles,
    },
    derived: {
      textElements: textElementsOf(p.scene).map((t) => ({ key: String(t.id), value: t.raw })),
      elementLinks: elementLinksOf(p.scene).map((l) => ({ key: String(l.key), value: l.value })),
      embeddedFiles: embeddedFilesOf(p.scene, p.embeddedFiles),
      embeddedFilesMap: embeddedFilesOf(p.scene, new Map(p.embeddedFiles.map((e) => [e.key, e.value]))),
    },
    cleaned: p.scene == null ? null : JSON.stringify(cleanScene(p.scene)),
    serialized: null, serializedPlain: null, document: null, body: null, reparsedScene: null,
  };
  if (p.error == null) {
    const opts = { backOfNote: p.backOfNote, frontmatter: p.frontmatter, embeddedFiles: p.embeddedFiles };
    out.serialized = serializeExcalidraw(p.scene, opts);
    out.serializedPlain = serializeExcalidraw(p.scene, { ...opts, compressed: false });
    out.document = documentFile(p, p.scene, new Map(p.embeddedFiles.map((e) => [e.key, e.value])));
    out.body = out.document.replace(/^---\n[\s\S]*?\n---\n/, "");
    const again = parseExcalidraw(out.document);
    out.reparsedScene = again.scene == null ? null : JSON.stringify(again.scene);
  }
  return out;
}

// ── A JS model of a native editor's edits ─────────────────────────────────

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const num = (v, d) => (typeof v === "number" ? v : d);
const live = (el) => isObj(el) && !el.isDeleted;
const idOf = (el) => (isObj(el) && typeof el.id === "string" ? el.id : "");
const KNOWN = new Set(["rectangle", "ellipse", "diamond", "line", "arrow", "text", "freedraw", "image"]);
const isLinear = (el) => isObj(el) && (el.type === "line" || el.type === "arrow");
const isFreedraw = (el) => isObj(el) && el.type === "freedraw";
const isText = (el) => isObj(el) && el.type === "text";
const isTarget = (el, ids) => live(el) && idOf(el) !== "" && ids.has(idOf(el));

function pointsOf(v) {
  return Array.isArray(v)
    ? v.filter((p) => Array.isArray(p) && p.length >= 2 && typeof p[0] === "number" && typeof p[1] === "number").map((p) => [p[0], p[1]])
    : [];
}
function pointsFor(el) {
  if (isLinear(el)) {
    const pts = pointsOf(el.points);
    return pts.length < 2 ? [[0, 0], [num(el.width, 0), num(el.height, 0)]] : pts;
  }
  if (isFreedraw(el)) return pointsOf(el.points);
  return [];
}
const groupsOf = (el) => (Array.isArray(el.groupIds) ? el.groupIds.filter((g) => typeof g === "string") : []);
const elementsOf = (s) => (isObj(s) && Array.isArray(s.elements) ? s.elements : []);
const findLive = (s, id) => (id === "" ? undefined : elementsOf(s).find((e) => live(e) && idOf(e) === id));

function makeCtx(seed, now, measure) {
  const rnd = mulberry32(seed);
  const alphabet = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";
  return {
    now: () => now,
    randomInteger: () => Math.floor(rnd() * 2 ** 31),
    randomId: () => { let s = ""; for (let i = 0; i < 21; i++) s += alphabet[Math.floor(rnd() * 64)]; return s; },
    measure,
  };
}
function fixedMeasure(text, fontSize, _family, lineHeight) {
  const lines = text.split("\n");
  const longest = Math.max(...lines.map((l) => l.length));
  return { width: longest * fontSize * 0.6, height: lines.length * fontSize * lineHeight };
}

function bump(el, ctx) {
  el.version = num(el.version, 0) + 1;
  el.versionNonce = ctx.randomInteger();
  el.updated = ctx.now();
}
function boundText(s, containers) {
  const out = new Set();
  for (const el of elementsOf(s)) {
    if (live(el) && isText(el) && typeof el.containerId === "string" && containers.has(el.containerId) && idOf(el) !== "") out.add(idOf(el));
  }
  return out;
}
const bindingId = (v) => (isObj(v) && typeof v.elementId === "string" ? v.elementId : null);

function box(el) {
  if (isLinear(el) || isFreedraw(el)) {
    const pts = pointsFor(el);
    if (!pts.length) return { x: num(el.x, 0), y: num(el.y, 0), w: 0, h: 0 };
    let [minX, minY] = pts[0], [maxX, maxY] = pts[0];
    for (const q of pts.slice(1)) {
      if (q[0] < minX) minX = q[0]; if (q[1] < minY) minY = q[1];
      if (q[0] > maxX) maxX = q[0]; if (q[1] > maxY) maxY = q[1];
    }
    return { x: num(el.x, 0) + minX, y: num(el.y, 0) + minY, w: maxX - minX, h: maxY - minY };
  }
  const b = { x: num(el.x, 0), y: num(el.y, 0), w: num(el.width, 0), h: num(el.height, 0) };
  if (b.w < 0) { b.x += b.w; b.w = -b.w; }
  if (b.h < 0) { b.y += b.h; b.h = -b.h; }
  return b;
}
function setRelativePoints(el, x, y, rel) {
  let minX = 0, minY = 0, maxX = 0, maxY = 0;
  if (rel.length) { [minX, minY] = rel[0]; [maxX, maxY] = rel[0]; }
  for (const q of rel.slice(1)) {
    if (q[0] < minX) minX = q[0]; if (q[1] < minY) minY = q[1];
    if (q[0] > maxX) maxX = q[0]; if (q[1] > maxY) maxY = q[1];
  }
  el.x = x; el.y = y; el.points = rel.map((p) => [p[0], p[1]]);
  el.width = maxX - minX; el.height = maxY - minY;
}
function setAbsolutePoints(el, abs) {
  if (!abs.length) return;
  const o = abs[0];
  setRelativePoints(el, o[0], o[1], abs.map((p) => [p[0] - o[0], p[1] - o[1]]));
}
const absolutePoints = (el) => pointsFor(el).map((p) => [num(el.x, 0) + p[0], num(el.y, 0) + p[1]]);

function removingRefs(el, ids) {
  if (!Array.isArray(el.boundElements)) return false;
  const kept = el.boundElements.filter((r) => !(isObj(r) && typeof r.id === "string" && ids.has(r.id)));
  if (kept.length === el.boundElements.length) return false;
  el.boundElements = kept;
  return true;
}
function dropRefs(s, unbound, ctx) {
  for (const el of elementsOf(s)) {
    if (!live(el) || !unbound.has(idOf(el))) continue;
    if (removingRefs(el, unbound.get(idOf(el)))) bump(el, ctx);
  }
}
function layoutBoundText(text, container) {
  const c = box(container);
  const tw = num(text.width, 0), th = num(text.height, 0);
  const align = typeof text.textAlign === "string" ? text.textAlign : "left";
  const valign = typeof text.verticalAlign === "string" ? text.verticalAlign : "top";
  const x = align === "left" ? c.x + 5 : align === "right" ? c.x + c.w - 5 - tw : c.x + c.w / 2 - tw / 2;
  const y = valign === "top" ? c.y + 5 : valign === "bottom" ? c.y + c.h - 5 - th : c.y + c.h / 2 - th / 2;
  text.x = x; text.y = y; text.angle = num(container.angle, 0);
}
function relayoutBoundText(s, containers, ctx) {
  for (const el of elementsOf(s)) {
    if (!live(el) || !isText(el) || typeof el.containerId !== "string" || !containers.has(el.containerId)) continue;
    const c = findLive(s, el.containerId);
    if (!c) continue;
    layoutBoundText(el, c);
    bump(el, ctx);
  }
}
function normalizeRadians(a) {
  const full = 2 * Math.PI;
  if (a < 0) return (a % full) + full;
  if (a >= full) return a % full;
  return a;
}
function rotatePoint(p, c, angle) {
  if (angle === 0) return p;
  const s = Math.sin(angle), k = Math.cos(angle);
  const dx = p[0] - c[0], dy = p[1] - c[1];
  return [c[0] + dx * k - dy * s, c[1] + dx * s + dy * k];
}
function elbowRoute(s, e) {
  const dx = e[0] - s[0], dy = e[1] - s[1];
  if (dx === 0 || dy === 0) return [s, e];
  if (Math.abs(dx) >= Math.abs(dy)) { const mx = s[0] + dx / 2; return [s, [mx, s[1]], [mx, e[1]], e]; }
  const my = s[1] + dy / 2;
  return [s, [s[0], my], [e[0], my], e];
}

// fractional-indexing's generateKeyBetween(a, null), as FractionalIndex does it.
const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
function intLength(h) {
  if (h >= "a" && h <= "z") return h.charCodeAt(0) - 97 + 2;
  if (h >= "A" && h <= "Z") return 90 - h.charCodeAt(0) + 2;
  return null;
}
function validKey(k) {
  if (typeof k !== "string" || !k.length) return false;
  const n = intLength(k[0]);
  if (n == null || n > k.length) return false;
  if (k === "A" + "0".repeat(26)) return false;
  if (![...k.slice(1)].every((c) => DIGITS.includes(c))) return false;
  return k.length === n || k[k.length - 1] !== "0";
}
function incrementInteger(x) {
  const [head, ...digs] = x.split("");
  let carry = true;
  for (let i = digs.length - 1; carry && i >= 0; i--) {
    const d = DIGITS.indexOf(digs[i]) + 1;
    if (d === DIGITS.length) digs[i] = DIGITS[0]; else { digs[i] = DIGITS[d]; carry = false; }
  }
  if (carry) {
    if (head === "Z") return "a" + DIGITS[0];
    if (head === "z") return null;
    const h = String.fromCharCode(head.charCodeAt(0) + 1);
    if (h > "a") digs.push(DIGITS[0]); else digs.pop();
    return h + digs.join("");
  }
  return head + digs.join("");
}
function midpoint(a) {
  const digitA = a ? DIGITS.indexOf(a[0]) : 0, digitB = DIGITS.length;
  if (digitB - digitA > 1) return DIGITS[Math.round(0.5 * (digitA + digitB))];
  return DIGITS[digitA] + midpoint(a.slice(1));
}
function keyAfter(a) {
  const n = intLength(a[0]);
  const i = a.slice(0, n);
  return incrementInteger(i) ?? i + midpoint(a.slice(n));
}
function nextIndex(s, previous) {
  const els = elementsOf(s);
  const lastEl = els[els.length - 1];
  const last = previous !== undefined ? previous : (isObj(lastEl) ? lastEl.index : undefined);
  return typeof last === "string" && validKey(last) ? keyAfter(last) : null;
}

const E = {
  move(s, ids, dx, dy, ctx) {
    const targets = new Set([...ids, ...boundText(s, ids)]);
    const unbound = new Map();
    for (const el of elementsOf(s)) {
      if (!isTarget(el, targets)) continue;
      el.x = num(el.x, 0) + dx; el.y = num(el.y, 0) + dy;
      if (isLinear(el)) {
        for (const end of ["startBinding", "endBinding"]) {
          const b = bindingId(el[end]);
          if (b != null && !targets.has(b)) {
            el[end] = null;
            if (!unbound.has(b)) unbound.set(b, new Set());
            unbound.get(b).add(idOf(el));
          }
        }
      }
      bump(el, ctx);
    }
    dropRefs(s, unbound, ctx);
    for (const el of elementsOf(s)) {
      if (!live(el) || !isLinear(el) || targets.has(idOf(el))) continue;
      const sb = bindingId(el.startBinding), eb = bindingId(el.endBinding);
      const sMoved = sb != null && targets.has(sb), eMoved = eb != null && targets.has(eb);
      if (!sMoved && !eMoved) continue;
      if (sMoved && eMoved) { el.x = num(el.x, 0) + dx; el.y = num(el.y, 0) + dy; }
      else if (el.elbowed) {
        const a = absolutePoints(el);
        if (sMoved) a[0] = [a[0][0] + dx, a[0][1] + dy];
        if (eMoved) a[a.length - 1] = [a[a.length - 1][0] + dx, a[a.length - 1][1] + dy];
        setAbsolutePoints(el, elbowRoute(a[0], a[a.length - 1]));
      } else {
        let rel = pointsFor(el);
        let x = num(el.x, 0), y = num(el.y, 0);
        if (sMoved) {
          rel[0] = [rel[0][0] + dx, rel[0][1] + dy];
          const p0 = rel[0];
          x += p0[0]; y += p0[1];
          rel = rel.map((p) => [p[0] - p0[0], p[1] - p0[1]]);
        }
        if (eMoved) { const k = rel.length - 1; rel[k] = [rel[k][0] + dx, rel[k][1] + dy]; }
        setRelativePoints(el, x, y, rel);
      }
      bump(el, ctx);
    }
  },

  scale(s, ids, from, to, ctx) {
    const sx = from.w !== 0 ? to.w / from.w : 1, sy = from.h !== 0 ? to.h / from.h : 1;
    const bound = boundText(s, ids);
    const scaled = new Set([...ids].filter((id) => !bound.has(id)));
    for (const el of elementsOf(s)) {
      if (!isTarget(el, scaled)) continue;
      const x = to.x + (num(el.x, 0) - from.x) * sx, y = to.y + (num(el.y, 0) - from.y) * sy;
      if (isLinear(el) || isFreedraw(el)) {
        const pts = pointsFor(el);
        if (!pts.length) { el.x = x; el.y = y; }
        else setRelativePoints(el, x, y, pts.map((p) => [p[0] * sx, p[1] * sy]));
      } else {
        const exact = num(el.x, 0) === from.x && num(el.y, 0) === from.y
          && num(el.width, 0) === from.w && num(el.height, 0) === from.h;
        el.x = x; el.y = y;
        el.width = exact ? to.w : num(el.width, 0) * sx;
        el.height = exact ? to.h : num(el.height, 0) * sy;
        if (isText(el)) el.fontSize = num(el.fontSize, 20) * sy;
      }
      bump(el, ctx);
    }
    relayoutBoundText(s, scaled, ctx);
  },

  rotate(s, ids, delta, center, ctx) {
    const bound = boundText(s, ids);
    const turned = new Set([...ids].filter((id) => !bound.has(id)));
    for (const el of elementsOf(s)) {
      if (!isTarget(el, turned)) continue;
      const b = box(el);
      const ec = [b.x + b.w / 2, b.y + b.h / 2];
      const r = rotatePoint(ec, center, delta);
      el.x = num(el.x, 0) + (r[0] - ec[0]);
      el.y = num(el.y, 0) + (r[1] - ec[1]);
      el.angle = normalizeRadians(num(el.angle, 0) + delta);
      bump(el, ctx);
    }
    relayoutBoundText(s, turned, ctx);
  },

  movePoint(s, id, index, to, ctx) {
    const el = findLive(s, id);
    if (!el || !isLinear(el)) return;
    const pts = pointsFor(el);
    if (index < 0 || index >= pts.length) return;
    let a = absolutePoints(el);
    a[index] = to;
    const last = a.length - 1;
    if (el.elbowed && (index === 0 || index === last)) a = elbowRoute(a[0], a[last]);
    setAbsolutePoints(el, a);
    const unbound = new Map();
    if (index === 0) { const b = bindingId(el.startBinding); if (b != null) { el.startBinding = null; unbound.set(b, new Set([id])); } }
    if (index === last) {
      const b = bindingId(el.endBinding);
      if (b != null) { el.endBinding = null; if (!unbound.has(b)) unbound.set(b, new Set()); unbound.get(b).add(id); }
    }
    bump(el, ctx);
    dropRefs(s, unbound, ctx);
  },

  setText(s, id, text, ctx) {
    const el = findLive(s, id);
    if (!el || !isText(el)) return;
    const oldW = num(el.width, 0), oldX = num(el.x, 0);
    const fontSize = num(el.fontSize, 20), family = Math.trunc(num(el.fontFamily, 5)), lineHeight = num(el.lineHeight, 1.25);
    const align = typeof el.textAlign === "string" ? el.textAlign : "left";
    el.text = text; el.originalText = text;
    if ("rawText" in el) el.rawText = text;
    const size = ctx.measure(text, fontSize, family, lineHeight);
    el.width = size.width; el.height = size.height;
    const container = typeof el.containerId === "string" ? findLive(s, el.containerId) : undefined;
    if (!container) {
      if (align === "center") el.x = oldX + (oldW - size.width) / 2;
      if (align === "right") el.x = oldX + oldW - size.width;
    } else {
      layoutBoundText(el, container);
    }
    bump(el, ctx);
  },

  setLink(s, ids, link, ctx) {
    for (const el of elementsOf(s)) if (isTarget(el, ids)) { el.link = link; bump(el, ctx); }
  },

  setStyle(s, ids, patch, ctx) {
    const keys = ["strokeColor", "backgroundColor", "fillStyle", "strokeWidth", "strokeStyle", "opacity"].filter((k) => k in patch);
    if (!keys.length) return;
    const targets = new Set([...ids, ...boundText(s, ids)]);
    for (const el of elementsOf(s)) {
      if (!isTarget(el, targets)) continue;
      for (const k of keys) el[k] = patch[k];
      bump(el, ctx);
    }
  },

  delete(s, ids, ctx) {
    const targets = new Set([...ids, ...boundText(s, ids)]);
    const removed = new Set(elementsOf(s).filter((e) => isTarget(e, targets)).map(idOf));
    if (!removed.size) return;
    s.elements = elementsOf(s).filter((e) => !isTarget(e, targets));
    for (const el of s.elements) {
      if (!live(el)) continue;
      let changed = removingRefs(el, removed);
      if (isLinear(el)) {
        for (const end of ["startBinding", "endBinding"]) {
          const b = bindingId(el[end]);
          if (b != null && removed.has(b)) { el[end] = null; changed = true; }
        }
      }
      if (changed) bump(el, ctx);
    }
  },

  duplicate(s, ids, dx, dy, ctx) {
    const targets = new Set([...ids, ...boundText(s, ids)]);
    const sources = elementsOf(s).filter((e) => isTarget(e, targets));
    if (!sources.length) return [];
    const idMap = new Map();
    for (const src of sources) if (!idMap.has(idOf(src))) idMap.set(idOf(src), ctx.randomId());
    const groupMap = new Map();
    for (const src of sources) {
      for (const g of groupsOf(src)) {
        if (groupMap.has(g)) continue;
        const members = elementsOf(s).filter((e) => live(e) && groupsOf(e).includes(g));
        groupMap.set(g, members.every((m) => targets.has(idOf(m))) ? ctx.randomId() : g);
      }
    }
    const lastEl = elementsOf(s)[elementsOf(s).length - 1];
    let cursor = isObj(lastEl) ? lastEl.index : undefined;
    const copies = [], newIds = [];
    for (const src of sources) {
      const c = structuredClone(src);
      const newId = idMap.get(idOf(src));
      c.id = newId;
      c.x = num(src.x, 0) + dx;
      c.y = num(src.y, 0) + dy;
      c.seed = ctx.randomInteger();
      if (Array.isArray(src.groupIds)) c.groupIds = src.groupIds.map((g) => (typeof g === "string" && groupMap.has(g) ? groupMap.get(g) : g));
      if (Array.isArray(src.boundElements)) {
        const mapped = src.boundElements
          .filter((r) => isObj(r) && typeof r.id === "string" && idMap.has(r.id))
          .map((r) => ({ ...r, id: idMap.get(r.id) }));
        c.boundElements = mapped.length ? mapped : null;
      }
      if (typeof src.containerId === "string") c.containerId = idMap.has(src.containerId) ? idMap.get(src.containerId) : null;
      if (isLinear(src)) {
        for (const end of ["startBinding", "endBinding"]) {
          const b = src[end];
          if (!(isObj(b) && typeof b.elementId === "string")) continue;
          c[end] = idMap.has(b.elementId) ? { ...b, elementId: idMap.get(b.elementId) } : null;
        }
      }
      if ("index" in src) {
        const next = nextIndex(s, cursor === undefined ? null : cursor);
        c.index = next;
        cursor = next;
      }
      bump(c, ctx);
      copies.push(c);
      newIds.push(newId);
    }
    s.elements.push(...copies);
    return newIds;
  },

  group(s, ids, ctx) {
    const g = ctx.randomId();
    const targets = new Set([...ids, ...boundText(s, ids)]);
    for (const el of elementsOf(s)) {
      if (!isTarget(el, targets)) continue;
      el.groupIds = [...(Array.isArray(el.groupIds) ? el.groupIds : []), g];
      bump(el, ctx);
    }
    return g;
  },

  ungroup(s, ids, ctx) {
    const targets = new Set([...ids, ...boundText(s, ids)]);
    for (const el of elementsOf(s)) {
      if (!isTarget(el, targets) || !Array.isArray(el.groupIds) || !el.groupIds.length) continue;
      el.groupIds = el.groupIds.slice(0, -1);
      bump(el, ctx);
    }
  },
};

const STYLE = { strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 2,
  strokeStyle: "solid", roughness: 1, opacity: 100, fontSize: 20, fontFamily: 5 };

function base(s, type, x, y, width, height, style, roundness, ctx) {
  const index = nextIndex(s);
  const id = ctx.randomId(), seed = ctx.randomInteger(), nonce = ctx.randomInteger();
  return {
    id, type, x, y, width, height, angle: 0,
    strokeColor: style.strokeColor, backgroundColor: style.backgroundColor, fillStyle: style.fillStyle,
    strokeWidth: style.strokeWidth, strokeStyle: style.strokeStyle, roughness: style.roughness, opacity: style.opacity,
    groupIds: [], frameId: null, index, roundness,
    seed, version: 1, versionNonce: nonce, isDeleted: false, boundElements: null, updated: ctx.now(),
    link: null, locked: false,
  };
}
function append(s, el) {
  if (!Array.isArray(s.elements)) s.elements = [];
  s.elements.push(el);
  return el.id;
}
const Add = {
  shape(s, kind, [x, y, w, h], style, ctx) {
    const [type, round] = kind === "ellipse" ? ["ellipse", null] : kind === "diamond" ? ["diamond", { type: 2 }] : ["rectangle", { type: 3 }];
    return append(s, base(s, type, x, y, w, h, style, round, ctx));
  },
  linear(s, arrow, points, elbowed, style, ctx) {
    const pts = arrow && elbowed && points.length >= 2 ? elbowRoute(points[0], points[points.length - 1]) : points;
    const o = pts[0];
    const rel = pts.map((p) => [p[0] - o[0], p[1] - o[1]]);
    const el = base(s, arrow ? "arrow" : "line", o[0], o[1], 0, 0, style, arrow && elbowed ? null : { type: 2 }, ctx);
    el.points = rel; el.lastCommittedPoint = null; el.startBinding = null; el.endBinding = null;
    el.startArrowhead = null; el.endArrowhead = arrow ? "arrow" : null;
    if (arrow) {
      el.elbowed = !!elbowed;
      if (elbowed) { el.fixedSegments = []; el.startIsSpecial = false; el.endIsSpecial = false; }
    }
    setRelativePoints(el, o[0], o[1], rel);
    return append(s, el);
  },
  text(s, text, [x, y], style, ctx) {
    const size = ctx.measure(text, style.fontSize, style.fontFamily, 1.25);
    const el = base(s, "text", x, y, size.width, size.height, style, null, ctx);
    Object.assign(el, { text, fontSize: style.fontSize, fontFamily: style.fontFamily, textAlign: "left", verticalAlign: "top",
      containerId: null, originalText: text, autoResize: true, lineHeight: 1.25 });
    return append(s, el);
  },
  boundText(s, containerId, text, style, ctx) {
    const container = findLive(s, containerId);
    if (!container) return "";
    const size = ctx.measure(text, style.fontSize, style.fontFamily, 1.25);
    const el = base(s, "text", 0, 0, size.width, size.height, style, null, ctx);
    el.backgroundColor = "transparent";
    Object.assign(el, { text, fontSize: style.fontSize, fontFamily: style.fontFamily, textAlign: "center", verticalAlign: "middle",
      containerId, originalText: text, autoResize: true, lineHeight: 1.25 });
    layoutBoundText(el, container);
    append(s, el);
    container.boundElements = [...(Array.isArray(container.boundElements) ? container.boundElements : []), { type: "text", id: el.id }];
    bump(container, ctx);
    return el.id;
  },
  freedraw(s, points, pressures, style, ctx) {
    const o = points[0];
    const rel = points.map((p) => [p[0] - o[0], p[1] - o[1]]);
    const el = base(s, "freedraw", o[0], o[1], 0, 0, style, null, ctx);
    el.points = rel; el.pressures = pressures ?? []; el.simulatePressure = pressures == null; el.lastCommittedPoint = null;
    setRelativePoints(el, o[0], o[1], rel);
    return append(s, el);
  },
  image(s, fileId, [x, y, w, h], style, ctx) {
    const el = base(s, "image", x, y, w, h, style, null, ctx);
    el.strokeColor = "transparent";
    Object.assign(el, { status: "saved", fileId, scale: [1, 1], crop: null });
    return append(s, el);
  },
};

function restore(target, current, ctx) {
  const byId = new Map();
  for (const el of elementsOf(current)) if (idOf(el) !== "" && !byId.has(idOf(el))) byId.set(idOf(el), el);
  const out = structuredClone(target);
  if (!Array.isArray(out.elements)) return out;
  out.elements = out.elements.map((el) => {
    if (idOf(el) === "") return el;
    const now = byId.get(idOf(el));
    if (now && JSON.stringify(now) === JSON.stringify(el)) return el;
    el.version = Math.max(num(el.version, 0), now ? num(now.version, 0) : 0) + 1;
    el.versionNonce = ctx.randomInteger();
    el.updated = ctx.now();
    return el;
  });
  return out;
}

function editScenario(sc) {
  const text = readFileSync(join(ROOT, sc.board), "utf8");
  const p = parseExcalidraw(text);
  let scene = p.scene == null ? structuredClone(BLANK_SCENE) : structuredClone(p.scene);
  const embed = new Map(p.embeddedFiles.map((e) => [e.key, e.value]));
  const ctx = makeCtx(sc.seed, sc.now, fixedMeasure);
  const created = [];
  const undo = [], redo = [];
  const ref = (id) => (id === "$last" ? created[created.length - 1] : /^\$\d+$/.test(id) ? created[Number(id.slice(1))] : id);
  const refs = (ids) => new Set(ids.map(ref));
  const styleOf = (o) => ({ ...STYLE, ...(o || {}) });
  const rect = (r) => ({ x: r[0], y: r[1], w: r[2], h: r[3] });

  for (const op of sc.ops) {
    if (op.op === "undo" || op.op === "redo") {
      const [from, to] = op.op === "undo" ? [undo, redo] : [redo, undo];
      const target = from.pop();
      if (target) { to.push(structuredClone(scene)); scene = restore(target, scene, ctx); }
      continue;
    }
    undo.push(structuredClone(scene));
    redo.length = 0;
    switch (op.op) {
      case "move": E.move(scene, refs(op.ids), op.dx, op.dy, ctx); break;
      case "scale": {
        const el = findLive(scene, ref(op.ids[0]));
        const from = op.from === "own" ? box(el) : rect(op.from);
        const to = op.to ? rect(op.to) : { x: from.x, y: from.y, w: from.w * op.by[0], h: from.h * op.by[1] };
        E.scale(scene, refs(op.ids), from, to, ctx);
        break;
      }
      case "rotate": {
        let center = op.center;
        if (center === "own") { const b = box(findLive(scene, ref(op.ids[0]))); center = [b.x + b.w / 2, b.y + b.h / 2]; }
        E.rotate(scene, refs(op.ids), op.delta, center, ctx);
        break;
      }
      case "movePoint": E.movePoint(scene, ref(op.id), op.index, op.to, ctx); break;
      case "setText": E.setText(scene, ref(op.id), op.text, ctx); break;
      case "link": E.setLink(scene, refs(op.ids), op.link, ctx); break;
      case "style": E.setStyle(scene, refs(op.ids), op.patch, ctx); break;
      case "delete": E.delete(scene, refs(op.ids), ctx); break;
      case "duplicate": created.push(...E.duplicate(scene, refs(op.ids), op.dx, op.dy, ctx)); break;
      case "group": E.group(scene, refs(op.ids), ctx); break;
      case "ungroup": E.ungroup(scene, refs(op.ids), ctx); break;
      case "addShape": created.push(Add.shape(scene, op.kind, op.rect, styleOf(op.style), ctx)); break;
      case "addLinear": created.push(Add.linear(scene, op.arrow, op.points, op.elbowed, styleOf(op.style), ctx)); break;
      case "addText": created.push(Add.text(scene, op.text, op.at, styleOf(op.style), ctx)); break;
      case "addBoundText": created.push(Add.boundText(scene, ref(op.container), op.text, styleOf(op.style), ctx)); break;
      case "addFreedraw": created.push(Add.freedraw(scene, op.points, op.pressures ?? null, styleOf(op.style), ctx)); break;
      case "addImage":
        embed.delete(op.fileId);
        embed.set(op.fileId, op.path);
        created.push(Add.image(scene, op.fileId, op.rect, styleOf(op.style), ctx));
        break;
      default: throw new Error(`unknown op ${op.op}`);
    }
  }
  const file = documentFile(p, scene, embed);
  return { name: sc.name, created, scene: JSON.stringify(scene), file, fileSha256: sha256(file) };
}

// ── Out ────────────────────────────────────────────────────────────────────

export function render() {
  const boards = [];
  for (const f of walk(CASES).filter((p) => p.endsWith(".excalidraw.md"))) {
    boards.push(boardCase(`cases/boards/${f}`, readFileSync(join(CASES, f), "utf8")));
  }
  const demo = join(ROOT, "demo");
  for (const f of walk(demo).filter((p) => p.endsWith(".excalidraw.md"))) {
    boards.push(boardCase(`demo/${f}`, readFileSync(join(demo, f), "utf8")));
  }
  const scenarios = JSON.parse(readFileSync(join(CASES, "edits.json"), "utf8")).scenarios;
  const out = {
    lz: lzExpected(),
    numbers: numbersExpected(),
    json: jsonExpected(),
    boards,
    edits: scenarios.map(editScenario),
  };
  return JSON.stringify(out, null, 2) + "\n";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes("--check");
  const text = render();
  let current = null;
  try { current = readFileSync(OUT, "utf8"); } catch (_) {}
  if (current === text) {
    if (check) console.log("✓ conformance/expected/boards.json is current");
  } else if (check) {
    console.error("✗ conformance/expected/boards.json is stale");
    console.error("  run: node scripts/export-board-conformance.mjs");
    process.exit(1);
  } else {
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, text);
    console.log("✓ wrote conformance/expected/boards.json");
  }
}
