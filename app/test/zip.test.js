// The clipper download builds its own archive, so the archive has to be real.
// A zip that "looks fine" but that Chrome's Load unpacked refuses is the worst
// outcome here: the user is three steps in before anything says no.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zip, crc32, fromBase64 } from "../clipper/zip.js";

const bytes = (s) => new TextEncoder().encode(s);

test("crc32 matches the standard check vector", () => {
  // The value every CRC-32 implementation is checked against.
  assert.equal(crc32(bytes("123456789")), 0xCBF43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test("fromBase64 round-trips bytes, including non-text", () => {
  const src = new Uint8Array([0, 1, 2, 250, 251, 255, 137, 80, 78, 71]);
  const b64 = Buffer.from(src).toString("base64");
  assert.deepEqual([...fromBase64(b64)], [...src]);
});

test("the archive has the signatures and counts the format requires", () => {
  const out = zip([
    { name: "a/manifest.json", data: bytes('{"x":1}') },
    { name: "a/b.js", data: bytes("console.log(1)") },
  ]);
  const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);
  assert.equal(dv.getUint32(0, true), 0x04034b50, "starts with a local file header");
  // End of central directory is the last 22 bytes when there is no comment.
  const eocd = out.length - 22;
  assert.equal(dv.getUint32(eocd, true), 0x06054b50);
  assert.equal(dv.getUint16(eocd + 8, true), 2, "two entries on this disk");
  assert.equal(dv.getUint16(eocd + 10, true), 2, "two entries in total");
  const cdOffset = dv.getUint32(eocd + 16, true);
  assert.equal(dv.getUint32(cdOffset, true), 0x02014b50, "central directory where EOCD says");
});

test("the same input produces the same bytes twice", () => {
  // No `new Date()` anywhere in the writer: a download whose checksum changes
  // on every click is a download nobody can verify.
  const mk = () => zip([{ name: "f.txt", data: bytes("hello") }]);
  assert.deepEqual([...mk()], [...mk()]);
});

test("a real unzip reads it back byte-for-byte", (t) => {
  // The only check that proves the format is right rather than plausible.
  // Skipped where `unzip` is not installed rather than failing the suite.
  try { execFileSync("unzip", ["-v"], { stdio: "ignore" }); }
  catch (_) { return t.skip("no unzip on this machine"); }

  const dir = mkdtempSync(join(tmpdir(), "cv-zip-"));
  try {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 255, 128]);
    const out = zip([
      { name: "clip/manifest.json", data: bytes('{"manifest_version":3}') },
      { name: "clip/icons/i.png", data: png },
      { name: "clip/deep/nest/x.js", data: bytes("export const x = 1;\n") },
    ]);
    const zp = join(dir, "t.zip");
    writeFileSync(zp, out);
    execFileSync("unzip", ["-tqq", zp]);                    // throws if corrupt
    execFileSync("unzip", ["-qq", zp, "-d", join(dir, "x")]);
    assert.equal(readFileSync(join(dir, "x/clip/manifest.json"), "utf8"), '{"manifest_version":3}');
    assert.deepEqual([...readFileSync(join(dir, "x/clip/icons/i.png"))], [...png],
      "binary survives — the icons are PNGs");
    assert.equal(readFileSync(join(dir, "x/clip/deep/nest/x.js"), "utf8"), "export const x = 1;\n",
      "nested directories are created from the entry names alone");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
