# Stage 1: correctness and test audit

Date: 2026-09-08. Scope: existing application logic, tests, recovery, data integrity and packaging. No stage-2 features were added.

> Historical snapshot of the stage-1 / 0.2.1 work. Counts, dependency audit results and artifact paths below describe that run, not a fresh verification of the current tree. The subsequent [0.2.2 OCR correction](ocr-quality-0.2.2.md) records later changes. Generated logs and executables may not exist in a fresh checkout.

## Baseline and result

The baseline passed 141 unit tests and a three-window UI smoke test despite the defects below. Its 96.98% line coverage counted only loaded modules and omitted the main process and renderers, so it was not whole-application coverage.

The stage-1 final full verification passed **209 tests**, with zero failures, skipped tests or cancellations. Coverage now includes **every JavaScript source file under src/**, including the main process and renderers:

| Metric | Covered / total | Coverage |
| --- | --- | --- |
| Lines | 4,287 / 4,659 | 92.01% |
| Branches | 1,532 / 1,957 | 78.28% |
| Functions | 337 / 372 | 90.59% |

The runner enforces floors of 90% lines, 75% branches and 85% functions. Reports are generated in coverage/index.html and coverage/coverage-summary.json. Coverage comes from unit/DOM/VM tests; the separate real Electron and real OCR checks provide additional integration evidence.

## Confirmed defects and corrections

| Area | Defect and correction | Regression evidence |
| --- | --- | --- |
| JSON persistence | Concurrent dictionary/settings updates could overwrite each other. Serialize entire read-modify-write transactions, write an exclusive temporary file, sync and rename it; retain corrupted source data and recover the queue after failure. Fix dictionary deduplication for untranslated entries. | Store/IPC failure cases and simultaneous dictionary additions, including real Electron IPC. |
| Worker lifecycle | Initialization, recognition or disposal could hang, overlap or let late workers/results survive cancellation. Bound operations, serialize jobs, retire late workers once and recover after rejection. Handle Tesseract worker errors instead of throwing on the main event loop. | Timeout, creation/disposal race, cancellation and retry tests; real OCR invalid-image recovery. |
| OCR scheduling | New queued frames could starve recognition output; stop/start and area changes could reuse stale work. Track generations and area revisions through capture and recognition; consume the newest queued work without discarding every completion. Manual Read once forces capture. | Coordinator and main-process lifecycle tests. |
| Coordinates and detection | Automatic area stabilization mixed physical pixels and DIP; display changes retained stale areas; downscaling lost bright samples; expanded areas could shrink while the extra subtitle line remained. Keep coordinate spaces separate, invalidate display-dependent work, preserve bright pixels and check the original base area before shrinking. | Synthetic bitmap, DPI, area adaptation and detector regressions. |
| Subtitle semantics | Cleanup removed legitimate short words and leading numbers; similarity could hide negation, numbers, word-order changes or growing subtitles. Preserve meaningful text and classify growth before similarity. | Text/stabilization tests, including short low-confidence rejection. |
| Translation | Timeouts did not cover stalled bodies, ignored aborts could hang and cached responses could bypass scope cancellation. Bound the whole request, cancel superseded scopes before cache lookup, reject invalid/empty responses and retry failed subtitles. | Mocked fetch/body timeout, pre-abort, cache, scope and recovery tests. |
| Output routing | Hidden overlays could reappear after delayed load/settings updates, or replay a translation with the wrong source. Track explicit visibility and pair each translation with its source; invalidate old requests as candidates change. | Router, overlay and renderer interaction tests. |
| Game capture and hotkeys | Capture scaling/source matching and late results could be wrong; failed hotkey registration could discard the previous binding. Match display IDs and actual image dimensions, reject stale mode results, surface failures and preserve the old shortcut on registration/save failure. | Main IPC/lifecycle tests and real window mode checks. |
| Renderer safety/recovery | Dictionary context HTML could be interpreted as markup; delayed responses and animated deletion targeted stale UI. Render remote text as text nodes, guard request generations and capture deletion targets; handle rejected settings/export/clipboard calls and unavailable localStorage. | JSDOM tests executing the actual renderer scripts. |
| IPC and navigation | Bridge events exposed Electron event objects; handlers did not centrally enforce a trusted source. Subscriptions now return unsubscribe functions and strip events; handlers validate owned windows, top frames and local renderer files. Block renderer navigation and popups. | Preload/IPC contract and untrusted-sender tests. |
| Legacy SRT | Invalid timestamps, overlapping timing, paused clocks and delayed translations could produce wrong playback. Validate/sort cues, use end-exclusive bounds, preserve paused timing and discard stale translations. | Legacy renderer/SRT tests; feature remains hidden in the current UI. |
| Diagnostics | Asynchronous sample writes could observe later mutable state. Snapshot input and only clean up owned temporary files. | Diagnostic persistence tests. |
| Packaged offline OCR | Source-mode OCR passed while the packaged app failed to resolve WASM inside ASAR. Package the language model as an external resource and explicitly load the unpacked worker. | Real packaged executable OCR check using its ASAR modules, unpacked worker/WASM and local model. |

## Test audit and tooling

- Added tests of the actual main-process handlers and renderer scripts, rather than only isolated shared helpers. Main-process tests mock Electron/hardware; renderer tests use JSDOM.
- Strengthened misleading existing tests: outline scoring now compares both generated frames, uniform-image validation tests actual uniform pixels, and short-word tests use the stated glyph counts and realistic crop widths.
- Preserved protected HTML/CSS contracts. Replaced the settings/dictionary JavaScript hash restriction with behavioral coverage so fixes do not require freezing defective logic.
- Moved real-window smoke checks out of production app.js. Use an isolated temporary Electron profile, enforce a timeout and fail on signal/null exits. Tests do not read the user's dictionary or capture the user's screen.
- Added a synthetic subtitle image and real offline Tesseract tests for queued work, worker reuse and recovery after invalid input. The invalid-image test intentionally prints Leptonica decoding errors before successful recovery.
- Both build and dist run verify first. JavaScript syntax checks target source, scripts and tests rather than generated/backup files. Resolve the Windows junction to its physical path before collecting coverage.

## Dependencies

Electron: 31.7.7 → 44.2.0. electron-builder: 24.13.3 → 26.15.3. Tesseract.js: 5.1.1 → 7.0.0. Added exact c8 and JSDOM development versions. Development requires Node >=24.13.0.

The baseline npm audit reported 13 findings (1 critical, 11 high, 1 moderate). The final installed dependency audit reports zero known findings. This is the registry audit result, not a guarantee against all security defects. Tesseract 7 also removes completed job callbacks retained by the old worker implementation.

## Verification

- npm run verify: passed, including file/UI contracts, 209 tests with coverage thresholds, actual Electron window smoke checks, actual offline OCR and syntax checks for 80 JavaScript files.
- npm audit: zero findings.
- Windows portable packaging: passed with Electron 44.2.0 and Tesseract 7.0.0. The separate packaged OCR check passed using the generated executable, ASAR modules, unpacked worker/WASM and external local English model.
- git diff --check: passed; Git may emit its existing LF/CRLF warning for .gitignore.

Build logs and the full verification log are in coverage/. The portable artifact is dist/audit-stage-1/Subtitle-Translator-Overlay-0.2.1.exe. Code signing is disabled by the existing build configuration; the default Electron icon remains.

For current commands and verification policy, see the [README](../README.md) and [working rules](../AGENTS.md).

## Boundaries and remaining validation

Coverage is deliberately reported as measured, not as 100%: 372 source lines and 425 branches are not covered by the automated suite. Remaining gaps include legacy/error paths and OS-dependent transitions. Real UI/OCR smoke checks supplement mocks but do not replace extended gameplay testing, arbitrary fonts/backgrounds, live translation-service availability, or physical multi-monitor/DPI testing. The app remains oriented around the primary monitor.

No concrete intermittent-error log or exact reproduction was supplied. The audit fixes the defects reproduced in code/tests; it cannot certify that every possible user-environment failure is eliminated. The portable launcher itself still needs an interactive user acceptance run; the packaged OCR check exercises the generated unpacked executable runtime and its resources.

Pre-existing changes to .gitattributes, .gitignore, LICENSE, Start Subtitle Overlay.cmd and the deleted AGENT.md were preserved. Only a coverage-directory ignore was added to .gitignore. An optional removal of unused helper functions was rejected by automatic approval review as too broad a deletion; those functions were retained. No commit, publication or stage-2 development was performed.
