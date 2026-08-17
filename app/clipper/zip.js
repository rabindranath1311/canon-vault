// A ZIP writer, in about a hundred lines.
//
// Why not a library: there is no build step and no npm install here, and the
// one thing this needs to do — put a handful of small text files and two PNGs
// into an archive Chrome's "Load unpacked" can read after the user unzips it
// — is the simplest case the format has. Every entry is STORED (method 0),
// so there is no compression code at all. 235KB of source is not worth a
// deflate implementation.
//
// Why in the browser at all: GitHub can only zip a whole repository, and the
// user asked for the extension, not the app. A release asset would be a
// second artefact to keep in step with the code. Building it here means the
// download is exactly the `extension/` of the deploy you are standing in.

/** CRC-32, table built once on first use. */
let TABLE = null;
function crcTable() {
  if (TABLE) return TABLE;
  TABLE = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    TABLE[i] = c >>> 0;
  }
  return TABLE;
}

export function crc32(bytes) {
  const t = crcTable();
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/* A fixed timestamp, not `new Date()`. Two downloads of the same deploy
   should be byte-identical — a zip whose checksum changes every time you
   click is a zip you cannot verify. 2026-01-01 00:00:00 in DOS format. */
const DOS_TIME = 0;                       // 00:00:00
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

function u8(str) {
  return new TextEncoder().encode(str);
}

/**
 * @param {Array<{name: string, data: Uint8Array}>} files
 * @returns {Uint8Array} the archive
 */
export function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const f of files) {
    const name = u8(f.name);
    const data = f.data;
    const sum = crc32(data);

    // Local file header — 30 bytes, then the name, then the bytes.
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);    // signature
    lh.setUint16(4, 20, true);            // version needed
    lh.setUint16(6, 0x0800, true);        // flags: bit 11 = names are UTF-8
    lh.setUint16(8, 0, true);             // method 0 = stored
    lh.setUint16(10, DOS_TIME, true);
    lh.setUint16(12, DOS_DATE, true);
    lh.setUint32(14, sum, true);
    lh.setUint32(18, data.length, true);  // compressed size == the real size
    lh.setUint32(22, data.length, true);
    lh.setUint16(26, name.length, true);
    lh.setUint16(28, 0, true);            // no extra field
    locals.push(new Uint8Array(lh.buffer), name, data);

    // Central directory entry — the same facts plus where the local header is.
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);            // version made by
    cd.setUint16(6, 20, true);            // version needed
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, DOS_TIME, true);
    cd.setUint16(14, DOS_DATE, true);
    cd.setUint32(16, sum, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint16(30, 0, true);            // extra
    cd.setUint16(32, 0, true);            // comment
    cd.setUint16(34, 0, true);            // disk number
    cd.setUint16(36, 0, true);            // internal attrs
    cd.setUint32(38, 0, true);            // external attrs
    cd.setUint32(42, offset, true);
    centrals.push(new Uint8Array(cd.buffer), name);

    offset += 30 + name.length + data.length;
  }

  const cdSize = centrals.reduce((n, p) => n + p.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(4, 0, true);             // this disk
  eocd.setUint16(6, 0, true);             // disk with the central directory
  eocd.setUint16(8, files.length, true);
  eocd.setUint16(10, files.length, true);
  eocd.setUint32(12, cdSize, true);
  eocd.setUint32(16, offset, true);       // where the central directory starts
  eocd.setUint16(20, 0, true);            // no archive comment

  const parts = [...locals, ...centrals, new Uint8Array(eocd.buffer)];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/** base64 → bytes. The generated bundle stores files this way. */
export function fromBase64(b64) {
  if (typeof atob === "function") {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, "base64"));   // Node, for the tests
}
