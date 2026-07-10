const test = require('node:test');
const assert = require('node:assert/strict');
const { ScreenOcrCoordinator } = require('../src/screen-ocr-coordinator');
const { SubtitleStabilizer } = require('../src/subtitle-stabilizer');

function createOutput() {
  return {
    recognized: '',
    translation: '',
    status: '',
    showRecognizedText(text) { this.recognized = text; },
    showTranslation(text) { this.translation = text; },
    showTranslationPending() { if (!this.translation) this.translation = 'Translating...'; },
    showTranslationError(message) { this.status = message; },
    setStatus(message) { this.status = message; },
    clear() { this.recognized = ''; this.translation = ''; }
  };
}

test('ScreenOcrCoordinator ignores OCR result after stop', async () => {
  let resolveOcr;
  const output = createOutput();
  const coordinator = new ScreenOcrCoordinator({
    output,
    stabilizer: new SubtitleStabilizer(),
    hasOcrArea: () => true,
    readOcr: () => new Promise((resolve) => { resolveOcr = resolve; }),
    translate: async () => 'translation'
  });

  coordinator.start();
  coordinator.stop('stopped');
  resolveOcr('Hello, this is a subtitle');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(output.recognized, '');
  assert.equal(output.status, 'stopped');
});

test('ScreenOcrCoordinator blocks parallel Read once during active OCR', async () => {
  let calls = 0;
  let resolveOcr;
  const output = createOutput();
  const coordinator = new ScreenOcrCoordinator({
    output,
    stabilizer: new SubtitleStabilizer(),
    hasOcrArea: () => true,
    readOcr: () => {
      calls += 1;
      return new Promise((resolve) => { resolveOcr = resolve; });
    },
    translate: async () => 'translation'
  });

  coordinator.readOnce();
  coordinator.readOnce();
  resolveOcr('Hello, this is a subtitle');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls, 1);
});
