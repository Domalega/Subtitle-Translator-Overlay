'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { rendererHarness } = require('../../helpers/renderer-harness');
const click = (h, id) => h.document.getElementById(id).click();
const change = (h, id, value, type = 'change') => { const element = h.document.getElementById(id); element.value = value; element.dispatchEvent(new h.window.Event(type, { bubbles: true })); };
const entries = [
  { id: 'a', english: 'alpha', russian: 'первый', addedAt: 1 },
  { id: 'b', english: 'bravo', russian: 'второй', addedAt: 2 },
  { id: 'c', english: 'charlie', russian: 'третий', addedAt: 3 }
];
test('main controls switch mode, translate edits, apply settings and react to progress', async t => {
  const h = rendererHarness(t, 'renderer/main/index.html'); await h.flush();
  click(h, 'settingsToggle'); click(h, 'dictionaryOpen'); click(h, 'focusToggle');
  assert.equal(h.document.querySelector('.panel').classList.contains('focusMode'), true);
  click(h, 'gameModeToggle'); await h.flush();
  assert.equal(h.document.getElementById('playPause').disabled, true);
  h.events.onCaptureResult({ original: 'Game subtitle', translation: 'Game translation' });
  assert.equal(h.document.getElementById('englishText').textContent, 'Game subtitle');
  h.document.getElementById('englishText').textContent = 'Edited subtitle'; click(h, 'retranslateButton'); await h.flush();
  assert.equal(h.document.getElementById('russianText').textContent, 'Translation');
  click(h, 'gameModeToggle'); await h.flush();
  assert.equal(h.document.getElementById('playPause').disabled, false);
  h.events.onApplyUiSettings({ theme: 'blue', font: 'consolas', fontScale: 120, windowWidth: 1000, windowHeight: 400, developerMode: true, displayMode: 'both' });
  h.events.onApplyUiSetting({ key: 'deleteConfirm', value: false });
  h.events.onApplyUiSetting({ key: 'nearSourceFontSize', value: 30 });
  assert.equal(h.document.querySelector('.panel').dataset.theme, 'blue');
  h.events.onGameModeDisabled(); h.events.onWindowRestored();
  h.events.onOcrAreaChanged({ width: 200, height: 50 });
  h.events.onOcrProgress({ type: 'started', generation: 1, requestId: 1 });
  h.events.onOcrProgress({ type: 'progress', generation: 1, requestId: 1, progress: 50 });
  h.events.onOcrProgress({ type: 'reset', generation: 1, requestId: 1 });
  h.events.onStopOcr();
  assert.match(h.document.getElementById('status').textContent, /stopped/);
});
test('main can add English and Russian selections and handles duplicates', async t => {
  let duplicate = false;
  const h = rendererHarness(t, 'renderer/main/index.html', {
    translateText: async (_text, source) => source === 'ru' ? 'hello' : 'привет',
    getPhonetic: async () => '/hello/',
    dictionaryAdd: async () => duplicate ? { duplicate: true } : { added: true }
  });
  await h.flush();
  for (const selection of ['hello', 'привет']) {
    h.window.getSelection = () => ({ toString: () => selection });
    click(h, 'addWord'); await h.flush();
    assert.match(h.document.getElementById('status').textContent, /Added/);
  }
  duplicate = true; click(h, 'addWord'); await h.flush();
  assert.match(h.document.getElementById('status').textContent, /already/);
  h.window.getSelection = () => ({ toString: () => '' }); click(h, 'addWord'); await h.flush();
  assert.match(h.document.getElementById('status').textContent, /Select a word/);
});
test('settings controls send correct values and reset through the persistence queue', async t => {
  const h = rendererHarness(t, 'renderer/settings/settings.html'); await h.flush();
  change(h, 'themeSelect', 'purple'); change(h, 'fontSelect', 'consolas');
  change(h, 'fontScale', 130, 'input'); change(h, 'windowWidth', 1200, 'input'); change(h, 'windowHeight', 600, 'input');
  change(h, 'contextCountSelect', 3); change(h, 'displayMode', 'both'); change(h, 'nearSourcePlacement', 'above');
  change(h, 'nearSourceVerticalOffset', 20, 'input'); change(h, 'nearSourceBackgroundOpacity', 50, 'input');
  change(h, 'nearSourceMaxLines', 4, 'input'); change(h, 'gameHotkey', 'Control+Alt+T');
  for (const id of ['developerModeToggle', 'deleteConfirmToggle']) {
    const el = h.document.getElementById(id); el.checked = true; el.dispatchEvent(new h.window.Event('change'));
  }
  h.document.querySelector('.accordionHeader').click();
  assert.equal(h.document.querySelector('.accordionBody').classList.contains('open'), true);
  await h.flush();
  assert.ok(h.calls.some(c => c[0] === 'setUiSetting' && c[1] === 'nearSourceBackgroundOpacity' && c[2] === 0.5));
  click(h, 'resetDefaults'); await h.flush();
  assert.equal(h.document.getElementById('displayMode').value, 'panel');
  assert.ok(h.calls.some(c => c[0] === 'setGameHotkey' && c[1] === 'CommandOrControl+Shift+T'));
  click(h, 'selectOcrArea'); click(h, 'closeWindow');
  assert.ok(h.calls.some(c => c[0] === 'selectOcrArea'));
});
test('dictionary search, sorting, paging, study and export work with stored entries', async t => {
  const h = rendererHarness(t, 'renderer/dictionary/dictionary.html', { dictionaryGet: async () => entries }); await h.flush();
  change(h, 'dictionarySort', 'alpha-asc'); await h.flush();
  assert.equal(h.document.querySelector('.dictionaryItem strong').textContent, 'alpha');
  click(h, 'dictionaryNext'); await h.flush();
  assert.equal(h.document.querySelector('.dictionaryItem strong').textContent, 'bravo');
  click(h, 'dictionaryPrev'); await h.flush();
  change(h, 'dictionarySearch', 'третий', 'input'); await h.flush();
  assert.equal(h.document.querySelector('.dictionaryItem strong').textContent, 'charlie');
  change(h, 'dictionarySearch', 'missing', 'input'); await h.flush();
  assert.match(h.document.querySelector('.emptyState').textContent, /No matching/);
  click(h, 'studyButton'); await h.flush(); click(h, 'showTranslationBtn');
  assert.equal(h.document.getElementById('studyTranslation').textContent, 'первый');
  click(h, 'studyNextBtn'); click(h, 'showTranslationBtn');
  assert.equal(h.document.getElementById('studyTranslation').textContent, 'второй');
  click(h, 'closeStudyModal'); click(h, 'exportButton'); click(h, 'exportCsvBtn'); await h.flush();
  click(h, 'exportButton'); click(h, 'exportJsonBtn'); await h.flush();
  assert.deepEqual(h.calls.filter(c => c[0] === 'exportDictionary').map(c => c[2]), ['csv', 'json']);
});
test('late dictionary fetch cannot replace a newer rendering', async t => {
  const h = rendererHarness(t, 'renderer/dictionary/dictionary.html', { dictionaryGet: async () => entries }); await h.flush();
  let finishOld; let count = 0;
  h.window.overlayApi.dictionaryGet; // retain the injected bridge contract
  h.evaluate('renderRequestId += 1');
  // Exercise two overlapping context requests separately from dictionary rendering.
  h.window.overlayApi = { ...h.window.overlayApi, dictionaryGet: () => ++count === 1 ? new Promise(resolve => { finishOld = resolve; }) : Promise.resolve([entries[1]]) };
  const old = h.evaluate('renderDictionary()');
  await h.evaluate('renderDictionary()');
  finishOld([entries[0]]); await old;
  assert.equal(h.document.querySelector('.dictionaryItem strong').textContent, 'bravo');
});
for (const [page, complete, cancel] of [
  ['renderer/capture/select.html', 'completeOcrArea', 'cancelOcrArea'],
  ['renderer/capture/capture-select.html', 'completeCaptureTranslate', 'cancelCaptureTranslate']
]) {
  test(page + ' supports reverse dragging, tiny selection cancellation, and Escape', async t => {
    const h = rendererHarness(t, page);
    const mouse = (type, x, y) => h.window.dispatchEvent(new h.window.MouseEvent(type, { clientX: x, clientY: y, button: 0 }));
    mouse('mousemove', 10, 10); mouse('mousedown', 200, 100); mouse('mousemove', 100, 50); mouse('mouseup', 100, 50);
    assert.deepEqual(JSON.parse(JSON.stringify(h.calls.find(c => c[0] === complete)[1])), { x: 100, y: 50, width: 100, height: 50 });
    mouse('mousedown', 0, 0); mouse('mouseup', 5, 5);
    h.window.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Escape' }));
    assert.equal(h.calls.filter(c => c[0] === cancel).length, 2);
  });
}
test('overlays display plain text, update styles and toggle diagnostic markers', async t => {
  const near = rendererHarness(t, 'renderer/overlays/near-source/near-source-overlay.html');
  near.events.onNearSourceOverlayContent({ text: '<script>bad</script>' });
  near.events.onNearSourceOverlaySettings({ nearSourceFontSize: 32, nearSourceBackgroundOpacity: 0.5, nearSourceMaxWidth: 600, nearSourceMaxLines: 4 });
  assert.equal(near.document.getElementById('translation').textContent, '<script>bad</script>');
  assert.equal(near.document.documentElement.style.getPropertyValue('--font-size'), '32px');
  const zone = rendererHarness(t, 'renderer/overlays/developer-zone/developer-ocr-zone.html');
  zone.events.onDeveloperOcrZoneTheme('red'); zone.events.onDeveloperOcrZoneStyle('manual'); zone.events.onDeveloperOcrZoneState({ type: 'automatic' });
  assert.equal(zone.document.getElementById('zone').dataset.type, 'automatic');
  const candidate = rendererHarness(t, 'renderer/overlays/developer-zone/developer-subtitle-candidate.html');
  candidate.events.onDeveloperSubtitleCandidateState({ visible: true });
  assert.equal(candidate.document.getElementById('candidate').hidden, false);
});
test('developer controls handle search, applying an area, diagnostics and stopping', async t => {
  const h = rendererHarness(t, 'renderer/main/index.html', { findSubtitleArea: async () => ({ found: true }), useDetectedSubtitleArea: async () => ({ ok: true }), saveOcrDiagnosticSample: async () => ({ ok: true }), saveDetectionSample: async () => ({ ok: true }) }); await h.flush();
  h.events.onApplyUiSetting({ key: 'developerMode', value: true });
  for (const id of ['findSubtitleArea', 'useDetectedSubtitleArea', 'saveOcrSample', 'saveDetectionSample', 'openOcrDiagnostics', 'stopAutoTracking']) { click(h, id); await h.flush(); }
  assert.equal(h.document.getElementById('findSubtitleArea').disabled, false);
  h.events.onDeveloperStatus({ stage: 'OCR complete', trackerState: 'locked', lockedArea: { width: 500, height: 50 }, areaSource: 'automatic' });
  assert.match(h.document.getElementById('developerStatus').textContent, /locked/);
});
test('legacy translation window handles result, word chips and empty OCR', async t => {
  const h = rendererHarness(t, 'legacy/translate-window.html', { dictionaryAdd: async () => ({ added: true }) });
  await h.flush();
  h.events.onTranslateResult({ original: 'Hello world', translation: 'Привет', words: [{ english: 'Hello' }] });
  assert.equal(h.document.getElementById('translatedText').textContent, 'Привет');
  h.document.querySelector('.chipAdd').click(); await h.flush();
  assert.equal(h.document.querySelector('.chipAdd').textContent, '✓');
  h.events.onTranslateResult(null);
  assert.match(h.document.getElementById('originalText').textContent, /No English/);
});
