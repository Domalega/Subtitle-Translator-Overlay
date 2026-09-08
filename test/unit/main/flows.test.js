'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
const { PNG } = require('pngjs');
const { mainHarness, makeImage } = require('../../helpers/main-harness');
const flush = () => new Promise(resolve => setImmediate(resolve));

test('game capture selects the correct display and scales to actual thumbnail pixels', async t => {
  let cropped;
  const primary = makeImage(640, 360); const crop = primary.crop;
  primary.crop = bounds => { cropped = bounds; return crop(bounds); };
  const h = mainHarness(t, { getSources: async () => [{ display_id: '99', thumbnail: makeImage(1, 1) }, { display_id: '1', thumbnail: primary }] });
  await h.invoke('set-game-mode-enabled', true);
  await h.invoke('complete-capture-translate', { x: 100, y: 200, width: 300, height: 100 });
  assert.deepEqual(JSON.parse(JSON.stringify(cropped)), { x: 50, y: 100, width: 150, height: 50 });
  const result = h.windows[0].messages.find(([channel]) => channel === 'capture-result')?.[1];
  assert.equal(result.original, 'Hello world'); assert.equal(result.translation, 'Translation');
});
test('disabling Game mode suppresses in-flight capture results', async t => {
  let finish;
  const h = mainHarness(t, { createWorker: async () => ({ setParameters: async () => {}, recognize: () => new Promise(resolve => { finish = resolve; }), terminate: async () => {} }) });
  await h.invoke('set-game-mode-enabled', true);
  const capture = h.invoke('complete-capture-translate', { x: 10, y: 10, width: 100, height: 50 });
  await flush(); h.invoke('set-game-mode-enabled', false);
  finish({ data: { text: 'Old game', confidence: 90 } }); await capture;
  assert.equal(h.windows[0].messages.some(([channel]) => channel === 'capture-result'), false);
});
test('failed Game OCR reports a visible error and permits the next attempt', async t => {
  let calls = 0;
  const h = mainHarness(t, { createWorker: async () => ({ setParameters: async () => {}, recognize: async () => { if (++calls === 1) throw Error('test OCR error'); return { data: { text: 'Recovered text' } }; }, terminate: async () => {} }) });
  h.invoke('set-game-mode-enabled', true);
  await h.invoke('complete-capture-translate', { x: 0, y: 0, width: 100, height: 50 });
  await h.invoke('complete-capture-translate', { x: 0, y: 0, width: 100, height: 50 });
  const results = h.windows[0].messages.filter(([c]) => c === 'capture-result').map(([,p]) => p);
  assert.match(results[0].error, /test OCR error/); assert.equal(results[1].original, 'Recovered text');
});
test('changing the OCR area during capture discards the old screen image', async t => {
  let finish;
  const h = mainHarness(t, { getSources: () => new Promise(resolve => { finish = resolve; }) });
  await h.invoke('complete-ocr-area', { x: 0, y: 0, width: 100, height: 50 });
  const capture = h.invoke('capture-screen-subtitle-frame', 'manual');
  await h.invoke('complete-ocr-area', { x: 300, y: 200, width: 100, height: 50 });
  finish([{ display_id: '1', thumbnail: makeImage(1280, 720) }]);
  assert.equal(await capture, null);
});
test('complete OCR frame records diagnostics and rejects stale or invalid updates', async t => {
  const h = mainHarness(t);
  await h.invoke('complete-ocr-area', { x: 100, y: 100, width: 300, height: 60 });
  const frame = await h.invoke('capture-screen-subtitle-frame', 'manual');
  frame.generation = 1;
  const result = await h.invoke('recognize-screen-subtitle-frame', frame);
  assert.equal(result.text, 'Hello world');
  assert.equal(h.invoke('record-ocr-diagnostic-update', { frameId: frame.id, decision: { accepted: true, reason: 'accepted', normalizedText: 'hello world' } }), true);
  assert.equal(h.invoke('record-ocr-diagnostic-update', { frameId: -1 }), false);
  assert.equal(h.invoke('record-ocr-diagnostic-update', { frameId: frame.id, decision: {} }), false);
  assert.equal((await h.invoke('save-ocr-diagnostic-sample')).ok, true);
  assert.equal(await h.invoke('open-ocr-diagnostics-folder'), true);
  await assert.rejects(h.invoke('recognize-screen-subtitle-frame', {}), /Invalid OCR frame/);
  const saved = fs.readdirSync(path.join(h.folder, 'ocr-diagnostics'))[0];
  const metadata = JSON.parse(fs.readFileSync(path.join(h.folder, 'ocr-diagnostics', saved, 'metadata.json')));
  assert.equal(metadata.ocr.text, 'Hello world');
});
test('OCR mask preserves yellow subtitle pixels', t => {
  const h = mainHarness(t);
  h.context.testImage = makeImage(1, 1, Buffer.from([20, 190, 255, 255]));
  const png = PNG.sync.read(h.evaluate('subtitleMaskToPng(testImage)'));
  assert.equal(png.data[0], 255);
});
test('window controls reuse tool windows and reject invalid sizes and positions', async t => {
  const h = mainHarness(t);
  h.invoke('open-settings-window'); h.invoke('open-settings-window');
  h.invoke('open-dictionary-window'); h.invoke('open-dictionary-window');
  assert.equal(h.windows.length, 3);
  assert.equal(h.invoke('move-window', NaN, 0), false);
  assert.equal(h.invoke('resize-window', 0, Infinity), false);
  assert.equal(h.invoke('set-window-size', NaN, 100), false);
  h.invoke('set-window-size', 100.5, 100);
  assert.deepEqual(h.windows[0].getSize(), [620, 260]);
  h.invoke('move-window', 10.4, 20.6); h.invoke('resize-window', 100, 100);
  assert.deepEqual(h.windows[0].getPosition(), [10, 21]);
  assert.deepEqual(h.windows[0].getSize(), [720, 360]);
  assert.equal(await h.invoke('open-srt'), null);
  assert.equal(await h.invoke('export-dictionary', [], 'csv'), false);
  assert.equal(h.invoke('restore-window'), true);
  h.shortcuts.get('CommandOrControl+Shift+S')();
  assert.ok(h.windows[0].messages.some(([channel]) => channel === 'stop-ocr'));
});
test('save failure leaves the previously active OCR area intact', async t => {
  const h = mainHarness(t);
  await h.invoke('complete-ocr-area', { x: 100, y: 100, width: 200, height: 50 });
  fs.unlinkSync(path.join(h.folder, 'ui-settings.json')); fs.mkdirSync(path.join(h.folder, 'ui-settings.json'));
  await assert.rejects(h.invoke('complete-ocr-area', { x: 500, y: 500, width: 200, height: 50 }));
  assert.equal(h.evaluate('manualOcrArea.x'), 100);
});
test('phonetic and context services handle empty input and valid remote examples', async t => {
  const h = mainHarness(t, { fetch: async url => url.includes('dictionaryapi') ? { ok: true, json: async () => [{ phonetics: [{ text: '/hello/' }], meanings: [{ definitions: [{ example: 'Hello, this is a complete sentence.' }] }] }] } : { ok: true, json: async () => [[['Translation']]] } });
  assert.equal(await h.invoke('get-phonetic', ''), '');
  assert.equal(await h.invoke('get-phonetic', 'Hello'), '/hello/');
  assert.equal((await h.invoke('get-context-sentences', '')).length, 0);
  const context = await h.invoke('get-context-sentences', 'hello');
  assert.equal(context.length, 1); assert.equal(context[0].russian, 'Translation');
});
test('auto detection can find, adopt, visualize, save and release a synthetic subtitle', async t => {
  const data = Buffer.alloc(640 * 480 * 4);
  for (let i = 0; i < 24; i++) for (let y = 370; y < 377; y++) for (let x = 220 + i * 8; x < 225 + i * 8; x++) {
    if (y === 370 || y === 373 || y === 376 || x === 220 + i * 8 || x === 224 + i * 8) data.fill(255, (y * 640 + x) * 4, (y * 640 + x) * 4 + 4);
  }
  const h = mainHarness(t, { getSources: async () => [{ display_id: '1', thumbnail: makeImage(640, 480, data) }] });
  assert.equal((await h.invoke('find-subtitle-area')).error, 'DEVELOPER_MODE_DISABLED');
  await h.invoke('set-ui-setting', 'developerMode', true);
  assert.equal((await h.invoke('find-subtitle-area')).found, true);
  assert.equal((await h.invoke('save-detection-sample')).ok, true);
  assert.equal(h.invoke('use-detected-subtitle-area').ok, true);
  assert.equal(h.evaluate('activeAreaSource()'), 'automatic');
  assert.ok(h.evaluate('automaticOcrArea.width') > 180);
  assert.equal(h.invoke('stop-auto-tracking').ok, true);
  assert.equal(h.evaluate('activeOcrArea()'), null);
  assert.equal(h.invoke('use-detected-subtitle-area').error, 'NO_DETECTED_AREA');
});
test('stopping auto tracking cancels pending global detection', async t => {
  let finish;
  const h = mainHarness(t, { getSources: () => new Promise(resolve => { finish = resolve; }) });
  await h.invoke('set-ui-setting', 'developerMode', true);
  const detecting = h.invoke('find-subtitle-area');
  h.invoke('stop-auto-tracking'); finish([]);
  assert.equal((await detecting).error, 'STALE_DETECTION');
  assert.equal(h.evaluate('subtitleAreaTracker.state'), 'stopped');
});
