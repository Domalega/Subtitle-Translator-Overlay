'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { mainHarness } = require('../../helpers/main-harness');

test('concurrent dictionary additions retain every word, including untranslated words', async t => {
  const h = mainHarness(t);
  const results = await Promise.all(['alpha', 'bravo', 'charlie'].map(english => h.invoke('dictionary-add', { english, russian: '' })));
  assert.ok(results.every(result => result.added));
  assert.equal((await h.invoke('dictionary-get')).length, 3);
  assert.equal((await h.invoke('dictionary-add', { english: ' ALPHA ', russian: '' })).duplicate, true);
});
test('concurrent settings updates preserve separate fields', async t => {
  const h = mainHarness(t);
  await Promise.all([h.invoke('set-ui-setting', 'theme', 'light'), h.invoke('set-ui-setting', 'fontScale', 130)]);
  const settings = h.invoke('get-ui-settings');
  assert.equal(settings.theme, 'light'); assert.equal(settings.fontScale, 130);
});
test('failed settings write does not poison later saves', async t => {
  const h = mainHarness(t);
  const file = path.join(h.folder, 'ui-settings.json');
  fs.mkdirSync(file);
  await assert.rejects(h.invoke('set-ui-setting', 'theme', 'light'));
  fs.rmdirSync(file);
  await h.invoke('set-ui-setting', 'fontScale', 120);
  assert.equal(h.invoke('get-ui-settings').fontScale, 120);
});
test('malformed dictionary cannot silently overwrite saved data', async t => {
  const h = mainHarness(t);
  const file = path.join(h.folder, 'dictionary.json');
  fs.writeFileSync(file, '{broken');
  await assert.rejects(h.invoke('dictionary-add', { english: 'hello', russian: 'test' }));
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
});
test('occupied hotkey reports failure and preserves previous registration', async t => {
  const h = mainHarness(t);
  assert.equal(await h.invoke('set-game-hotkey', 'Occupied'), false);
  assert.ok(h.shortcuts.has('CommandOrControl+Shift+T'));
  assert.equal(h.invoke('get-ui-settings').hotkey, 'CommandOrControl+Shift+T');
});
test('automatic crop uses capture pixels at 150 percent scaling and an offset display', t => {
  const display = { id: 2, bounds: { x: 1280, y: -100, width: 1280, height: 720 }, size: { width: 1280, height: 720 }, workArea: { x: 1280, y: -100, width: 1280, height: 680 }, scaleFactor: 1.5 };
  const h = mainHarness(t, { display });
  h.context.testDisplay = display;
  h.evaluate('setAutomaticAreaFromCandidate({ x: 600, y: 900, width: 600, height: 80 }, { width: 1920, height: 1080 }, testDisplay)');
  const area = h.evaluate('automaticOcrArea');
  assert.ok(area.x >= 580 && area.x <= 600, JSON.stringify(area));
  assert.ok(area.y >= 880 && area.y <= 900, JSON.stringify(area));
  assert.ok(area.width >= 600 && area.width <= 640, JSON.stringify(area));
});
test('hidden overlay stays hidden after settings and delayed load messages', async t => {
  const h = mainHarness(t);
  await h.invoke('complete-ocr-area', { x: 100, y: 500, width: 500, height: 50 });
  await h.invoke('set-ui-setting', 'displayMode', 'both');
  h.invoke('show-near-source-overlay', { text: 'Translation' });
  const overlay = h.windows.at(-1);
  h.invoke('hide-near-source-overlay');
  h.invoke('update-near-source-settings', { nearSourceFontSize: 30 });
  overlay.webContents.emit('did-finish-load');
  assert.equal(overlay.isVisible(), false);
});
test('manual read always captures a frame even immediately after identical capture', async t => {
  const h = mainHarness(t);
  await h.invoke('complete-ocr-area', { x: 100, y: 500, width: 500, height: 50 });
  assert.ok(await h.invoke('capture-screen-subtitle-frame', 'manual'));
  assert.ok(await h.invoke('capture-screen-subtitle-frame', 'manual'));
});
test('non-positive areas are rejected without saving them', async t => {
  const h = mainHarness(t);
  assert.equal(await h.invoke('complete-ocr-area', { x: 0, y: 0, width: -10, height: 50 }), null);
  assert.equal(h.evaluate('ocrArea'), null);
});
