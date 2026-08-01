# Browser support

The app needs the **File System Access API** — `showDirectoryPicker`, directory
handles, and `createWritable`. Without it there is no way to read your files
without uploading them, which is the whole point, so there is no fallback and
no degraded mode. Non-Chromium visitors get an explainer page (task 8.3).

## Tested here

| Browser | Version | `showDirectoryPicker` | Result |
| --- | --- | --- | --- |
| Chromium (Electron 42.7.0) | **148.0.7778.280**, macOS | present | **works** — every API the app needs is available |

Everything the data layer depends on was checked in that engine, not assumed:

| API | Status |
| --- | --- |
| `showDirectoryPicker` / `showOpenFilePicker` | present |
| `FileSystemDirectoryHandle` | present |
| `FileSystemWritableFileStream` | present — atomic-ish writes via temp-and-swap |
| `navigator.storage.getDirectory` | present |
| `indexedDB` | present — handle persistence, thumbnail cache |
| `BroadcastChannel` | present — multi-tab writer election |
| `serviceWorker` | present — offline |
| `OffscreenCanvas` / `createImageBitmap` | present — thumbnails, perceptual hash |
| secure context | true over `http://localhost` |

## Not tested here — do not read these as verified

I could only run one engine. The rows below are the *expectation*, and each
needs a real check on a real browser before it is a claim:

| Browser | Expectation | Why |
| --- | --- | --- |
| Chrome (stable, macOS/Windows) | should work | same engine as the row above, 148 is well past the API's ship |
| Edge | should work | Chromium |
| Arc | should work | Chromium |
| Brave | should work, but **worth checking** — its shields have blocked storage APIs before |
| Safari | **will not work** | has never shipped `showDirectoryPicker` |
| Firefox | **will not work** | has never shipped `showDirectoryPicker` |

The two "will not work" rows are the reason the explainer page exists. The
explainer itself was exercised by removing the API in Chromium and confirming it
renders with four browser links and zero console errors — but it has **not** been
loaded in Safari or Firefox, which is what task S2 actually asks for.

## How to check

Open the app and run this in the console:

```js
typeof window.showDirectoryPicker
```

`"function"` means the browser is supported. `"undefined"` means you will see
the explainer instead.
