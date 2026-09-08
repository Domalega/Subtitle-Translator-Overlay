# Architecture

This describes the current 0.2.2 source. See [working rules](../AGENTS.md) for development and verification policy and the [README](../README.md) for user-facing setup.

## Main Process

`src/main.js` is the Electron entry point. `src/main/app.js` owns Electron windows, global shortcuts, file dialogs, screen capture, Tesseract workers, persisted JSON files, dictionary storage, and network translation calls.

Main windows currently loaded by `BrowserWindow.loadFile()` are:

- `src/renderer/main/index.html`: main overlay window.
- `src/renderer/settings/settings.html`: settings tool window.
- `src/renderer/dictionary/dictionary.html`: dictionary tool window.
- `src/renderer/capture/select.html`: Screen OCR area selection window.
- `src/renderer/capture/capture-select.html`: one-shot capture selection window.
- `src/renderer/overlays/near-source/near-source-overlay.html`: independent transparent translation-only window.
- `src/renderer/overlays/developer-zone/developer-ocr-zone.html`: transparent, mouse-pass-through diagnostic border outside the saved OCR crop.

The main process keeps `contextIsolation` enabled and `nodeIntegration` disabled for renderer windows.

## Preload

`src/preload.js` exposes the `window.overlayApi` bridge through `contextBridge`.

Methods use `ipcRenderer.invoke()`. Event subscriptions strip the Electron event object and return an unsubscribe function. Main handlers validate the owning window, top frame and local renderer URL; renderer navigation and popups are blocked.

## Renderer

`src/renderer/main/renderer.js` owns the main overlay UI wiring. Pure text logic, subtitle stabilization, output rendering, and OCR coordination are separated into browser-loadable modules under `src/shared/`:

- `text-utils.js`
- `subtitle-stabilizer.js`
- `main-panel-output.js`
- `screen-ocr-coordinator.js`
- `output-router.js`
- `near-source-output.js`

These modules do not require Electron and can be tested with `node:test`.

## Output Contract And Router

`ScreenOcrCoordinator` uses only an output contract: `showRecognizedText(text)`, `showTranslationPending(sourceText)`, `showTranslation(translatedText, sourceText)`, `showTranslationError(error)`, `setStatus(status)`, `clear()`, and `setVisible(visible)`. It has no DOM or `BrowserWindow` dependency.

`OutputRouter` always forwards Screen OCR output to `MainPanelOutput`. In `overlay` or `both` mode it also forwards successful translations to `NearSourceOutput`; pending and errors preserve the last successful translation. It retains the last recognized text and successful translation. One-shot captures and manual editing are excluded from the near-source route. The internal legacy game-mode flag now represents transient manual-output ownership, not a selectable UI mode.

`NearSourceOutput` is an adapter with injected `showOverlay`, `hideOverlay`, `clearOverlay`, and `updateOverlaySettings` dependencies. It contains no Electron API or OCR/translation logic.

## Screen OCR Flow

1. The user selects an OCR area directly from the main window or Translation settings.
2. `src/renderer/capture/select.html` sends `complete-ocr-area` through preload.
3. Main stores the selected OCR area and broadcasts `ocr-area-changed`.
4. The main overlay enables one-shot read and continuous translation behavior through `ScreenOcrCoordinator`.
5. `ScreenOcrCoordinator` polls `capture-screen-subtitle-frame` every 200 ms, with changed-frame detection and periodic forced refreshes; `Read once` forces capture.
6. Main returns a cropped frame and area revision. `recognize-screen-subtitle-frame` prepares the crop with `src/main/services/subtitle-image-preprocessor.js` (component filtering, polarity, border and letter-height normalization), then runs the serialized Tesseract worker, rejects stale area revisions, cleans OCR text and returns text. Capture and recognition queues track generations across Stop/Start. The legacy `read-screen-subtitle` path remains available.
7. `SubtitleStabilizer` filters empty OCR, OCR noise, duplicate subtitles, similar subtitles, and growing candidates.
8. Accepted candidates are translated through the existing `translate` IPC path.
9. `MainPanelOutput` updates the translated result and expandable English original.

## Near-Source Overlay

The main process creates one reusable `nearSourceWindow`. It is transparent, frameless, always-on-top, taskbar-free, non-resizable, non-focusable, created hidden, and has `contextIsolation: true` and `nodeIntegration: false`. Mouse events are ignored and it is displayed with `showInactive()` only after a renderer measurement.

The overlay renderer uses `textContent`, measures its card on `requestAnimationFrame`, suppresses identical measurements, and returns its size. Main clamps the size and uses `src/shared/output/near-source-position.js` to put it below the anchor when possible, otherwise above it. It is hidden on Stop, panel mode, and one-shot capture; it is closed with the main window.

## Coordinates

`src/renderer/capture/select.js` emits local DIP coordinates inside the primary-display selection window. Existing `ocrArea` remains a physical-pixel crop: main multiplies local coordinates by the primary display `scaleFactor` before `nativeImage.crop()`.

`ocrAnchorBoundsDip` is separate: main adds `display.bounds` to local DIP coordinates and uses it only for BrowserWindow placement. BrowserWindow bounds and `display.workArea` are DIP. This stage targets the primary monitor; it does not claim complete multi-monitor or DPI crop support. Without an anchor, near-source mode asks the user to select the OCR area again rather than guessing.

