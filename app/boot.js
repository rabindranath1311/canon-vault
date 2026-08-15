// Tasks 8.2 / 8.3 / 8.7. Two jobs, before the app is allowed to start:
//
//   1. Feature-detect showDirectoryPicker. Without it the app cannot read a
//      vault at all, so a non-Chromium visitor gets a real explanation instead
//      of a blank page or a stack trace.
//   2. Register the service worker, so offline works.
window.SB_VERSION = "v3";

// Apply the saved colour mode SYNCHRONOUSLY, before anything paints.
// index.html ships data-theme="light", and app.js only loads once a vault is
// open — so without this the first-run screen ignored your mode entirely, and
// the app flashed light before correcting itself on boot. This has to be
// cheap, synchronous, and never throw: a broken read must fall back, not
// leave the page unstyled.
(function () {
  var THEMES = ["light", "sepia", "dark", "midnight"];
  try {
    var pref = (JSON.parse(localStorage.getItem("sb.prefs") || "{}") || {}).theme || "light";
    if (pref === "system") {
      pref = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark" : "light";
    }
    if (THEMES.indexOf(pref) < 0) pref = "light";
    document.documentElement.setAttribute("data-theme", pref);
  } catch (_) { /* keep the markup default */ }
})();

(function () {
  var supported = typeof window.showDirectoryPicker === "function";

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }

  if (!supported) {
    document.addEventListener("DOMContentLoaded", renderExplainer);
    if (document.readyState !== "loading") renderExplainer();
    return;
  }

  // Supported: the markdown renderer is a classic script (UMD global), then the
  // module bridge stands the vault up and loads app.js itself.
  var mk = document.createElement("script");
  mk.src = "vendor/markdown-it.min.js";
  mk.async = false;
  document.head.appendChild(mk);

  // Inherit the cache-bust from our own <script src="boot.js?v=NN"> rather than
  // hardcoding it. A second copy of the number drifts: bumping only the one in
  // index.html left every module here served from cache, which looks exactly
  // like a shipped fix that did not work.
  var mine = document.currentScript || document.querySelector('script[src*="boot.js"]');
  var v = ((mine && mine.src.match(/[?&]v=([^&]+)/)) || [, "0"])[1];

  var bridge = document.createElement("script");
  bridge.type = "module";
  bridge.src = "vault/bridge.js?v=" + v;
  document.head.appendChild(bridge);

  /* The other front door, and the one nobody designs.
     A Safari or Firefox visitor cannot be shown the app at all, so this is
     the entire product as far as they are concerned — it used to be a
     heading, a paragraph and a bare <ul> of four links. It carries the same
     lockup, the same field and the same promises as the supported screen,
     because the question they are answering ("is this worth switching
     browsers for?") needs the same answer, and because a page that looks
     abandoned reads as a project that is. */
  function renderExplainer() {
    var root = document.getElementById("root") || document.body;
    var BROWSERS = [
      ["Chrome", "https://www.google.com/chrome/"],
      ["Edge", "https://www.microsoft.com/edge"],
      ["Arc", "https://arc.net/"],
      ["Brave", "https://brave.com/"],
    ];
    root.innerHTML =
      '<main class="sb-connect sb-explainer">'
      + '<div class="sb-hero">'
      /* The artwork comes from icons/*.svg through a CSS mask rather than a
         third inline copy of the paths. A mask takes currentColor, so it
         still flips with the mode — which an <img> would not. */
      + '  <div class="sb-connect-brand brand-masked" aria-label="Canon Vault">'
      + '    <span class="brand-mark" role="img" aria-label="Canon Vault"></span>'
      + '    <span class="brand-word" aria-hidden="true"></span>'
      + '  </div>'
      + '  <p class="sb-flag">Chromium only</p>'
      + '  <h1 class="sb-hero-h">Your notes live in a folder. This browser cannot open one.</h1>'
      + '  <p class="sb-hero-p">Canon Vault reads and writes plain markdown straight from a'
      + '     folder on your disk, through the File System Access API — which only Chromium'
      + '     browsers implement. There is no server-side copy for it to fall back to, because'
      + '     there is no server.</p>'
      + '  <div class="sb-actions">'
      + BROWSERS.map(function (b) {
          return '<a class="sb-connect-demo" href="' + b[1] + '">' + b[0] + ' ↗</a>';
        }).join("")
      + '  </div>'
      + '  <p class="sb-actions-note">Open this page in any of them and the folder picker'
      + '     is one click away.</p>'
      + '</div>'
      + '<ul class="sb-promises">'
      + '  <li class="sb-promise" style="--i:0"><h2 class="sb-promise-t">Nothing is stranded</h2>'
      + '    <p class="sb-promise-d">There is no export to run and no account to close. Your'
      + '       notes are ordinary markdown files in a folder you already have.</p></li>'
      + '  <li class="sb-promise" style="--i:1"><h2 class="sb-promise-t">Obsidian works today</h2>'
      + '    <p class="sb-promise-d">Same folder, same files, every platform. This app is one'
      + '       client of it, not the thing that owns it.</p></li>'
      + '  <li class="sb-promise" style="--i:2"><h2 class="sb-promise-t">So does your agent</h2>'
      + '    <p class="sb-promise-d">The file convention is public, so a coding agent can read'
      + '       and write the vault from anywhere.</p></li>'
      + '</ul>'
      + '</main>';
    document.documentElement.setAttribute("data-unsupported", "true");
  }
})();
