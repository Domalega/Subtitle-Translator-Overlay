# Architecture

## Main Process

`src/main.js` owns Electron windows, global shortcuts, file dialogs, screen capture, Tesseract workers, persisted JSON files, dictionary storage, and network translation calls.

Main windows currently loaded by `BrowserWindow.loadFile()` are:

- `index.html`: main overlay window.
- `settings.html`: settings tool window.
- `dictionary.html`: dictionary tool window.
- `select.html`: Screen OCR area selection window.
- `capture-select.html`: Game mode capture selection window.
- `translate-window.html`: legacy translation window, kept for a later architecture pass.
- `near-source-overlay.html`: independent transparent translation-only window.
- `developer-ocr-zone.html`: transparent, mouse-pass-through diagnostic border outside the saved OCR crop.

The main process keeps `contextIsolation` enabled and `nodeIntegration` disabled for renderer windows.

## Preload

`src/preload.js` exposes the `window.overlayApi` bridge through `contextBridge`.

The preload contract is intentionally preserved. Existing methods still use `ipcRenderer.invoke()` and existing event subscriptions still use `ipcRenderer.on()`.

## Renderer

`src/renderer.js` owns the main overlay UI wiring. Pure text logic, subtitle stabilization, output rendering, and OCR coordination are separated into browser-loadable modules:

- `text-utils.js`
- `subtitle-stabilizer.js`
- `main-panel-output.js`
- `screen-ocr-coordinator.js`
- `output-router.js`
- `near-source-output.js`

These modules do not require Electron and can be tested with `node:test`.

## Output Contract And Router

`ScreenOcrCoordinator` uses only an output contract: `showRecognizedText(text)`, `showTranslationPending(sourceText)`, `showTranslation(translatedText, sourceText)`, `showTranslationError(error)`, `setStatus(status)`, `clear()`, and `setVisible(visible)`. It has no DOM or `BrowserWindow` dependency.

`OutputRouter` always forwards Screen OCR output to `MainPanelOutput`. In `near-source` mode it also forwards successful translations to `NearSourceOutput`; pending and errors preserve the last successful translation. It retains the last recognized text and successful translation. Game mode is explicitly excluded from the near-source route.

`NearSourceOutput` is an adapter with injected `showOverlay`, `hideOverlay`, `clearOverlay`, and `updateOverlaySettings` dependencies. It contains no Electron API or OCR/translation logic.

## Screen OCR Flow

1. The user selects an OCR area from `Settings`.
2. `select.html` sends `complete-ocr-area` through preload.
3. Main stores the selected OCR area and broadcasts `ocr-area-changed`.
4. The main overlay enables `Read once` and `Start` behavior through `ScreenOcrCoordinator`.
5. `ScreenOcrCoordinator` calls `read-screen-subtitle` through preload.
6. Main captures the screen, crops the selected area, runs Tesseract, cleans OCR text, and returns text.
7. `SubtitleStabilizer` filters empty OCR, OCR noise, duplicate subtitles, similar subtitles, and growing candidates.
8. Accepted candidates are translated through the existing `translate` IPC path.
9. `MainPanelOutput` updates the main English and Russian text columns.

## Near-Source Overlay

The main process creates one reusable `nearSourceWindow`. It is transparent, frameless, always-on-top, taskbar-free, non-resizable, non-focusable, created hidden, and has `contextIsolation: true` and `nodeIntegration: false`. Mouse events are ignored and it is displayed with `showInactive()` only after a renderer measurement.

The overlay renderer uses `textContent`, measures its card on `requestAnimationFrame`, suppresses identical measurements, and returns its size. Main clamps the size and uses `near-source-position.js` to put it below the anchor when possible, otherwise above it. It is hidden on Stop, panel mode, and Game mode; it is closed with the main window.

## Coordinates

`select.js` emits local DIP coordinates inside the primary-display selection window. Existing `ocrArea` remains a physical-pixel crop: main multiplies local coordinates by the primary display `scaleFactor` before `nativeImage.crop()`.

`ocrAnchorBoundsDip` is separate: main adds `display.bounds` to local DIP coordinates and uses it only for BrowserWindow placement. BrowserWindow bounds and `display.workArea` are DIP. This stage targets the primary monitor; it does not claim complete multi-monitor or DPI crop support. Without an anchor, near-source mode asks the user to select the OCR area again rather than guessing.

## Game Mode Flow

1. The user enables `Game mode` in the main window.
2. Renderer calls `set-game-mode-enabled`.
3. The global Game mode hotkey opens `capture-select.html`.
4. The selected capture area is sent with `complete-capture-translate`.
5. Main runs Game OCR and translation.
6. Main sends `capture-result` to the main overlay window.
7. Renderer displays the Game mode result in the main window.

Game mode still outputs to the main overlay. The legacy `translate-window` is not opened automatically.
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

Renderer keeps using the existing preload IPC methods. Screen OCR, manual retranslate, and Game mode use separate translation scopes so they do not cancel each other accidentally.

## Settings Flow

`settings-store.js` defines `DEFAULT_UI_SETTINGS` and `normalizeUiSettings()`.

Main loads `ui-settings.json`, normalizes missing or invalid fields, preserves unknown legacy fields, and saves updates through a serialized write queue. The settings UI uses `ui-settings.json` as the source of truth. `localStorage` is only a local cache for renderer UI state.

Hidden legacy Game OCR settings may remain in old JSON files, but they are not shown in the current settings interface.

Near-source settings are `displayMode` (`panel` by default or `near-source`), placement, vertical offset, font size, background opacity, maximum width, and maximum lines. Invalid saved values are normalized while unrelated legacy JSON fields are preserved.

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

## Legacy Translate Window

`translate-window.html` and `translate-window.js` are kept. The current Game mode output is still displayed in the main overlay window and this refactor does not automatically open the translation window.

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
- `open-translate-window`
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
