# Decisions

## Current architectural decisions

- Keep the app as a simple Electron project without frontend framework.
- Keep main process logic in `src/main.js`.
- Keep renderer API access through `src/preload.js`.
- Keep generated Windows build in `dist/`.
- Use Tesseract via `tesseract.js` and local `eng.traineddata`.
- Use Google Translate endpoint without API key.
- Store dictionary in Electron `app.getPath('userData')` as `dictionary.json`.

## Working decisions for agent

- Do not inspect `dist` or `node_modules`.
- Do not run build unless explicitly requested.
- Prefer minimal UI/CSS changes.
- Do not change translation/OCR pipeline unless task is specifically about translation/OCR.
