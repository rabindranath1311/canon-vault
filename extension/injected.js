// Functions that run *inside the page*, injected by chrome.scripting.
//
// Each one must be self-contained — Chrome serializes the function source and
// evaluates it in the page's isolated world, so a reference to anything in this
// module's scope would be a ReferenceError in someone's browser and nowhere
// else. No imports, no shared helpers, no closure. That is the reason they live
// together in a file of their own rather than beside the code that calls them.
//
// What they return is untrusted: it is whatever the page says about itself.
// clip.js is what makes it safe to write down.

/** Open Graph and friends, the current selection, and the alt text of one image. */
export function readPageMeta(imgSrc) {
  const meta = (name) => {
    const el = document.querySelector(
      `meta[property="${name}"], meta[name="${name}"]`);
    return (el && el.getAttribute("content")) || "";
  };
  let alt = "";
  if (imgSrc) {
    for (const img of document.images) {
      if (img.currentSrc === imgSrc || img.src === imgSrc) {
        alt = img.alt || img.getAttribute("aria-label") || "";
        break;
      }
    }
  }
  const sel = String(window.getSelection ? window.getSelection() : "").trim();
  return {
    url: location.href,
    title: document.title || "",
    selection: sel.slice(0, 4000),
    alt,
    og: {
      title: meta("og:title") || meta("twitter:title"),
      description: meta("og:description") || meta("twitter:description") || meta("description"),
      image: meta("og:image") || meta("twitter:image") || meta("twitter:image:src"),
      siteName: meta("og:site_name"),
      author: meta("article:author") || meta("author"),
    },
  };
}

/**
 * Fetch an image from inside the page, as a data URL.
 *
 * The fallback for the images the extension cannot fetch itself: ones behind a
 * referer check, a signed cookie, or a CDN that only answers requests from the
 * page they belong to. The page's own fetch carries all of that.
 */
export function fetchImageInPage(src) {
  return fetch(src, { credentials: "include" })
    .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((blob) => new Promise((res, rej) => {
      if (blob.size > 24 * 1024 * 1024) { rej(new Error("image too large")); return; }
      const fr = new FileReader();
      fr.onload = () => res({ dataUrl: String(fr.result), mime: blob.type });
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(blob);
    }))
    .catch((e) => ({ error: String((e && e.message) || e) }));
}

/**
 * Drag a rectangle over the page; resolves with it, or with null on Escape or
 * a click with no drag.
 *
 * The overlay is the only thing this extension ever puts on someone's page, it
 * is removed on every exit path including the error one, and it takes no
 * decision on the user's behalf: the selection is theirs, and Escape means no.
 * Sizes come back in CSS pixels along with the viewport width, so the caller
 * can scale the crop to the screenshot without trusting devicePixelRatio.
 */
export function selectRegion() {
  return new Promise((resolve) => {
    const prev = document.getElementById("canon-clip-region");
    if (prev) prev.remove();

    const host = document.createElement("div");
    host.id = "canon-clip-region";
    Object.assign(host.style, {
      position: "fixed", inset: "0", zIndex: "2147483647", cursor: "crosshair",
      background: "rgba(9, 9, 11, 0.28)",
    });
    const box = document.createElement("div");
    Object.assign(box.style, {
      position: "fixed", display: "none", border: "1.5px solid #fafafa",
      boxShadow: "0 0 0 9999px rgba(9, 9, 11, 0.28)", background: "transparent",
      pointerEvents: "none",
    });
    const hint = document.createElement("div");
    hint.textContent = "Drag to clip a region — Esc to cancel";
    Object.assign(hint.style, {
      position: "fixed", top: "16px", left: "50%", transform: "translateX(-50%)",
      font: "500 13px/1.4 ui-sans-serif, system-ui, sans-serif", color: "#fafafa",
      background: "rgba(9, 9, 11, 0.86)", padding: "7px 12px", borderRadius: "8px",
      pointerEvents: "none",
    });
    host.append(box, hint);
    document.documentElement.appendChild(host);

    let sx = 0, sy = 0, dragging = false;
    const done = (value) => {
      host.remove();
      window.removeEventListener("keydown", onKey, true);
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(null); }
    };
    const draw = (e) => {
      const x = Math.min(sx, e.clientX), y = Math.min(sy, e.clientY);
      const w = Math.abs(e.clientX - sx), h = Math.abs(e.clientY - sy);
      Object.assign(box.style, {
        display: "block", left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`,
      });
      return { x, y, w, h };
    };

    host.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      dragging = true; sx = e.clientX; sy = e.clientY;
      hint.style.display = "none";
    }, true);
    host.addEventListener("mousemove", (e) => { if (dragging) draw(e); }, true);
    host.addEventListener("mouseup", (e) => {
      if (!dragging) return;
      const r = draw(e);
      dragging = false;
      if (r.w < 8 || r.h < 8) { done(null); return; }
      done({
        ...r,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        url: location.href,
        title: document.title || "",
      });
    }, true);
    window.addEventListener("keydown", onKey, true);
  });
}
