'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { rendererHarness } = require('../../helpers/renderer-harness');

test('main renderer handles removal and invalid OCR areas without crashing', async t => {
  const h = rendererHarness(t, 'renderer/main/index.html');
  await h.flush();
  assert.doesNotThrow(() => h.events.onOcrAreaChanged(null));
  assert.equal(h.evaluate('hasOcrArea'), false);
  h.events.onOcrAreaChanged({ width: 100, height: 50 });
  assert.equal(h.evaluate('hasOcrArea'), true);
  h.events.onOcrAreaChanged({ width: -1, height: 50 });
  assert.equal(h.evaluate('hasOcrArea'), false);
});
test('settings queue recovers after a rejected IPC call', async t => {
  let count = 0;
  const h = rendererHarness(t, 'renderer/settings/settings.html', { setUiSetting: async () => { if (++count === 1) throw new Error('disk full'); return true; } });
  await h.flush();
  await h.evaluate("setUiSettingQueued('theme', 'blue')").catch(() => {});
  await h.evaluate("setUiSettingQueued('fontScale', 110)");
  assert.equal(count, 2);
});
test('dictionary context renders remote text safely', async t => {
  const h = rendererHarness(t, 'renderer/dictionary/dictionary.html', {
    dictionaryGet: async () => [{ id: '1', english: 'hello', russian: 'test', addedAt: 1 }],
    getContextSentences: async () => [{ english: '<img src=x onerror=alert(1)> hello & goodbye', russian: 'test' }]
  });
  await h.flush();
  h.document.querySelector('.contextButton').click();
  await h.flush();
  const result = h.document.querySelector('.englishSentence');
  assert.equal(result.querySelector('img'), null);
  assert.match(result.textContent, /<img/);
  assert.equal(result.querySelector('.highlight').textContent, 'hello');
});
test('late Game mode result cannot replace normal OCR output', async t => {
  const h = rendererHarness(t, 'renderer/main/index.html');
  await h.flush();
  const before = h.document.getElementById('englishText').textContent;
  h.events.onCaptureResult({ original: 'stale capture', translation: 'stale' });
  assert.equal(h.document.getElementById('englishText').textContent, before);
});
test('all renderer pages load their scripts and expose the expected controls', async t => {
  for (const page of ['renderer/main/index.html', 'renderer/settings/settings.html', 'renderer/dictionary/dictionary.html', 'renderer/capture/select.html', 'renderer/capture/capture-select.html', 'legacy/translate-window.html', 'renderer/overlays/near-source/near-source-overlay.html', 'renderer/overlays/developer-zone/developer-ocr-zone.html', 'renderer/overlays/developer-zone/developer-subtitle-candidate.html']) {
    const h = rendererHarness(t, page);
    await h.flush();
    assert.equal(h.errors.length, 0, page);
  }
});
