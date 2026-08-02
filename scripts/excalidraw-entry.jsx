// The vendored bundle's only entry point.
//
// Everything React is sealed in here on purpose. `app.js` is a classic script
// that knows nothing about JSX, hooks or roots — it calls `mountExcalidraw`,
// gets a handle back, and is otherwise unchanged. If we ever drop Excalidraw,
// this file and one vendor directory are the whole blast radius.
//
// Built by scripts/vendor-excalidraw.mjs. Do not import this from app code —
// import the built file at vendor/excalidraw/excalidraw.js instead.

import React from "react";
import { createRoot } from "react-dom/client";
import {
  Excalidraw,
  exportToSvg,
  exportToBlob,
  getSceneVersion,
  restore,
} from "@excalidraw/excalidraw";

/**
 * Mount an editor into `el`.
 *
 * `onChange` fires on every pointer move, so the caller debounces and compares
 * `getSceneVersion()` before writing anything to disk — a save per mousemove
 * would shred the vault's `.history` snapshots.
 */
export function mountExcalidraw(el, opts = {}) {
  const root = createRoot(el);
  let api = null;

  root.render(
    React.createElement(Excalidraw, {
      // `restore` fills in defaults for anything an older plugin version wrote,
      // which is what lets a file from any Excalidraw era open without patching.
      initialData: opts.initialData ? restore(opts.initialData, null, null) : null,
      theme: opts.theme || "dark",
      viewModeEnabled: !!opts.viewMode,
      langCode: "en",
      excalidrawAPI: (a) => {
        api = a;
        if (opts.onReady) opts.onReady(handle);
      },
      onChange: () => { if (opts.onChange) opts.onChange(handle); },
    }),
  );

  const handle = {
    /** The scene in the shape `.excalidraw.md` stores. */
    getScene() {
      if (!api) return null;
      return {
        type: "excalidraw",
        version: 2,
        source: "https://github.com/zsviczian/obsidian-excalidraw-plugin/releases",
        elements: api.getSceneElements(),
        appState: api.getAppState(),
        files: api.getFiles(),
      };
    },
    /** Cheap change detector — compare before deciding to write. */
    version() { return api ? getSceneVersion(api.getSceneElements()) : 0; },
    /** Replace the on-screen scene, e.g. after Obsidian changed the file. */
    setScene(scene) {
      if (!api || !scene) return;
      const r = restore(scene, null, null);
      api.updateScene({ elements: r.elements, appState: r.appState });
      if (scene.files) api.addFiles(Object.values(scene.files));
    },
    async toSvg(scene) {
      const r = restore(scene, null, null);
      return exportToSvg({ elements: r.elements, appState: r.appState, files: scene.files || {} });
    },
    async toBlob(scene) {
      const r = restore(scene, null, null);
      return exportToBlob({ elements: r.elements, appState: r.appState, files: scene.files || {} });
    },
    destroy() { root.unmount(); },
  };
  return handle;
}
