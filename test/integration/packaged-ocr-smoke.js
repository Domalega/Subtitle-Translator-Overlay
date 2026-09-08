'use strict';
// Run with the packaged executable and ELECTRON_RUN_AS_NODE=1.
const fs = require('node:fs'); const path = require('node:path'); const assert = require('node:assert/strict');
async function main() {
  const resources = path.resolve(process.argv[2]);
  const archive = path.join(resources, 'app.asar');
  const { createWorker } = require(path.join(archive, 'node_modules/tesseract.js'));
  const { OcrWorkerService } = require(path.join(archive, 'src/main/services/ocr-worker-service'));
  assert.ok(fs.existsSync(path.join(resources, 'eng.traineddata')));
  const service = new OcrWorkerService({ createWorker: (language, oem, options) => createWorker(language, oem, { ...options, langPath: resources, workerPath: path.join(resources, 'app.asar.unpacked/node_modules/tesseract.js/src/worker-script/node/index.js'), gzip: false, cacheMethod: 'none' }) });
  try {
    const result = await service.recognize(fs.readFileSync(path.join(__dirname, '../fixtures/subtitle.png')));
    assert.match(result.data.text, /Hello world[.!]? This is a subtitle[.!]?/i);
    console.log('Packaged OCR smoke passed: executable, ASAR modules, unpacked worker/WASM and external local model.');
  } finally { await service.dispose(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
