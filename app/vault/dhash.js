// Task 9.4: perceptual dedupe for the inspo grid — "you already saved this".
// Obsidian has no equivalent; this is the feature that makes it a designer's
// tool rather than a note-taking app.
//
// The hashes already in the vault were produced by Pillow, so this is a
// deliberate port rather than a fresh implementation: grayscale (ITU-R 601-2)
// → Lanczos-3 resize to 9×8 → 64 bits of "is this pixel darker than the next".
// Pillow resizes in two 8-bit passes with fixed-point coefficients, and both
// details change the output, so both are reproduced here.

const PRECISION_BITS = 22;
const SUPPORT = 3.0;

function sinc(x) {
  if (x === 0) return 1.0;
  const px = Math.PI * x;
  return Math.sin(px) / px;
}
function lanczos(x) {
  if (x < 0) x = -x;
  return x < SUPPORT ? sinc(x) * sinc(x / SUPPORT) : 0.0;
}

/** Pillow's precompute_coeffs, including its fixed-point normalisation. */
function coeffs(inSize, outSize) {
  const scale = inSize / outSize;
  const filterscale = Math.max(1.0, scale);
  const support = SUPPORT * filterscale;
  const ksize = Math.ceil(support) * 2 + 1;
  const bounds = new Int32Array(outSize * 2);
  const kk = new Int32Array(outSize * ksize);

  for (let xx = 0; xx < outSize; xx++) {
    const center = (xx + 0.5) * scale;
    const ss = 1.0 / filterscale;
    let xmin = Math.floor(center - support + 0.5);
    if (xmin < 0) xmin = 0;
    let xmax = Math.floor(center + support + 0.5);
    if (xmax > inSize) xmax = inSize;
    xmax -= xmin;
    const k = new Float64Array(xmax);
    let ww = 0.0;
    for (let x = 0; x < xmax; x++) {
      const w = lanczos((x + xmin - center + 0.5) * ss);
      k[x] = w;
      ww += w;
    }
    if (ww !== 0.0) for (let x = 0; x < xmax; x++) k[x] /= ww;
    bounds[xx * 2] = xmin;
    bounds[xx * 2 + 1] = xmax;
    // normalize_coeffs_8bpc: round-half-away-from-zero into fixed point
    for (let x = 0; x < xmax; x++) {
      const v = k[x] * (1 << PRECISION_BITS);
      kk[xx * ksize + x] = v < 0 ? Math.trunc(v - 0.5) : Math.trunc(v + 0.5);
    }
  }
  return { bounds, kk, ksize };
}

const clip8 = (v) => {
  const x = v >> PRECISION_BITS;
  return x <= 0 ? 0 : x >= 255 ? 255 : x;
};

/** One 8-bit resample pass, matching ImagingResampleHorizontal_8bpc. */
function resamplePass(src, srcW, srcH, outSize, horizontal) {
  const inSize = horizontal ? srcW : srcH;
  const { bounds, kk, ksize } = coeffs(inSize, outSize);
  const outW = horizontal ? outSize : srcW;
  const outH = horizontal ? srcH : outSize;
  const out = new Uint8ClampedArray(outW * outH);
  const round = 1 << (PRECISION_BITS - 1);

  for (let yy = 0; yy < outH; yy++) {
    for (let xx = 0; xx < outW; xx++) {
      const idx = horizontal ? xx : yy;
      const min = bounds[idx * 2], len = bounds[idx * 2 + 1];
      let ss = round;
      for (let i = 0; i < len; i++) {
        const sx = horizontal ? (min + i) : xx;
        const sy = horizontal ? yy : (min + i);
        ss += src[sy * srcW + sx] * kk[idx * ksize + i];
      }
      out[yy * outW + xx] = clip8(ss);
    }
  }
  return { data: out, w: outW, h: outH };
}

/** RGBA → 8-bit grey using ITU-R 601-2, exactly as PIL's convert("L") does. */
export function toGrey(rgba, w, h) {
  const g = new Uint8ClampedArray(w * h);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) {
    // Pillow's L24 macro: fixed-point ITU-R 601-2 with a rounding term, then
    // >> 16. Not the decimal /1000 form, and not truncation — measured against
    // the vault's own hashes, truncation drops the exact-match rate from 9/10
    // to 6/10, so this is empirical, not a guess.
    g[i] = (rgba[p] * 19595 + rgba[p + 1] * 38470 + rgba[p + 2] * 7471 + 32768) >> 16;
  }
  return g;
}

/** Grey plane → 16-char lowercase hex, the same string Pillow produced. */
export function dhashFromGrey(grey, w, h) {
  const a = resamplePass(grey, w, h, 9, true);
  const b = resamplePass(a.data, a.w, a.h, 8, false);
  const px = b.data;
  let hex = "";
  for (let row = 0; row < 8; row++) {
    let byte = 0;
    for (let col = 0; col < 8; col++) {
      byte = (byte << 1) | (px[row * 9 + col] < px[row * 9 + col + 1] ? 1 : 0);
    }
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/** Browser entry point: a Blob/File of any format the browser can decode. */
export async function dhashBrowser(blob) {
  const bmp = await createImageBitmap(blob);
  // Read the dimensions BEFORE close(): an ImageBitmap reports 0×0 once closed,
  // which silently produces an all-zero hash instead of an error.
  const w = bmp.width, h = bmp.height;
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  const { data } = ctx.getImageData(0, 0, w, h);
  bmp.close();
  return dhashFromGrey(toGrey(data, w, h), w, h);
}

/** Hamming distance between two hex hashes; ≤ 5 reads as "the same image". */
export function hamming(a, b) {
  if (!a || !b || a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

export const DUPLICATE_THRESHOLD = 5;
