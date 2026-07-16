# Subtitle Translator Overlay

Electron desktop overlay for reading English text from a selected screen area with OCR and showing a Russian translation.

## Features

### Screen OCR
- Select an OCR area from `Settings` with `Select OCR area`.
- Use `Find subtitles` to let the app search the current screen for a likely subtitle area, then lock the detected area for OCR.
- Use `Read once` to read the selected area one time.
- Use `Start` / `Stop` to scan the selected area continuously once per second.
- During continuous OCR, the automatic subtitle area can expand to include a second line above or below the locked area, waits for confirmation before weak expansions, clamps growth to the screen, and shrinks back only after the extra line has been absent for a stable delay.
- Shows recognized English text in the left column and Russian translation in the right column.
- OCR translation results are cached locally in the renderer to reduce repeated translation requests.

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
- `Developer mode` shows the selected OCR area, automatic subtitle candidate overlays, OCR stage, metrics, and lets you save diagnostic samples for subtitle detection troubleshooting.

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
3. Install dependencies: `npm install`
4. Run the application: `npm start`

For a portable Windows executable, run `npm run build`. The output is written to `dist/`.

## Development Commands

- `npm start`: run the Electron app.
- `npm run check:files`: verify local Electron, HTML script, stylesheet, and package entry file references.
- `npm run build`: build a portable Windows package.
- `npm run dist`: build the configured Windows distribution target.

## Usage

### Continuous Screen OCR
1. Open `Settings`.
2. Either click `Select OCR area` and drag over the original English subtitle/text area, or click `Find subtitles` to run automatic subtitle area detection on the current screen.
3. Click `Read once` for a single OCR pass, or `Start` for continuous scanning.
4. When automatic detection is used, leave the detected area locked while subtitles play; the app tracks short disappearances and can re-run global search if the area is lost.
5. Click `Stop` to stop continuous scanning.

### Automatic Subtitle Area Detection
1. Open the video or game scene that contains English subtitles.
2. Click `Find subtitles` from the OCR controls.
3. If a candidate is found, start continuous OCR. The app prefers centered subtitle-like text, rejects corner HUD text, sparse noise, icons, and oversized bright regions, and can fall back to a higher-resolution pass for very small subtitles.
4. If no candidate is found, manually select the OCR area and try again when subtitles are visible.

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
- Automatic subtitle detection works best with visible, centered subtitles and may need manual area selection for unusual layouts, stylized fonts, low contrast, or UI text that looks like subtitles.
- Game mode currently works through the configured hotkey.
- Live Scan for Game OCR is not currently available in the UI.
- SRT loading exists in code but is not available from the current interface.

## Development

Built with Electron. Main entry point: `src/main.js`.
