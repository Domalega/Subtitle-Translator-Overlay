const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_UI_SETTINGS, normalizeUiSettings } = require('../src/settings-store');

test('normalizeUiSettings merges old settings with defaults', () => {
  const settings = normalizeUiSettings({ theme: 'dark' });
  assert.equal(settings.theme, 'dark');
  assert.equal(settings.font, DEFAULT_UI_SETTINGS.font);
  assert.equal(settings.contextCount, DEFAULT_UI_SETTINGS.contextCount);
});

test('normalizeUiSettings keeps unknown fields', () => {
  const settings = normalizeUiSettings({ legacyGameField: 'keep' });
  assert.equal(settings.legacyGameField, 'keep');
});

test('normalizeUiSettings replaces invalid fontScale', () => {
  const settings = normalizeUiSettings({ fontScale: 'big' });
  assert.equal(settings.fontScale, DEFAULT_UI_SETTINGS.fontScale);
});

test('normalizeUiSettings clamps invalid windowWidth range', () => {
  const settings = normalizeUiSettings({ windowWidth: 10 });
  assert.equal(settings.windowWidth, 620);
});

test('normalizeUiSettings replaces invalid contextCount type', () => {
  const settings = normalizeUiSettings({ contextCount: 'many' });
  assert.equal(settings.contextCount, DEFAULT_UI_SETTINGS.contextCount);
});

test('normalizeUiSettings adds and validates near-source settings', () => {
  const settings = normalizeUiSettings({ displayMode: 'unknown', nearSourcePlacement: 'side', nearSourceBackgroundOpacity: 3, nearSourceFontSize: 2, nearSourceMaxWidth: 9999, nearSourceMaxLines: 0, nearSourceVerticalOffset: -2 });
  assert.equal(settings.displayMode, 'panel');
  assert.equal(settings.nearSourcePlacement, 'auto');
  assert.equal(settings.nearSourceBackgroundOpacity, 1);
  assert.equal(settings.nearSourceFontSize, 12);
  assert.equal(settings.nearSourceMaxWidth, 1400);
  assert.equal(settings.nearSourceMaxLines, 1);
  assert.equal(settings.nearSourceVerticalOffset, 0);
  assert.equal(normalizeUiSettings({}).displayMode, 'panel');
});

test('normalizeUiSettings migrates near-source display mode to both', () => {
  assert.equal(normalizeUiSettings({ displayMode: 'near-source' }).displayMode, 'both');
});
