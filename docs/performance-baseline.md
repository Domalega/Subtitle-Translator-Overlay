# OCR performance baseline — 2026-09-13

Run `node scripts/benchmark-ocr.js` for the three repository fixtures, or `node scripts/benchmark-ocr.js "path/to/source.png"` for a saved diagnostic crop. The tool is offline and does not upload images or translations. It initializes one worker, warms up each image once, then measures five sequential repetitions. Fixture runs also assert the expected text on every repetition.

Machine: Ryzen 7 7800X3D; Node v24.18.0. Times are milliseconds. These are a current baseline, not a before/after speedup claim.

| Sample | Preparation median | OCR median | OCR maximum | Confidence |
| --- | ---: | ---: | ---: | ---: |
| subtitle.png | 2.5 | 17.5 | 19.1 | 96 |
| subtitle-noisy.png | 6.3 | 22.9 | 23.8 | 95 |
| subtitle-two-lines.png | 5.1 | 24.5 | 26 | 94 |
| Saved real crop, 1327 × 176 | 6.3 | 23.3 | 23.9 | 95 |

The real crop was the existing 2026-09-08 diagnostic image. Its text was recognized as expected. The report also emits worker initialization time, process CPU time summed over five iterations, and process RSS. CPU time is not a percentage; RSS is not whole-application memory. Fixture worker initialization took 343.3 ms in this run. Five repetitions establish a small baseline, not a statistical performance guarantee.

## Live playback still pending

Requested example: [YouTube, starting at 43 seconds](https://www.youtube.com/watch?v=DZP5ZL-JxSQ&t=43s). The in-app browser failed with ERR_NAME_NOT_RESOLVED; Windows browser automation stopped because it could not reliably establish the active URL. No live capture/translation latency or playback CPU result was collected. Network and VPN settings were not changed.

For acceptance, play the same fragment with English subtitles, record screen resolution/DPI and OCR area, and measure capture, preprocessing, OCR, network translation and displayed-result latency separately. Compare a paused frame and continuous playback; record CPU/memory and missed or duplicated subtitles. Use existing Developer diagnostics and OCR_DEBUG logging. Do not infer end-to-end latency from this offline benchmark or tune polling thresholds from these measurements alone.
