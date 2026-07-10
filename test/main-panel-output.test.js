const test = require('node:test');
const assert = require('node:assert/strict');
const { MainPanelOutput } = require('../src/main-panel-output');

test('MainPanelOutput tolerates absent optional elements', () => {
  const output = new MainPanelOutput({});
  assert.doesNotThrow(() => {
    output.showRecognizedText('English');
    output.showTranslation('Russian');
    output.showTranslationPending();
    output.showTranslationError('failed');
    output.setStatus('status');
    output.clear();
  });
});
