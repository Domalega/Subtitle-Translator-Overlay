# UI design and extension points

The interface is English-only and ships exactly two themes: Dark and Light. This document describes the redesigned source, not a claim of live video/game acceptance.

## Interaction model

The main window offers continuous subtitle translation and a one-shot area capture. There are no Focus mode or Game mode switches.

| Action | Behavior |
| --- | --- |
| First run | Choose a subtitle area, then start translation; one-shot capture is immediately available. |
| One-shot capture during subtitles | Stop the current OCR generation and keep a snapshot of text and running state. |
| Cancel capture | Restore the snapshot and resume only if subtitles were running. |
| Capture succeeds | Keep the manual result until the user explicitly continues subtitles. |
| Capture fails or finds no text | Keep the previous result, explain the problem, and allow a new capture. |
| Edit original | Pause updating, retain the original result, and reject late manual responses after cancellation or further edits. |
| Cancel editing | Restore the previous text and previous running state. |
| Select a word | Pause running subtitles before the next update can replace the selection. |
| Stop hotkey | Stop subtitles and clear any pending automatic-resume intention. |

A controller output is always retained in the main window. Over-video output is a separate click-through presentation with independent line and size limits. The capture shortcut is shown only in Translation settings. The bottom translation status appears only with developer mode enabled; the footer collapses when it has no visible content. dictionary/edit errors use a separate feedback area so OCR progress cannot erase them.

## Shared appearance

- [Theme definitions](../src/shared/settings/themes.js): registry, versioned definitions, legacy identifier migration, token validation and fallback.
- [Shared components](../src/renderer/shared/ui.css): buttons, fields, menus, dialogs, typography and focus states.
- [Window helpers](../src/renderer/shared/ui.js): initial appearance, shared font application, menu dismissal and modal focus handling.
- Window styles describe layout; they do not contain per-theme selectors.

Each theme has an `id`, `name`, optional localized `labelKey`, `base`, `version` and `tokens`. Components consume semantic CSS variables such as `--surface`, `--text`, `--muted`, `--accent` and `--focus`. The overlay has its own `overlayBackground` and `overlayText` tokens; both built-ins intentionally keep subtitles white on a dark background for video readability.

To add a future built-in theme, add its definition to the registry and optionally its label to the English catalog. The settings picker reads the registry. Component HTML and event handlers need no theme-specific changes. Missing or invalid token values fall back to the selected base palette; unsupported token names are ignored. The current schema only accepts six-digit hex colors, never arbitrary CSS or JavaScript. Expanding token types should use explicit validation and a schema version migration.

A future custom-theme editor can persist validated definitions in a separate store and register them before settings normalization. File import, editing and custom-theme persistence are intentionally not implemented. Existing Nothing light identifiers migrate to Light; all other removed/unknown identifiers fall back to Dark. Migration does not keep the old theme styles or options.

## Future interface languages

- [English catalog](../src/shared/ui/locales/en.js): English labels and messages.
- [Localization runtime](../src/shared/ui/i18n.js): locale registration, named interpolation, fallback and static DOM application.
- [Static binding](../src/renderer/shared/localize.js): the shipped interface selects English.

Static UI text uses `data-i18n`; accessible names, hints and titles use the corresponding attribute bindings. Dynamic text uses `I18n.t(key, parameters)`. Translation results and dictionary contents are user data and must never be translated by the interface localization layer. Detailed OCR diagnostics and raw service errors are technical runtime data; a future language should localize their user-facing summaries, not mutate the underlying measurements or remote text.

To add a language, supply a separate catalog, load it before window initialization, call `registerLocale`, and select it through a validated setting. Missing keys fall back to English. `registerLocale` accepts known message keys and string values only; DOM insertion uses text content. A language picker, plural rules and right-to-left layouts remain future features with their own tests. UI language is independent of the English-to-Russian translation direction.

## Settings and dictionary

Settings sections remain accessible from a persistent navigation row. Slider movement previews locally and saves on completion. Failed writes restore persisted values and show a persistent error. Shortcut capture checks registration before changing the active value. Reset waits for pending saves, registers the default shortcut and writes one settings transaction; write failure restores the former shortcut. Reset retains the dictionary and selected subtitle area.

The dictionary uses fixed pages of 20 entries with scrollable variable-height rows. Review is a single pass with reveal, next, progress and completion; it makes no spaced-repetition claims. Export errors stay inside the export dialog. Dialogs isolate the background, trap Tab, dismiss with Escape and restore focus.

## Verification

Run `npm run verify` for the final source state. Behavioral coverage includes cancellation, stale results, retry, saved settings, theme migration, locale fallback, dialog focus and dictionary pagination. Real Electron tests render both themes and small windows, exercise persistence and cancellation, and save disposable previews to `.agent/tmp/ui-preview/`.

Visual baseline hashes in `test/contracts/protected-ui-files.json` now refer to the approved redesign. When intentional UI changes occur, update the baseline together with behavioral and rendering checks; do not bypass the checks.

Manual acceptance still needs a real video and game on the primary display, including actual screen capture, translation network availability, click-through, keyboard shortcuts, and physical Windows DPI scaling. Offscreen screenshots and synthetic OCR fixtures do not establish those behaviors.
