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

These modules do not require Electron and can be tested with `node:test`.

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

## Game Mode Flow

1. The user enables `Game mode` in the main window.
2. Renderer calls `set-game-mode-enabled`.
3. The global Game mode hotkey opens `capture-select.html`.
4. The selected capture area is sent with `complete-capture-translate`.
5. Main runs Game OCR and translation.
6. Main sends `capture-result` to the main overlay window.
7. Renderer displays the Game mode result in the main window.

Game mode still outputs to the main overlay. The legacy `translate-window` is not opened automatically.

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

There is no `ipcRenderer.send()` usage in the current source.
