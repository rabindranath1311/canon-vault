// Task 9.1 / 9.6: the JS dashboard must match dashboard.py exactly — same
// obsessions in the same order with the same weights, identical 30-element
// sparklines, identical bucket counts. Compared against a fixture snapshotted
// from the real Python before 7.2 deleted it (9.5).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeDashboard, pyRound, MAX_OBSESSIONS } from "../vault/dashboard.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const py = JSON.parse(readFileSync(join(HERE, "fixtures", "dashboard-python.json"), "utf8"));
const demo = JSON.parse(readFileSync(join(HERE, "..", "..", "scripts", "fixtures", "demo-pages.json"), "utf8"));
const js = computeDashboard(demo.pages, new Date(demo.now));

test("Python's banker's rounding is reproduced, not Math.round", () => {
  assert.equal(pyRound(0.125, 2), 0.12);   // Math.round would give 0.13
  assert.equal(pyRound(12.5), 12);         // Math.round would give 13
  assert.equal(pyRound(13.5), 14);
  assert.equal(pyRound(0.335, 2), 0.34);
});

test("the fixture is not vacuous", () => {
  assert.ok(py.obsessions.length > 0, "an empty obsession list would prove nothing");
  assert.ok(js.obsessions.length > 0, "JS returned no obsessions");
  assert.equal(py.obsessions.length, MAX_OBSESSIONS, "the MAX_OBSESSIONS cap must be exercised");
});

test("9.1 same obsessions, same order, same weights", () => {
  assert.deepEqual(js.obsessions.map((o) => o.title), py.obsessions.map((o) => o.title));
  assert.deepEqual(js.obsessions.map((o) => o.weight), py.obsessions.map((o) => o.weight));
  assert.deepEqual(js.obsessions.map((o) => o.confidence), py.obsessions.map((o) => o.confidence));
  assert.deepEqual(js.obsessions.map((o) => o.captures), py.obsessions.map((o) => o.captures));
  assert.deepEqual(js.obsessions.map((o) => o.days), py.obsessions.map((o) => o.days));
  assert.deepEqual(js.obsessions.map((o) => o.id), py.obsessions.map((o) => o.id));
});

test("9.1 identical 30-element sparkline arrays", () => {
  for (const [i, o] of py.obsessions.entries()) {
    assert.equal(o.sparkline.length, 30);
    assert.deepEqual(js.obsessions[i].sparkline, o.sparkline, `sparkline ${o.title}`);
  }
});

test("9.1 identical related tags and members", () => {
  for (const [i, o] of py.obsessions.entries()) {
    assert.deepEqual(js.obsessions[i].related_tags, o.related_tags, `related ${o.title}`);
    assert.deepEqual(js.obsessions[i].members, o.members, `members ${o.title}`);
  }
});

test("9.1 identical fresh/working/reference bucket counts", () => {
  assert.deepEqual(js.buckets.map((b) => [b.id, b.count]), py.buckets.map((b) => [b.id, b.count]));
  assert.deepEqual(js.buckets, py.buckets, "buckets must match field for field");
});

test("9.1 identical stats and recent list", () => {
  assert.deepEqual(js.stats, py.stats);
  assert.deepEqual(js.recent, py.recent);
});

test("9.1 the whole payload is deep-equal to Python's", () => {
  assert.deepEqual(js, py);
});
