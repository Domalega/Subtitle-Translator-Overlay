# Subtitle Translator Overlay

A Windows app that reads English text from your screen and shows translations in a window or over your video.

**[Download for Windows](https://github.com/Domalega/Subtitle-Translator-Overlay/releases/latest)** · [Architecture](docs/architecture.md)

## How to use

1. Download and run the portable `.exe` — no installation required.
2. Select **Choose subtitle area** and drag around the English subtitles.
3. Click **Start translation**. Use **Stop translation** to pause.
4. Choose your language in **Settings → Translation** and where translations appear in **Settings → Display**.
5. For a one-off translation, click **Translate an area** or press **Ctrl+Shift+T**.

OCR runs locally with a bundled English model; translation requires internet access. Screen capture is designed for the primary monitor, and recognition quality depends on text size, contrast and background. Live game/video playback and Windows display scaling still require manual validation.

## Built with

- **Electron & Node.js** — desktop app and screen capture.
- **JavaScript, HTML & CSS** — interface with Dark and Light themes.
- **Tesseract.js** — local English text recognition.
- **Google Translate** — online translation.
- **electron-builder** — portable Windows packaging.

## Run from source

Requires **Windows** and **Node.js 24.13.0+**.

```sh
git clone https://github.com/Domalega/Subtitle-Translator-Overlay.git
cd Subtitle-Translator-Overlay
npm ci
npm start
```

`npm run build` creates the portable executable in `dist/` and runs verification first. Run `npm run verify` to check changes. See the [contributing rules](AGENTS.md) for development guidance.

## License

[MIT](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.txt)
