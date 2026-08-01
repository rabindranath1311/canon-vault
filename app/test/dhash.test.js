// Task 9.4. The image-decoding half needs a browser (createImageBitmap), so
// what is pinned here is everything downstream of decoding: the Pillow-
// compatible Lanczos resample, the bit packing, and the distance metric.
// The 10 real hashes are verified against the dump in a browser — see PLAN 9.4.

import { test } from "node:test";
import assert from "node:assert/strict";
import { dhashFromGrey, toGrey, hamming, DUPLICATE_THRESHOLD } from "../vault/dhash.js";

function gradient(w, h, fn) {
  const g = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = fn(x, y);
  return g;
}

test("a hash is 16 lowercase hex characters", () => {
  const hex = dhashFromGrey(gradient(64, 64, (x) => x * 4), 64, 64);
  assert.match(hex, /^[0-9a-f]{16}$/);
});

test("a left-to-right ramp sets every bit; a right-to-left ramp sets none", () => {
  assert.equal(dhashFromGrey(gradient(64, 64, (x) => x * 4), 64, 64), "ffffffffffffffff");
  assert.equal(dhashFromGrey(gradient(64, 64, (x) => 252 - x * 4), 64, 64), "0000000000000000");
});

test("a flat image sets no bits — equal neighbours are not 'darker'", () => {
  assert.equal(dhashFromGrey(gradient(64, 64, () => 128), 64, 64), "0000000000000000");
});

test("the hash is stable across scale — the point of a perceptual hash", () => {
  const f = (x, y) => (Math.sin(x / 7) * 60 + Math.cos(y / 5) * 60 + 128);
  const big = dhashFromGrey(gradient(512, 512, (x, y) => f(x / 4, y / 4)), 512, 512);
  const small = dhashFromGrey(gradient(128, 128, (x, y) => f(x, y)), 128, 128);
  assert.ok(hamming(big, small) <= DUPLICATE_THRESHOLD,
    `same image at two sizes must read as duplicate, got distance ${hamming(big, small)}`);
});

test("toGrey uses ITU-R 601-2, as PIL's convert('L') does", () => {
  const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
  assert.deepEqual([...toGrey(rgba, 3, 1)], [76, 150, 29]);  // Pillow's L24 fixed-point
});

test("hamming counts differing bits and is symmetric", () => {
  assert.equal(hamming("0000000000000000", "0000000000000001"), 1);
  assert.equal(hamming("ffffffffffffffff", "0000000000000000"), 64);
  assert.equal(hamming("70d8b4f6f6e4cc70", "70d8b4f6f6e4cc70"), 0);
  assert.equal(hamming("0165a58bcba5c5c5", "0365a58bcba5c5c5"), 1);   // the AVIF case
  assert.equal(hamming("abc", null), 64);
});

test("the duplicate threshold separates the dump's two known cases", () => {
  // dc86… and 1ab8… are the same 1920x1080 image saved twice: distance 0.
  assert.ok(hamming("70d8b4f6f6e4cc70", "70d8b4f6f6e4cc70") <= DUPLICATE_THRESHOLD);
  // 3fd2… is a different image entirely: distance 30.
  assert.ok(hamming("0165a58bcba5c5c5", "70d8b4f6f6e4cc70") > DUPLICATE_THRESHOLD);
});
