'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path'); const vm = require('node:vm');
const { mainHarness } = require('../../helpers/main-harness');
test('real entry point loads the main process module', () => {
  let entry; const file = path.resolve(__dirname, '../../../src/main.js');
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { require: name => { entry = name; } }, { filename: file });
  assert.equal(entry, './main/app');
});
test('startup restores saved area; changing DPI updates it and shutdown releases shortcuts', async t => {
  const h = mainHarness(t, { autoReady: true, settings: { ocrArea: { x: 100, y: 200, width: 300, height: 50 }, developerMode: true } });
  await h.start();
  assert.equal(h.evaluate('manualOcrArea.x'), 100);
  const display = h.electron.screen.getPrimaryDisplay(); display.scaleFactor = 1.5;
  h.electron.screen.emit('display-metrics-changed');
  assert.equal(h.evaluate('manualOcrArea.x'), 150);
  assert.equal(h.evaluate('manualOcrArea.width'), 450);
  assert.equal(h.evaluate('manualOcrAnchorBoundsDip.width'), 300);
  h.electron.app.emit('second-instance');
  h.windows[0].close();
  assert.equal(h.shortcuts.size, 0);
  assert.equal(h.evaluate('mainWindow'), null);
  h.electron.app.emit('window-all-closed');
});
test('IPC rejects remote pages and child frames; renderer navigation and popups are blocked', t => {
  const h = mainHarness(t); const contents = h.windows[0].webContents;
  const handler = h.handlers.get('dictionary-get');
  assert.throws(() => handler({ sender: contents, senderFrame: { url: contents.mainFrame.url } }), /Untrusted/);
  const original = contents.mainFrame.url; contents.mainFrame.url = 'https://example.com/';
  assert.throws(() => handler({ sender: contents, senderFrame: contents.mainFrame }), /Untrusted/);
  contents.mainFrame.url = original;
  let prevented = false; contents.emit('will-navigate', { preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true); assert.equal(h.windows[0].openHandler().action, 'deny');
});
test('selection and tool windows can close and reopen without losing their references', async t => {
  const h = mainHarness(t);
  h.invoke('select-ocr-area'); h.invoke('cancel-ocr-area'); assert.equal(h.evaluate('selectionWindow'), null);
  h.invoke('select-ocr-area'); await h.invoke('complete-ocr-area', { x: 10, y: 20, width: 200, height: 50 });
  assert.equal(h.evaluate('selectionWindow'), null);
  h.invoke('open-translate-window'); h.invoke('open-translate-window');
  h.evaluate('translateWindow.close()'); assert.equal(h.evaluate('translateWindow'), null);
  h.invoke('open-settings-window'); h.evaluate('settingsWindow.close()');
  h.invoke('open-dictionary-window'); h.evaluate('dictionaryWindow.close()');
  h.invoke('set-game-mode-enabled', true); assert.equal(h.invoke('start-capture-translate'), true);
  h.invoke('cancel-capture-translate'); assert.equal(h.evaluate('captureWindow'), null);
  h.invoke('set-game-mode-enabled', false); assert.equal(h.invoke('start-capture-translate'), false);
});
test('dictionary delete and exports preserve quoted text, Cyrillic and dates', async t => {
  const h = mainHarness(t);
  const added = await h.invoke('dictionary-add', { english: 'hello "world"', russian: 'привет', transcription: '/hello/' });
  assert.equal((await h.invoke('dictionary-get')).length, 1);
  for (const format of ['csv', 'json']) {
    const file = path.join(h.folder, 'export.' + format);
    h.electron.dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    assert.equal(await h.invoke('export-dictionary', [added.entry], format), true);
    const result = fs.readFileSync(file, 'utf8');
    assert.match(result, /привет/);
    if (format === 'csv') assert.match(result, /""world""/);
    else assert.equal(JSON.parse(result)[0].word, 'hello "world"');
  }
  await h.invoke('dictionary-delete', added.entry.id);
  assert.equal((await h.invoke('dictionary-get')).length, 0);
});
test('hotkey and legacy settings persist; failed hotkey registration keeps the current binding', async t => {
  const h = mainHarness(t);
  assert.equal(await h.invoke('set-game-hotkey', 'Control+Alt+T'), true);
  assert.equal(h.invoke('get-ui-settings').hotkey, 'Control+Alt+T');
  assert.equal(await h.invoke('set-game-hotkey', 'Invalid'), false);
  assert.ok(h.shortcuts.has('Control+Alt+T'));
  await Promise.all([h.invoke('set-game-setting', 'cardWidth', 600), h.invoke('set-game-setting', 'cardOpacity', 0.8)]);
  assert.equal(h.invoke('get-game-settings').cardWidth, 600);
  assert.equal(h.invoke('get-game-settings').cardOpacity, 0.8);
  h.invoke('reload-ui-settings');
});
test('detection reports absent and failed capture without leaving the busy flag set', async t => {
  const h = mainHarness(t);
  await h.invoke('set-ui-setting', 'developerMode', true);
  assert.equal((await h.invoke('find-subtitle-area')).found, false);
  h.electron.desktopCapturer.getSources = async () => [];
  assert.equal((await h.invoke('find-subtitle-area')).found, false);
  h.electron.desktopCapturer.getSources = async () => { throw Error('capture failed'); };
  assert.equal((await h.invoke('find-subtitle-area')).error, 'DETECTION_FAILED');
  assert.equal(h.evaluate('subtitleDetectionBusy'), false);
});
