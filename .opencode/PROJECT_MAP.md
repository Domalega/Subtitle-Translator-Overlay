# Project Map

## Root

- `package.json` — package metadata, scripts, Electron main entry, build config.
- `package-lock.json` — lockfile. Avoid editing unless dependencies change.
- `README.md` — user instructions.
- `eng.traineddata` — English Tesseract OCR data.
- `Start Subtitle Overlay.cmd` — Windows shortcut launcher.
- `dist/` — generated build output. Do not inspect by default.

## Source files

### Main process

- `src/main.js`

Responsible for:
- app lifecycle;
- single instance lock;
- BrowserWindow creation;
- global shortcuts;
- IPC handlers;
- OCR worker lifecycle;
- screen capture;
- OCR area selection;
- dictionary persistence;
- translation endpoint;
- phonetic lookup;
- application shutdown.

### Preload bridge

- `src/preload.js`

Responsible for:
- exposing `window.overlayApi`;
- wrapping IPC calls for renderer/settings/dictionary/select windows.

### Main overlay UI

- `src/index.html`
- `src/renderer.js`
- `src/styles.css`

Responsible for:
- overlay structure;
- start/stop OCR button;
- read once;
- add word;
- dictionary/settings window buttons;
- compact/full view;
- subtitle display;
- status messages;
- UI theme and font scale application.

### Settings window

- `src/settings.html`
- `src/settings.js`
- `src/tool-window.css`

Responsible for:
- theme selection;
- font scale;
- overlay size;
- OCR area selection button;
- settings window close button.

### Dictionary window

- `src/dictionary.html`
- `src/dictionary.js`
- `src/tool-window.css`

Responsible for:
- dictionary list;
- sorting;
- pagination;
- listen button using speech synthesis;
- dictionary updates.

### OCR area selection

- `src/select.html`
- `src/select.js`
- `src/select.css`

Responsible for:
- fullscreen transparent selection window;
- rectangle drag selection;
- completing/cancelling OCR area selection.

## Fast lookup guide

- Text in main overlay: `src/index.html`, `src/renderer.js`, `src/styles.css`
- Drag title/header: `src/index.html`, `src/styles.css`
- Dictionary list/cards/sort: `src/dictionary.html`, `src/dictionary.js`, `src/tool-window.css`
- Settings status text: `src/settings.js`, `src/settings.html`
- Window closing/process remains alive: `src/main.js`
- IPC API mismatch: `src/preload.js` and `src/main.js`
- OCR recognition quality: `src/main.js`
- OCR area UI: `src/select.*`
