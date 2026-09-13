'use strict';
// Offline baseline: excludes desktop capture, browser playback and network translation.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { PNG } = require('pngjs');
const { createWorker } = require('tesseract.js');
const { prepareSubtitleImage } = require('../src/main/services/subtitle-image-preprocessor');
const { OcrWorkerService } = require('../src/main/services/ocr-worker-service');
const root = fs.realpathSync(path.resolve(__dirname, '..'));
const fixtures = [
  ['subtitle.png', 'Hello world. This is a subtitle.'],
  ['subtitle-noisy.png', "Okay guys, so we're in Vietnam and"],
  ['subtitle-two-lines.png', "Wait! Don't go. There are 2 doors."]
];
const rounded = n => Math.round(n * 10) / 10;
const percentile = (values, p) => [...values].sort((a,b) => a-b)[Math.ceil(values.length * p) - 1];
async function main() {
  const service = new OcrWorkerService({ createWorker: (language, oem, options) => createWorker(language, oem, {
    ...options, langPath: path.join(root, 'resources/ocr'), gzip: false, cacheMethod: 'none'
  }) });
  const report = { measuredAt: new Date().toISOString(), node: process.version, cpu: os.cpus()[0].model, iterations: 5, scope: 'Offline images; no desktop capture or network translation', samples: [] };
  try {
    const init = performance.now(); await service.initialize(); report.workerInitMs = rounded(performance.now() - init);
    const inputs = process.argv[2] ? [[path.resolve(process.argv[2]), null]] : fixtures.map(([name, expected]) => [path.join(root, 'test/fixtures', name), expected]);
    for (const [file, expected] of inputs) {
      const input = PNG.sync.read(fs.readFileSync(file));
      // Warm up once per image, outside the reported measurements.
      await service.recognize(prepareSubtitleImage({ ...input, pixelOrder: 'rgba' }));
      const preparations = [], recognitions = []; let text, confidence;
      const cpuStart = process.cpuUsage();
      for (let i = 0; i < report.iterations; i++) {
        const start = performance.now(); const prepared = prepareSubtitleImage({ ...input, pixelOrder: 'rgba' });
        preparations.push(performance.now() - start);
        const ocrStart = performance.now(); const result = await service.recognize(prepared);
        recognitions.push(performance.now() - ocrStart);
        text = result.data.text.trim().replace(/\s+/g, ' '); confidence = result.data.confidence;
        if (expected) assert.equal(text, expected, path.basename(file));
      }
      const cpu = process.cpuUsage(cpuStart);
      report.samples.push({ sample: path.basename(file), width: input.width, height: input.height, preparationMedianMs: rounded(percentile(preparations, .5)), ocrMedianMs: rounded(percentile(recognitions, .5)), ocrMaxMs: rounded(Math.max(...recognitions)), processCpuMs: rounded((cpu.user + cpu.system) / 1000), rssMiB: rounded(process.memoryUsage().rss / 1024 / 1024), text, confidence });
    }
    console.log(JSON.stringify(report, null, 2));
  } finally { await service.dispose(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
