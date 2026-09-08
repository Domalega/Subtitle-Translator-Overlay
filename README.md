# Subtitle Translator Overlay

Electron desktop overlay for reading English text from a selected screen area with OCR and showing a Russian translation.

Current package version: **0.2.2**. OCR uses the bundled English model locally; translation and dictionary context requests require network access.

## Features

### Screen OCR
- Select an OCR area from `Settings` with `Select OCR area`.
- Use `Read once` to read the selected area one time.
- Use `Start` / `Stop` to check the selected area continuously every 200 ms; unchanged frames are skipped with periodic forced refreshes.
- Shows recognized English text in the left column and Russian translation in the right column.
- Translation results are cached in the main process to reduce repeated translation requests.

### Display Modes
- `Main panel` is the default mode and shows original and translation in the application window.
- `Near original subtitles` is optional and shows only the translation next to the selected original subtitle area.
- Select an OCR area before using near-source mode. Auto prefers below the original subtitles and falls back above; Below and Above can be selected explicitly.
- The near-source overlay is transparent, does not capture mouse input, and is intended for the primary monitor.

### Editing And Translation
- In `Game mode`, the recognized original text can be edited in the main window.
- Use `Retranslate edited` to translate the edited text again.
- Translation uses the Google Translate endpoint used by the application code.

### Dictionary
- Select a word in the overlay and press `Add word` to add it to the personal dictionary.
- Open the dictionary with `Dictionary`.
- Dictionary supports search, sorting, pagination, word deletion, context examples, and export to CSV or JSON.
- `Study` opens the available flashcard-style study mode.

### Appearance And UI
- `Settings` supports theme, font, text scale, main window width, and main window height.
- `Confirm before deleting words` controls dictionary delete confirmation.
- `Context examples count` controls how many context examples are requested.
- `Focus mode` hides non-essential controls in the main overlay.
- `Developer mode` shows the selected OCR area and the current OCR processing stage for diagnostics.

### Game Mode
- Enable `Game mode` in the main window.
- Press the configured hotkey, `Ctrl+Shift+T` by default, to select a screen area and translate it.
- Game mode results are shown in the main overlay window.
- Game mode does not use the near-source overlay.
- The Game mode hotkey can be changed in `Settings`.

### Hotkeys
- `Ctrl+Shift+O`: restore the main window.
- `Ctrl+Shift+S`: stop continuous Screen OCR.
- `Ctrl+Shift+T`: default Game mode capture hotkey, configurable in `Settings`.

## Installation

1. Clone the repository: `git clone https://github.com/Domalega/Subtitle-Translator-Overlay.git`
2. Navigate to the project directory: `cd Subtitle-Translator-Overlay`
3. With Node.js >=24.13.0 installed, install dependencies: `npm ci`
4. Run the application: `npm start`

For a portable Windows executable, run `npm run build`. The output is `dist/Subtitle-Translator-Overlay-0.2.2.exe`. Both build commands run verification first. The current configuration produces an unsigned portable Windows executable.

## Project Structure

- `src/main/`: Electron application and services; entry point: `src/main.js`.
- `src/preload.js`: isolated renderer bridge.
- `src/renderer/`: UI grouped by window; common styles in `shared/`.
- `src/shared/`: reusable OCR, output, settings and utilities.
- `resources/ocr/`: tracked English OCR model, copied into packaged resources.
- `scripts/`: development checks and diagnostic tools.
- `test/`: unit tests, integration checks, UI contracts and fixtures.
- `docs/`: architecture and audit/quality reports.
- `.agent/`: shared agent workflow and ignored local logs/scratch work; `AGENTS.md` is the root entry point.
- `dist/`, `coverage/`, `node_modules/`: generated local files, ignored by Git.
- `.archive/`: local recovery copies of retired code/context, excluded from Git and packaging.

The retired translation window is no longer part of the application.

## Development Commands

- `npm start`: run the Electron app.
- `npm run verify`: run contracts, tests with coverage thresholds, real Electron/OCR smoke checks and syntax checks.
- `npm run test:coverage`: cover all JavaScript under `src/`; open `coverage/index.html` for details.
- `npm run test:ocr`: test offline OCR with synthetic fixtures, production preprocessing and the local language model.
- `node scripts/check-ocr-sample.js "<sample-folder>" "<expected-text>"`: replay a saved local OCR sample; see the [OCR 0.2.2 report](docs/ocr-quality-0.2.2.md). Expected text is optional.
- `npm run check:files`: verify local Electron, HTML script, stylesheet, and package entry file references.
- `npm run build`: build a portable Windows package.
- `npm run dist`: build the configured Windows distribution target.

## Usage

### Continuous Screen OCR
1. Open `Settings`.
2. Click `Select OCR area` and drag over the original English subtitle/text area.
3. Click `Read once` for a single OCR pass, or `Start` for continuous scanning.
4. Click `Stop` to stop continuous scanning.

### Near Original Subtitles
1. Select the OCR area in `Settings`.
2. In `Settings`, select `Near original subtitles` under `Display mode`.
3. Start Screen OCR. A successful translation appears beside the original subtitle without taking mouse input.

### Game Mode Capture
1. Enable `Game mode` in the main window.
2. Press `Ctrl+Shift+T` or your configured hotkey.
3. Drag to select the screen area to translate.
4. The recognized original and translation appear in the main overlay window.

### Dictionary
1. Select a word in the recognized or translated text.
2. Click `Add word`.
3. Open `Dictionary` to search, sort, page through entries, export them, or use `Study`.

## Known Limitations

- OCR works only after an OCR area has been selected.
- The current version is oriented around the primary monitor.
- OCR quality depends on subtitle/text size, color, contrast, and background.
- Game mode currently works through the configured hotkey.
- Live Scan for Game OCR is not currently available in the UI.
- SRT loading exists in code but is not available from the current interface.

## Development

Built with Electron. Main entry point: `src/main.js`.

Read [working rules](AGENTS.md) before contributing and [architecture](docs/architecture.md) for runtime flows. The [stage-1 audit](docs/audit-stage-1.md) and [OCR 0.2.2 report](docs/ocr-quality-0.2.2.md) contain historical validation snapshots; rerun the appropriate checks for later code changes.

For an efficient bug report, provide the action that fails, expected and actual behavior, and a saved sample or error when available. Keep each development stage focused on one observable outcome. Broad requests should be split into reproduction, a focused fix, and validation; see the working rules for how to handle an unworkable scope.
