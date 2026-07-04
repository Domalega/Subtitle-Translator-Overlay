# Known Bugs / Recurring Issues

## Electron process may remain visible after closing windows

Symptoms:
- after closing app windows, process/window may still be visible in Alt+Tab or task list.

Likely files:
- `src/main.js`

Likely areas:
- `window-all-closed`
- OCR worker termination
- tool windows cleanup
- selection window cleanup
- app quit logic

Notes:
- Check `ocrWorkerPromise` termination.
- Check all BrowserWindow references: `mainWindow`, `selectionWindow`, `settingsWindow`, `dictionaryWindow`.
- Do not add tray/background behavior unless requested.

## OCR area selection status text appears in settings

Symptoms:
- status/help text appears at the bottom after selecting OCR area.

Likely files:
- `src/settings.js`
- `src/settings.html`

Current note:
- Settings script may write selection status into `statusElement`.

## Dictionary UI can become too wide or visually fragmented

Symptoms:
- sorting field width/layout issues;
- word entries shown as separate cards when unified list is desired.

Likely files:
- `src/dictionary.js`
- `src/dictionary.html`
- `src/tool-window.css`
