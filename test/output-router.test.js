const test = require('node:test');
const assert = require('node:assert/strict');
const { OutputRouter } = require('../src/output-router');
const { NearSourceOutput } = require('../src/near-source-output');

function output() {
  const calls = [];
  return { calls, showRecognizedText(...a) { calls.push(['recognized', ...a]); }, showTranslationPending(...a) { calls.push(['pending', ...a]); }, showTranslation(...a) { calls.push(['translation', ...a]); }, showTranslationError(...a) { calls.push(['error', ...a]); }, setStatus(...a) { calls.push(['status', ...a]); }, clear(...a) { calls.push(['clear', ...a]); }, setVisible(...a) { calls.push(['visible', ...a]); } };
}

test('OutputRouter routes panel, overlay, and both modes explicitly', () => {
  const main = output(); const near = output(); const router = new OutputRouter({ mainOutput: main, nearSourceOutput: near });
  router.showTranslation('one', 'source');
  assert.equal(near.calls.length, 0);
  router.setDisplayMode('overlay');
  assert.deepEqual(near.calls[0], ['translation', 'one', 'source']);
  const mainCount = main.calls.length;
  router.showTranslation('two', 'source two');
  assert.equal(main.calls.length, mainCount);
  router.setDisplayMode('both');
  router.showTranslation('three', 'source three');
  assert.ok(main.calls.some((call) => call[0] === 'translation' && call[1] === 'three'));
  assert.ok(near.calls.some((call) => call[0] === 'translation' && call[1] === 'three'));
  router.setDisplayMode('panel');
  assert.ok(near.calls.some((call) => call[0] === 'visible' && call[1] === false));
});

test('OutputRouter mirrors near-source, preserves on pending/error, clears both, and excludes game mode', () => {
  const main = output(); const near = output(); const router = new OutputRouter({ mainOutput: main, nearSourceOutput: near });
  router.setDisplayMode('overlay'); router.showTranslation('one', 'source');
  router.showTranslationPending('next'); router.showTranslationError('failed');
  assert.equal(near.calls.filter((call) => call[0] === 'translation').length, 1);
  router.setGameMode(true); router.showTranslation('game');
  assert.equal(near.calls.filter((call) => call[0] === 'translation').length, 1);
  router.clear();
  assert.ok(main.calls.some((call) => call[0] === 'clear'));
  assert.ok(near.calls.some((call) => call[0] === 'clear'));
});

test('OutputRouter hides only overlay and game mode always uses main output', () => {
  const main = output(); const near = output(); const router = new OutputRouter({ mainOutput: main, nearSourceOutput: near });
  router.setDisplayMode('overlay'); router.showTranslation('one', 'source'); router.hideOverlay();
  assert.ok(near.calls.some((call) => call[0] === 'visible' && call[1] === false));
  router.setGameMode(true); router.showTranslation('game', 'source');
  assert.ok(main.calls.some((call) => call[0] === 'translation' && call[1] === 'game'));
});

test('NearSourceOutput retains receiver-sensitive dependencies and does not show empty text', () => {
  const events = []; const deps = {
    events, showOverlay(payload) { this.events.push(['show', payload.text]); }, hideOverlay() { this.events.push(['hide']); }, clearOverlay() { this.events.push(['clear']); }, updateOverlaySettings() {}
  };
  const output = new NearSourceOutput(deps);
  output.showTranslation('old'); output.showTranslationPending(); output.showTranslationError('error'); output.showTranslation(''); output.setVisible(false);
  assert.deepEqual(events, [['show', 'old'], ['hide']]);
});
