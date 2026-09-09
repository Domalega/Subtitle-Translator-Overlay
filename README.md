# Subtitle Translator Overlay

Electron desktop overlay for reading English text from a selected screen area with OCR and showing a Russian translation.

Current package version: **0.2.2**. OCR uses the bundled English model locally; translation and dictionary context requests require network access.

## Features

### Translate subtitles
- Choose the original English subtitle area directly from the main window, then select **Start translation**.
- The application checks for changed frames every 200 ms and translates accepted text into Russian.
- **Stop translation** pauses scanning. **Change area** replaces the persistent subtitle region.
- **More → Read subtitle area once** performs one read of the saved region.

### Translate any screen area
- Select **Translate an area**, or press the configured shortcut (Ctrl+Shift+T by default).
- No Game mode needs to be enabled. Drag to select text on the primary display; Escape cancels.
- Continuous subtitles pause for a capture. Cancellation restores the previous session; a successful result remains until **Continue subtitles** is selected.
- **Edit original** lets you correct recognized text. **Translate changes** updates the result; **Cancel editing** or Escape restores the previous text.

### Reading and display
- Translation is the main content; **Original · English** expands the source text.
- **Settings → Display** selects **In the window**, **Over the video**, or **In both places**. The full result remains available in the main window even when subtitles are shown over video.
- The video overlay passes mouse clicks through to the underlying application. Its size, opacity and placement have a preview in Display settings.
- Long results scroll in the main window. Overlay line limits may truncate the on-video presentation.
- The capture shortcut is shown only in Translation settings. The bottom translation status is visible only when developer mode is enabled; actionable errors remain visible.
- The main window has minimize and quit controls. Drag the title bar or resize the window normally; size is saved. **More → Restore window size** restores size and position.

### Dictionary
- Select text in the result and choose **Add selected word**. Selecting text pauses an active subtitle session so the selection stays stable.
- **More → Dictionary** opens search, sorting, pronunciation, context examples, deletion and export to CSV or JSON.
- Pages contain up to 20 entries and scroll to accommodate long words or translations.
- **More → Review words** offers one pass through all saved words, with a progress indicator and completion state.

### Settings and appearance
- Settings are grouped into Translation, Display, Appearance, Dictionary and Advanced.
- Exactly two built-in themes are available: **Dark** and **Light**. Older themes migrate to one of these; no Nothing themes remain selectable or styled.
- The interface ships in English only. English messages live in a separate catalog with a locale registration and fallback mechanism for future translations.
- Theme definitions use a shared semantic token registry, allowing future themes without changes to individual window layouts. A custom-theme editor is not included.
- **Advanced** contains diagnostics and a confirmed settings reset. Reset preserves the dictionary and subtitle area.
- See [UI architecture](docs/ui-design.md) for extension points and interaction rules.

### Hotkeys
- **Ctrl+Shift+O**: restore the main window.
- **Ctrl+Shift+S**: stop continuous subtitle translation.
- **Ctrl+Shift+T**: translate an area, configurable by pressing a new combination in **Settings → Translation**.

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

## Windows CI

[Windows CI](.github/workflows/windows-ci.yml) runs on GitHub Actions for pushes, pull requests and manual dispatches, using Windows Server 2025 x64 and Node.js 24.18.0.

It installs locked dependencies with `npm ci`, then runs `npm run build -- --publish never`. The build's `prebuild` hook runs the complete `verify` suite once, including coverage thresholds, Electron UI and offline OCR smoke tests. A separate smoke test uses the packaged executable to check the shipped OCR modules, worker, WASM and language model.

The run uploads `windows-coverage` (also after a later failure when coverage exists) and, after successful checks, `windows-portable`. Artifacts are retained for 14 days; no GitHub release is published. Live playback and physical monitor/DPI behavior still need manual testing.

## Usage

1. Launch with `npm start` or `Start Subtitle Overlay.cmd`.
2. Select **Choose subtitle area**, then drag around the original English subtitles.
3. Select **Start translation**. Choose **Translate an area** whenever you need a one-off result.
4. Adjust **Settings → Display** to place subtitles over the video; use **Appearance** for Light or Dark.
5. Use **Stop translation** to stop scanning and the title-bar quit button to close the application.

## Known Limitations

- OCR works only after an OCR area has been selected.
- The current version is oriented around the primary monitor.
- OCR quality depends on subtitle/text size, color, contrast, and background.
- UI changes have automated Electron coverage; real game/video playback and physical Windows DPI behavior still require manual acceptance.
- SRT loading exists in code but is not available from the current interface.

## Development

Built with Electron. Main entry point: `src/main.js`.

Read [working rules](AGENTS.md) before contributing and [architecture](docs/architecture.md) for runtime flows. The [stage-1 audit](docs/audit-stage-1.md) and [OCR 0.2.2 report](docs/ocr-quality-0.2.2.md) contain historical validation snapshots; rerun the appropriate checks for later code changes.

For an efficient bug report, provide the action that fails, expected and actual behavior, and a saved sample or error when available. Keep each development stage focused on one observable outcome. Broad requests should be split into reproduction, a focused fix, and validation; see the working rules for how to handle an unworkable scope.
