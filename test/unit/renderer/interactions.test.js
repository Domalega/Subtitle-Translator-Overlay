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
test('main capture, edit, settings and stop work without mode toggles', async t => {
  const h=rendererHarness(t,'renderer/main/index.html'); await h.flush();
  click(h,'settingsToggle'); click(h,'dictionaryOpen');
  assert.equal(h.document.getElementById('gameModeToggle'),null);
  click(h,'captureTranslate'); await h.flush();
  assert.equal(h.document.getElementById('playPause').disabled,true);
  await h.events.onCaptureResult({original:'A subtitle',translation:'A translation'});
  click(h,'editOriginal'); h.document.getElementById('englishText').textContent='Edited subtitle';
  click(h,'retranslateButton'); await h.flush();
  assert.equal(h.document.getElementById('russianText').textContent,'Translation');
  h.events.onApplyUiSettings({theme:'light',font:'consolas',fontScale:120,windowWidth:1000,windowHeight:400,displayMode:'both'});
  h.events.onApplyUiSetting({key:'deleteConfirm',value:false}); h.events.onApplyUiSetting({key:'nearSourceFontSize',value:30});
  assert.equal(h.document.documentElement.dataset.theme,'light');
  h.events.onWindowRestored(); h.events.onOcrAreaChanged({width:200,height:50});
  h.events.onOcrProgress({type:'started',generation:1,requestId:1}); h.events.onOcrProgress({type:'progress',generation:1,requestId:1,progress:50}); h.events.onOcrProgress({type:'reset',generation:1,requestId:1}); h.events.onStopOcr();
  assert.match(h.document.getElementById('status').textContent,/stopped/);
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
    assert.match(h.document.getElementById('actionStatus').textContent, /Added/);
  }
  duplicate = true; click(h, 'addWord'); await h.flush();
  assert.match(h.document.getElementById('actionStatus').textContent, /already/);
  h.window.getSelection = () => ({ toString: () => '' }); click(h, 'addWord'); await h.flush();
  assert.match(h.document.getElementById('actionStatus').textContent, /Select a word/);
});
test('settings controls save typed values, record hotkeys and reset atomically', async t => {
  const {normalizeUiSettings}=require('../../../src/shared/settings/settings-store');
  const h=rendererHarness(t,'renderer/settings/settings.html',{resetUiSettings:async()=>normalizeUiSettings()}); await h.flush();
  change(h,'themeSelect','light'); change(h,'fontSelect','consolas'); change(h,'fontScale',130); change(h,'contextCountSelect',3); change(h,'displayMode','both'); change(h,'nearSourcePlacement','above');
  change(h,'nearSourceVerticalOffset',20); change(h,'nearSourceBackgroundOpacity',50); change(h,'nearSourceMaxLines',4);
  h.document.getElementById('gameHotkey').dispatchEvent(new h.window.KeyboardEvent('keydown',{key:'T',ctrlKey:true,altKey:true}));
  for(const id of ['developerModeToggle','deleteConfirmToggle']) { const el=h.document.getElementById(id);el.checked=true;el.dispatchEvent(new h.window.Event('change')); }
  await h.flush(); assert.ok(h.calls.some(c=>c[0]==='setUiSetting'&&c[1]==='nearSourceBackgroundOpacity'&&c[2]===.5));
  click(h,'resetDefaults'); assert.equal(h.document.getElementById('resetModal').classList.contains('show'),true); click(h,'confirmReset'); await h.flush();
  assert.equal(h.document.getElementById('displayMode').value,'panel');assert.ok(h.calls.some(c=>c[0]==='resetUiSettings'));
  click(h,'selectOcrArea');click(h,'closeWindow'); assert.ok(h.calls.some(c=>c[0]==='selectOcrArea'));
});
test('dictionary search, sorting, paging, study and export work with stored entries', async t => {
  const h = rendererHarness(t, 'renderer/dictionary/dictionary.html', { dictionaryGet: async () => entries }); await h.flush();
  change(h, 'dictionarySort', 'alpha-asc'); await h.flush();
  assert.equal(h.document.querySelector('.dictionaryItem strong').textContent, 'alpha');
  assert.equal(h.document.querySelectorAll('.dictionaryItem').length,3);
  assert.equal(h.document.getElementById('dictionaryNext').disabled,true);
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
  test(page + ' supports reverse dragging, tiny selection retry, and Escape', async t => {
    const h = rendererHarness(t, page);
    const mouse = (type, x, y) => h.window.dispatchEvent(new h.window.MouseEvent(type, { clientX: x, clientY: y, button: 0 }));
    mouse('mousemove', 10, 10); mouse('mousedown', 200, 100); mouse('mousemove', 100, 50); mouse('mouseup', 100, 50);
    assert.deepEqual(JSON.parse(JSON.stringify(h.calls.find(c => c[0] === complete)[1])), { x: 100, y: 50, width: 100, height: 50 });
    mouse('mousedown', 0, 0); mouse('mouseup', 5, 5);
    h.window.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Escape' }));
    assert.equal(h.calls.filter(c => c[0] === cancel).length, 1);
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
  const h = rendererHarness(t, 'renderer/settings/settings.html', { findSubtitleArea: async () => ({ found: true }), useDetectedSubtitleArea: async () => ({ ok: true }), saveOcrDiagnosticSample: async () => ({ ok: true }), saveDetectionSample: async () => ({ ok: true }) }); await h.flush();
  h.events.onApplyUiSetting({ key: 'developerMode', value: true });
  for (const id of ['findSubtitleArea', 'useDetectedSubtitleArea', 'saveOcrSample', 'saveDetectionSample', 'openOcrDiagnostics', 'stopAutoTracking']) { click(h, id); await h.flush(); }
  assert.equal(h.document.getElementById('findSubtitleArea').disabled, false);
  h.events.onDeveloperStatus({ stage: 'OCR complete', trackerState: 'locked', lockedArea: { width: 500, height: 50 }, areaSource: 'automatic' });
  assert.match(h.document.getElementById('developerStatus').textContent, /locked/);
});
