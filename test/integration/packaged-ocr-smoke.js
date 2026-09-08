'use strict';
// Run with the packaged executable and ELECTRON_RUN_AS_NODE=1.
const fs = require('node:fs'); const path = require('node:path'); const assert = require('node:assert/strict');
async function main() {
  const resources = fs.realpathSync(path.resolve(process.argv[2]));
  const archive = path.join(resources, 'app.asar');
  const { createRequire } = require('node:module');
  const unpacked = path.join(resources, 'app.asar.unpacked');
  const workerRequire = createRequire(path.join(unpacked, 'node_modules/tesseract.js/src/worker-script/node/index.js'));
  for (const dependency of ['regenerator-runtime/runtime', 'is-url', 'bmp-js', 'zlibjs', 'tesseract.js-core', 'wasm-feature-detect']) {
    const relative = path.relative(unpacked, workerRequire.resolve(dependency));
    assert.ok(!relative.startsWith('..') && !path.isAbsolute(relative), 'Worker dependency must ship with the app: ' + dependency);
  }
  const { createWorker } = require(path.join(archive, 'node_modules/tesseract.js'));
  const { OcrWorkerService } = require(path.join(archive, 'src/main/services/ocr-worker-service'));
  const { prepareSubtitleImage } = require(path.join(archive, 'src/main/services/subtitle-image-preprocessor'));
  const { PNG } = require(path.join(archive, 'node_modules/pngjs'));
  assert.ok(fs.existsSync(path.join(resources, 'eng.traineddata')));
  const service = new OcrWorkerService({ createWorker: (language, oem, options) => createWorker(language, oem, { ...options, langPath: resources, workerPath: path.join(resources, 'app.asar.unpacked/node_modules/tesseract.js/src/worker-script/node/index.js'), gzip: false, cacheMethod: 'none' }) });
  try {
    const result = await service.recognize(fs.readFileSync(path.join(__dirname, '../fixtures/subtitle.png')));
    assert.match(result.data.text, /Hello world[.!]? This is a subtitle[.!]?/i);
    for (const [fixture, expected] of [
      ['subtitle-noisy.png', "Okay guys, so we're in Vietnam and"],
      ['subtitle-two-lines.png', "Wait! Don't go. There are 2 doors."]
    ]) {
      const input = PNG.sync.read(fs.readFileSync(path.join(__dirname, '../fixtures', fixture)));
      const recognized = await service.recognize(prepareSubtitleImage({ ...input, pixelOrder: 'rgba' }));
      assert.equal(recognized.data.text.trim().replace(/\s+/g, ' '), expected);
    }
    console.log('Packaged OCR smoke passed: executable, ASAR modules, unpacked worker/WASM and external local model.');
  } finally { await service.dispose(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
