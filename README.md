# Subtitle Translator Overlay

An Electron desktop overlay application that provides two primary modes for language learning and subtitle translation: a **Subtitle Mode** for movie/series subtitles and a **Screen Translation Mode** for in-game or general screen text.

## Features

### General
-   **Transparent Overlay**: Always-on-top window for seamless integration.
-   **Modern UI/UX**: Unified design, reduced transparency, backdrop blur effects, and smooth animations.
-   **Dictionary**: Add words from subtitles/screen to a personal dictionary.
    -   Word deletion, search, study mode (flashcards), and export (CSV/JSON).

### Subtitle Mode (for movies/series)
-   Loads English `.srt` files and displays Russian translations.
-   Screen OCR option for reading English subtitles directly from the screen without an `.srt` file.
    -   Select OCR area for precise text capture.
-   Adjust subtitle offset for synchronization.

### Screen Translation Mode (for games/general screen text)
-   **Hotkey-triggered Capture**: Press `Ctrl+Shift+T` (customizable hotkey) to capture a selected screen area.
-   **OCR & Translate**: Performs OCR on the selected area, groups text into logical blocks, and translates the entire block.
-   **Translation Window**: Displays original English text, Russian translation, and a list of recognized words for easy dictionary addition.
    -   Editable original text with a "Retranslate" option.
    -   Copy original/translation to clipboard.
-   **Experimental Live Scan**: An optional, experimental live OCR mode (off by default) can continuously scan and translate the screen.

### Settings
-   **Appearance**: Customize `Theme`, `Font`, and `Text Size`.
-   **Overlay Size**: Adjust `Window Width` and `Window Height`.
-   **Game OCR**: Configure `Mode` (Hotkey only / Live scan), `Live scan interval`, `Hotkey` for capture, `Overlay width`, `Overlay font size`, and `Overlay opacity`.
-   **Dictionary**: `Confirm before deleting words` toggle.
-   **Context**: `Context examples count` (1-10).
-   **Persistence**: All settings are saved and persist across restarts.
-   **Reset to Defaults**: Button to restore all settings.

### Hotkeys
-   `Ctrl+Shift+O`: Restore main window.
-   `Ctrl+Shift+S`: Stop OCR (in Subtitle Mode).
-   `Ctrl+Shift+T` (default): Trigger screen capture and translation (customizable in settings).

## Installation

1.  **Clone the repository**: `git clone https://github.com/Domalega/Subtitle-Translator-Overlay.git`
2.  **Navigate to the project directory**: `cd Subtitle-Translator-Overlay`
3.  **Install dependencies**: `npm install`
4.  **Run the application**: `npm start`

For a portable Windows `.exe`, run `npm run build`. The executable will be in the `dist/` folder.

## Usage

### Subtitle Mode
1.  Open your video player and enable English subtitles.
2.  In the app, click `Open SRT` and select your English `.srt` file.
3.  Start your video and click `Start` in the app when subtitles begin.
4.  Use the `Offset` field or `-5s`, `+5s` buttons to synchronize.

### Screen Translation Mode
1.  Enable "Game mode" in the main window.
2.  Press `Ctrl+Shift+T` (or your custom hotkey).
3.  Drag to select the area on the screen you want to translate.
4.  A translation window will appear with the captured text and its translation.

**Note**: OCR relies on visual filtering. Ensure the selected area is clear for optimal results.

## Limitations
- Only primary display is currently supported for screen capture.
- Live scan is experimental and may impact performance.

## Development

Built with Electron. Main entry point: `src/main.js`.
