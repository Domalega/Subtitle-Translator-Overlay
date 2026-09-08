# OCR fixtures

These PNGs are synthetic text drawn locally with System.Drawing, not captures of user screens or YouTube videos.

| File | Purpose | Expected text after preprocessing |
| --- | --- | --- |
| `subtitle.png` | Basic white caption and worker smoke checks | `Hello world. This is a subtitle.` |
| `subtitle-noisy.png` | Bright background blobs next to a white caption | `Okay guys, so we're in Vietnam and` |
| `subtitle-two-lines.png` | Two yellow lines, punctuation, negation and a digit | `Wait! Don't go. There are 2 doors.` |

Run `npm run test:ocr` from the repository root after `npm ci`. The offline smoke test checks recognized sentences after production preprocessing using the bundled English model. It also checks worker reuse and recovery from invalid image input; decoding errors in that deliberate failure case are expected if the overall check passes.

The separate `test/integration/packaged-ocr-smoke.js` checks the packaged runtime and resources. Synthetic results do not establish accuracy on arbitrary gameplay or video backgrounds.

When adding a regression, keep the fixture synthetic when possible, state the exact expected text, and add an assertion in the relevant test. Do not weaken existing expected text merely to accommodate a regression. Local private captures can be replayed using the [sample diagnostic command](../../docs/ocr-quality-0.2.2.md) without adding them to Git.
