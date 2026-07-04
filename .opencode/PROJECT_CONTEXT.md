# Project Context

## Name

Subtitle Translator Overlay

## Purpose

Electron desktop app that displays a transparent always-on-top subtitle overlay. It shows Russian translation for English `.srt` subtitles and also has an experimental Screen OCR mode that reads English subtitles from the screen without an `.srt` file.

## Runtime

- Electron app
- Main entry: `src/main.js`
- Product name: `Subtitle Translator Overlay`
- Package name: `subtitle-translation-overlay`
- Build output: `dist/`
- Portable Windows build through `electron-builder`

## Important features

- Transparent overlay window above video.
- English subtitle display.
- Russian translation display.
- SRT parsing and local translation cache.
- Google Translate endpoint without API key.
- Screen OCR using Tesseract.
- OCR area selection window.
- Dictionary with selected words.
- English pronunciation/transcription lookup.
- Settings window for theme, font scale and window size.
- Global shortcuts:
  - `Ctrl+Shift+O` restore main window
  - `Ctrl+Shift+H` toggle controls
  - `Ctrl+Shift+S` stop OCR

## Dependencies

- `electron`
- `electron-builder`
- `tesseract.js`
- `pngjs`

## Project constraints

- Keep changes local and practical.
- Do not redesign the architecture unless explicitly requested.
- Do not touch build configuration unless task requires it.
- Do not inspect `dist` or `node_modules`.
