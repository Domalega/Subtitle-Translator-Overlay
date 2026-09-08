# OCR quality correction: 0.2.2

This is a historical correction report for version 0.2.2, dated 2026-09-08. Measurements below belong to that run and are not guarantees for later changes.

The saved 2026-09-08 YouTube sample exposed an image preparation defect: the brightness threshold admitted background scenery, which Tesseract read as extra characters. The captured caption was intact; its recognized text was contaminated before translation.

Screen OCR now labels connected components, retains aligned glyphs and nearby punctuation, removes unrelated background blobs and normalizes letter height. It supplies dark text on white with a border. Inconclusive geometry retains the original thresholded pixels, and the change adds no second OCR pass or translation request. Preparation took about 24 ms on the saved 1327 x 176 crop in this environment; this is a single local measurement, not an FPS guarantee.

Local sample replay now returns exactly "Okay guys, so we're in Vietnam and" instead of "Okay guys, so we're in Vietnam and Y &". Tesseract confidence changed from 70 to 95; confidence is an engine score, not a percentage accuracy measurement. The source PNG stays in the user's profile and is not included in the repository. Synthetic noisy and two-line yellow captions cover the defect without publishing the actual screenshot.

Regression checks cover background rejection, trailing punctuation, apostrophes/dots, two lines, yellow BGRA/RGBA pixels, blank/transparent images, isolated characters and font resizing. Real OCR checks assert the complete expected sentences after preprocessing, including negation and numbers. Packaged OCR checks exercise the same preprocessing from ASAR.

Replay another local diagnostic without network requests:

```powershell
node scripts/check-ocr-sample.js "<sample-folder>" "<expected-text>"
```

Run from the repository root after `npm ci`. The folder must contain `source.png` and `metadata.json` from a saved diagnostic. Expected text is optional; when supplied, a mismatch exits with an error. Output includes the previous OCR metadata, new text, confidence and preparation time. It can contain private screen text: review it before sharing. The replay does not modify the sample.

This addresses the demonstrated upstream recognition error. It does not establish translation quality on all videos or games; the translation provider and timing/stabilization policy are unchanged. Testing live playback after installing this build remains necessary.

The choices follow Tesseract's guidance on noise removal, polarity, borders and resizing: [improving image quality](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html). Component thresholds and the normalization target are application heuristics validated on these samples, not universal OCR guarantees.

Validation: npm run verify passed with 216 tests, 92.12% line coverage, 79.21% branch coverage, real Electron window checks and real offline OCR. The packaging regression now also asserts that worker dependencies resolve inside the shipped unpacked resources; all runtime node_modules are explicitly unpacked so the worker cannot depend on modules from a developer checkout.

See [fixture expectations](../test/fixtures/README.md), [architecture](architecture.md) and [verification policy](../AGENTS.md). Packaged OCR is a separate check from `npm run verify`; the existence of that regression script alone is not evidence that a newly built package passed it.
