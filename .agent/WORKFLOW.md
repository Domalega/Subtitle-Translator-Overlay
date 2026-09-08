# Working rules

## Purpose and scope

Help build and improve Subtitle Translator Overlay: an Electron application that reads English screen text and displays Russian translations. Deliver working, reviewable improvements with the smallest maintainable change.

- Treat requests to fix or implement something as authorization to do that work, including necessary checks. Do not stop at a plan when execution is feasible.
- Read the relevant documentation and implementation before editing. Use `package.json` for current commands and runtime requirements; dated reports describe historical evidence, not the current verification state.
- Inspect the working tree and preserve existing user changes. Do not revert, delete, commit or publish unrelated work.
- Keep current limitations explicit: primary-monitor orientation, sample-dependent OCR quality, and manual acceptance for live playback and OS behavior.

## Request feasibility and staged prompts

- Before substantial work, identify the concrete outcome, available reproduction/input, affected area and acceptance check.
- Execute bounded requests directly. Resolve routine implementation choices independently; ask only for missing information that materially blocks the result.
- If a request cannot be completed effectively as written (for example, "fix every possible bug", several independent feature changes, or an accuracy guarantee without samples), explain the specific obstacle briefly and decline that scope as written. Do not reject a task merely because it is difficult or large.
- Offer a simpler sequence of copy-ready prompts. Each stage must name one outcome, its scope/input, a verification method and a stopping point. Prefer reproduction/diagnosis, a focused correction, then integration or packaging when needed.
- Continue useful work already authorized and independent of the missing decision. Do not silently replace the requested goal, expand its scope or claim completion after only planning.
- For OCR defects, start with a saved sample and expected text. Separate capture/preprocessing, recognition, stabilization and translation before choosing a correction.

## Token and execution economy

- Use the current conversation, completed checks and existing artifacts; do not repeat discovery after a continuation.
- Start from the supplied reproduction or saved diagnostic sample. Fix the demonstrated cause; avoid speculative refactors and unrelated features.
- Read targeted sections and batch independent reads. Limit command output to relevant matches, summaries and error tails.
- Prefer existing dependencies and official documentation for a specific unresolved question. Avoid broad browsing and delegate only when explicitly requested or required by applicable instructions.
- Reuse a verified build only when its source, dependencies and runtime metadata match. Avoid duplicate builds and frequent unchanged status polls.
- Keep progress updates and the final response concise: outcome, validation, artifact if any, and actual remaining limitations. Distinguish checks run now from historical results.
- Economy must not hide failures, weaken assertions, skip required checks or leave authorized work unfinished.

## Verification and delivery

- While changing code, run focused checks for the affected behavior. Before delivery, run `npm run verify` once for the final source state; repeat only checks affected by later edits.
- For documentation-only edits, verify local links, documented commands/paths against the repository, and `git diff --check`; an unchanged application does not need a rebuild or full runtime suite.
- `npm run build` and `npm run dist` already run verification through lifecycle hooks. Plan the final verification around that instead of running the same suite twice.
- Packaging-only changes need packaging checks, including the packaged OCR smoke test when OCR resources or runtime dependencies change. Source OCR success alone does not validate a shipped executable.
- Do not present smoke tests or synthetic fixtures as proof of gameplay, translation-service availability, or physical multi-monitor/DPI acceptance.
- Update affected documentation with behavior changes. Keep audit measurements as dated snapshots; do not replace them with unmeasured numbers.

## Documentation map

- [README](../README.md): setup, features, commands and limitations.
- [Architecture](../docs/architecture.md): process boundaries and runtime flows.
- [Stage-1 audit](../docs/audit-stage-1.md): historical correctness and test audit.
- [OCR 0.2.2 report](../docs/ocr-quality-0.2.2.md): demonstrated sample defect, correction and validation boundaries.
- [OCR fixtures](../test/fixtures/README.md): synthetic inputs and expected recognition.
