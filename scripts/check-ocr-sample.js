'use strict';
// Read-only local replay. Images and recognized text are never sent to a service.
const fs = require('node:fs'); const path = require('node:path'); const assert = require('node:assert/strict');
const { PNG } = require('pngjs'); const { createWorker } = require('tesseract.js');
const { prepareSubtitleImage } = require('../src/main/services/subtitle-image-preprocessor');
const { OcrWorkerService } = require('../src/main/services/ocr-worker-service');
const { cleanScreenOcrText } = require('../src/shared/ocr/text-utils');
async function main() {
  if (!process.argv[2]) throw new Error('Usage: node scripts/check-ocr-sample.js <sample-folder> [expected-text]');
  const folder = path.resolve(process.argv[2]);
  const metadata = JSON.parse(fs.readFileSync(path.join(folder, 'metadata.json'), 'utf8'));
  const input = PNG.sync.read(fs.readFileSync(path.join(folder, 'source.png')));
  const started = performance.now(); const prepared = prepareSubtitleImage({ ...input, pixelOrder: 'rgba' });
  const preparationMs = performance.now() - started;
  const service = new OcrWorkerService({ createWorker: (language, oem, options) => createWorker(language, oem, { ...options, langPath: path.resolve(__dirname, '..', 'resources', 'ocr'), gzip:false, cacheMethod:'none' }) });
  try {
    const result = await service.recognize(prepared); const text = cleanScreenOcrText(result.data.text);
    console.log(JSON.stringify({ before: metadata.ocr, after: { text, confidence: result.data.confidence, preparationMs: Math.round(preparationMs) } }, null, 2));
    if (process.argv[3]) assert.equal(text, process.argv[3]);
  } finally { await service.dispose(); }
}
main().catch(error => { console.error(error); process.exitCode=1; });
