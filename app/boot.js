// Tasks 8.2 / 8.3 / 8.7. Two jobs, before the app is allowed to start:
//
//   1. Feature-detect showDirectoryPicker. Without it the app cannot read a
//      vault at all, so a non-Chromium visitor gets a real explanation instead
//      of a blank page or a stack trace.
//   2. Register the service worker, so offline works.
window.SB_VERSION = "v3";

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

  function renderExplainer() {
    var root = document.getElementById("root") || document.body;
    root.innerHTML = [
      '<main class="sb-explainer">',
      '  <h1>Canon Vault needs a Chromium browser</h1>',
      '  <p>This app reads and writes plain markdown files directly on your disk',
      '     using the File System Access API, which only Chromium browsers',
      '     implement &mdash; so there is nothing it can open here.</p>',
      '  <ul>',
      '    <li><a href="https://www.google.com/chrome/">Chrome</a></li>',
      '    <li><a href="https://www.microsoft.com/edge">Edge</a></li>',
      '    <li><a href="https://arc.net/">Arc</a></li>',
      '    <li><a href="https://brave.com/">Brave</a></li>',
      '  </ul>',
      '  <p class="sb-explainer-note">Your notes are ordinary files. Obsidian or',
      '     any text editor will open them in the meantime.</p>',
      '</main>',
    ].join("\n");
    document.documentElement.setAttribute("data-unsupported", "true");
  }
})();
