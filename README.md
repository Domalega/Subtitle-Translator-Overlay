# Subtitle Translator Overlay

An Electron desktop overlay application that displays Russian translations for English subtitles (via Screen OCR) and features an experimental Screen OCR mode for on-screen subtitle translation.

## Features

-   **Transparent Overlay**: Always-on-top window for seamless integration with video playback.
-   **Screen OCR**: Translate on-screen English subtitles without an `.srt` file.
    -   Select OCR area for precise text capture.
-   **Dictionary**: Add words from subtitles to a personal dictionary.
    -   Word deletion, search, study mode (flashcards), and export (CSV/JSON).
-   **Focus Mode**: Minimal interface showing only subtitles and essential controls.
-   **Settings**: Customize theme, font scale, window size.
-   **Global Shortcuts**:
    -   `Ctrl+Shift+O`: Restore main window.
    -   `Ctrl+Shift+S`: Stop OCR.
-   **Modern UI/UX**: Unified design, reduced transparency, backdrop blur effects, and smooth animations.

## Installation

1.  **Clone the repository**: `git clone https://github.com/Domalega/Subtitle-Translator-Overlay.git`
2.  **Navigate to the project directory**: `cd Subtitle-Translator-Overlay`
3.  **Install dependencies**: `npm install`
4.  **Run the application**: `npm start`

Alternatively, for a portable Windows `.exe`, run `npm run build`. The executable will be in the `dist/` folder.

## Usage

### With Screen OCR

1.  Enable English subtitles in your video player.
2.  Click `Select OCR area` and drag to select the region containing the subtitles.
3.  Position the app window so it doesn't cover the selected OCR area.
4.  Click `Start` (or `Read once` for a single capture) to begin OCR.
5.  In automatic mode, OCR scans the screen approximately every 3 seconds to minimize system load.

**Note**: OCR relies on visual filtering. Do not place the app window over the selected OCR area, as it will be included in the capture.

## Development

Built with Electron. Main entry point: `src/main.js`.
