'use strict';
const fs = require('node:fs'); const path = require('node:path'); const assert = require('node:assert/strict');
const { createWorker } = require('tesseract.js');
const { OcrWorkerService } = require('../../src/main/services/ocr-worker-service');
async function main() {
  const root = fs.realpathSync(path.resolve(__dirname, '../..'));
  let creations = 0;
  const service = new OcrWorkerService({ createWorker: (language, oem, options) => {
    creations++;
    return createWorker(language, oem, { ...options, langPath: root, gzip: false, cacheMethod: 'none' });
  } });
  try {
    const image = fs.readFileSync(path.join(root, 'test/fixtures/subtitle.png'));
    const results = await Promise.all([service.recognize(image), service.recognize(image)]);
    for (const result of results) {
      assert.match(result.data.text, /Hello world[.!]? This is a subtitle[.!]?/i);
      assert.ok(result.data.confidence > 60);
    }
    await assert.rejects(service.recognize(Buffer.from('invalid image')));
    assert.match((await service.recognize(image)).data.text, /Hello world/i);
    assert.equal(creations, 1);
    console.log('Offline Tesseract smoke passed: real image, local model, queued recognition, invalid-image recovery, one worker.');
  } finally { await service.dispose(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
