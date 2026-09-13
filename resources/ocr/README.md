# Bundled English OCR model

- File: `eng.traineddata` (local English OCR model; no runtime download).
- Source: official [tesseract-ocr/tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast) repository.
- Repository revision checked on **2026-09-11**: `87416418657359cb625c412a48b6e1d6d41c29bd`.
- [Exact download](https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/87416418657359cb625c412a48b6e1d6d41c29bd/eng.traineddata). The downloaded bytes are included unchanged.
- Size: **4,113,088 bytes**.
- SHA-256: `7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2`.
- Most recent upstream change to this English file: **2017-09-14**, commit `923915d4ced2a7235221788285785a29c4a42d4a`. This is the current official file at the check date, not a model newly trained in 2026.
- License: [Apache-2.0 from the pinned repository](https://github.com/tesseract-ocr/tessdata_fast/blob/87416418657359cb625c412a48b6e1d6d41c29bd/LICENSE), included in [licenses/Apache-2.0.txt](../../licenses/Apache-2.0.txt).
- Engine: integer LSTM model, compatible with the application's OEM 1 mode.

This replaces the previous 5,199,098-byte `4.0.0_best_int` model distributed by naptha/tessdata. The replacement comes directly from the Tesseract project and has no npm metadata ambiguity.

## Local comparison on 2026-09-11

All three checked-in subtitle fixtures were preprocessed by the application's existing pipeline. Each was recognized three times after warming the worker; times below are medians and exclude initialization.

| Fixture | Previous model | Official fast | Exact expected text |
| --- | ---: | ---: | --- |
| subtitle.png | 29 ms | 19 ms | Both: 3/3 runs |
| subtitle-noisy.png | 36 ms | 24 ms | Both: 3/3 runs |
| subtitle-two-lines.png | 37 ms | 25 ms | Both: 3/3 runs |

Official `tessdata_best` at `e12c65a915945e4c28e237a9b52bc4a8f39a0cec` was also tried. In the current Tesseract.js-core 7.0.0 WASM runtime, its first recognition failed with `missing function: _ZN9tesseract13DotProductSSEEPKfS1_i`; it was not selected. This is a compatibility observation for this runtime, not a claim that the upstream model is defective.

These three fixtures establish compatibility and absence of regression on these examples only. They do not establish equal accuracy on arbitrary video or gameplay. Recheck provenance, hash and OCR quality before any future model replacement.
