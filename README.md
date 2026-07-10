# Subtitle Translator Overlay

Electron desktop overlay for reading English text from a selected screen area with OCR and showing a Russian translation in the main overlay window.

## Features

### Screen OCR
- Select an OCR area from `Settings` with `Select OCR area`.
- Use `Read once` to read the selected area one time.
- Use `Start` / `Stop` to scan the selected area continuously once per second.
- Shows recognized English text in the left column and Russian translation in the right column.
- OCR translation results are cached locally in the renderer to reduce repeated translation requests.

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

### Game Mode
- Enable `Game mode` in the main window.
- Press the configured hotkey, `Ctrl+Shift+T` by default, to select a screen area and translate it.
- Game mode results are shown in the main overlay window.
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
2. Click `Select OCR area` and drag over the original English subtitle/text area.
3. Click `Read once` for a single OCR pass, or `Start` for continuous scanning.
4. Click `Stop` to stop continuous scanning.

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