## Game Mode Flow

1. The user enables `Game mode` in the main window.
2. Renderer calls `set-game-mode-enabled`.
3. The global Game mode hotkey opens `src/renderer/capture/capture-select.html`.
4. The selected capture area is sent with `complete-capture-translate`.
5. Main runs Game OCR and translation.
6. Main sends `capture-result` to the main overlay window.
7. Renderer displays the Game mode result in the main window.

Game mode outputs to the main overlay.
Near-source overlay is hidden while Game mode is enabled and capture results never route to it.

## Developer Diagnostics

`developerMode` is a persisted UI setting, disabled by default. Main owns one transparent OCR-zone window which is taskbar-free, non-focusable and ignores mouse input. Its border is positioned outside `ocrAnchorBoundsDip`, so it is not part of the OCR crop; its theme color is updated with the UI theme. Main sends compact `developer-status` stage events and request-scoped OCR progress through preload. The renderer displays only the latest diagnostic stage while Developer mode is enabled.

## Translation Flow

Main uses `TranslationService` for the current Google Translate endpoint:

- endpoint construction;
- network fetch;
- timeout;
- abort handling;
- response parsing;
- bounded cache;
- scoped stale request cancellation;
- normalized translation errors.

Renderer keeps using the existing preload IPC methods. Screen OCR, manual retranslate, and one-shot captures use separate translation scopes so they do not cancel each other accidentally.

## Settings Flow

`src/shared/settings/settings-store.js` defines `DEFAULT_UI_SETTINGS` and `normalizeUiSettings()`.

Main loads `ui-settings.json`, normalizes missing or invalid fields, preserves unknown legacy fields, and saves updates through serialized read-modify-write transactions using an exclusive temporary file, sync and rename. Malformed stored JSON is reported rather than overwritten. Dictionary and game settings use the same store. The settings UI uses `ui-settings.json` as the source of truth. `localStorage` is only a local cache for renderer UI state.

Hidden legacy Game OCR settings may remain in old JSON files, but they are not shown in the current settings interface.

Near-source settings are `displayMode` (`panel`, `overlay`, or `both`), placement, vertical offset, font size, background opacity, maximum width, and maximum lines. Invalid saved values are normalized while unrelated legacy JSON fields are preserved.

## Dictionary Flow

Dictionary entries are stored in `dictionary.json` under Electron `userData`.

The dictionary window uses preload methods for:

- reading entries;
- adding entries;
- deleting entries;
- exporting entries;
- requesting context examples.

Delete confirmation is controlled by normalized UI settings.

## Legacy SRT

SRT parsing and `open-srt` IPC still exist in code. The current UI does not expose SRT loading and this refactor does not activate it.


## IPC Directions

Renderer to main through `ipcRenderer.invoke()`:

- `open-srt`
- `translate`
- `translate-text`
- `get-phonetic`
- `dictionary-get`
- `dictionary-add`
- `dictionary-delete`
- `get-context-sentences`
- `export-dictionary`
- `capture-screen-subtitle-frame`
- `recognize-screen-subtitle-frame`
- `read-screen-subtitle`
- `select-ocr-area`
- `complete-ocr-area`
- `cancel-ocr-area`
- `restore-window`
- `move-window`
- `resize-window`
- `set-window-size`
- `open-settings-window`
- `open-dictionary-window`
- `close-current-window`
- `set-ui-setting`
- `start-capture-translate`
- `complete-capture-translate`
- `cancel-capture-translate`
- `set-game-mode-enabled`
- `get-ui-settings`
- `set-game-hotkey`
- `get-game-settings`
- `set-game-setting`
- `show-near-source-overlay`
- `hide-near-source-overlay`
- `clear-near-source-overlay`
- `update-near-source-settings`
- `near-source-overlay-measured`

Main to renderer through `webContents.send()`:

- `developer-status`
- `capture-result`
- `game-mode-disabled`
- `toggle-controls`
- `window-restored`
- `stop-ocr`
- `ocr-progress`
- `ocr-area-changed`
- `apply-ui-setting`
- `apply-ui-settings`
- `dictionary-changed`
- `near-source-overlay-content`
- `near-source-overlay-settings`

There is no `ipcRenderer.send()` usage in the current source.

## Offline OCR and validation

Tesseract workers use the local English model with downloads/cache writes disabled. The source model is `resources/ocr/eng.traineddata`. In packaged builds it lives in `resources/eng.traineddata`; all runtime `node_modules`, including the worker/WASM and their dependencies, are unpacked outside ASAR. OcrWorkerService serializes jobs, bounds initialization/recognition/disposal and retires late workers. See [stage-1 audit](audit-stage-1.md) for regression coverage, integration checks and remaining OS acceptance work.

The [OCR 0.2.2 report](ocr-quality-0.2.2.md) describes sample replay and preprocessing evidence. `npm run verify` checks source-mode integration; `test/integration/packaged-ocr-smoke.js` is a separate check using the packaged executable and its resources.

## UI architecture

See [UI design and extension points](ui-design.md) for the two-action workflow, semantic themes, English localization catalog, reset transactions, and verification boundaries. The main window keeps the full result available for every display setting. Diagnostics now live in Advanced settings. UI smoke tests use offscreen rendering with an isolated profile and save previews in `.agent/tmp/ui-preview/`.
