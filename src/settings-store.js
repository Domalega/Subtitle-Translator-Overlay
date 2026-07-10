(function initSettingsStore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SettingsStore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createSettingsStore() {
  const DEFAULT_UI_SETTINGS = Object.freeze({
    theme: 'green',
    fontScale: 100,
    windowWidth: 980,
    windowHeight: 360,
    font: 'system',
    hotkey: 'CommandOrControl+Shift+T',
    deleteConfirm: true,
    contextCount: 5,
    displayMode: 'panel',
    nearSourcePlacement: 'auto',
    nearSourceVerticalOffset: 10,
    nearSourceFontSize: 24,
    nearSourceBackgroundOpacity: 0.70,
    nearSourceMaxWidth: 900,
    nearSourceMaxLines: 3
  });

  const THEMES = new Set(['green', 'blue', 'purple', 'dark', 'nothing', 'nothing-dark', 'nothing-os-light', 'nothing-os-dark']);
  const FONTS = new Set(['system', 'inter', 'segoe ui', 'arial', 'consolas', 'jetbrains mono', 'dot matrix']);

  function clampNumber(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, Math.round(number)));
  }

  function normalizeUiSettings(savedSettings = {}) {
    const source = savedSettings && typeof savedSettings === 'object' ? savedSettings : {};
    const merged = { ...source };

    merged.theme = THEMES.has(source.theme) ? source.theme : DEFAULT_UI_SETTINGS.theme;
    merged.font = FONTS.has(source.font) ? source.font : DEFAULT_UI_SETTINGS.font;
    merged.fontScale = clampNumber(source.fontScale, DEFAULT_UI_SETTINGS.fontScale, 70, 150);
    merged.windowWidth = clampNumber(source.windowWidth, DEFAULT_UI_SETTINGS.windowWidth, 620, 1500);
    merged.windowHeight = clampNumber(source.windowHeight, DEFAULT_UI_SETTINGS.windowHeight, 260, 760);
    merged.hotkey = typeof source.hotkey === 'string' && source.hotkey.trim()
      ? source.hotkey.trim()
      : DEFAULT_UI_SETTINGS.hotkey;
    merged.deleteConfirm = typeof source.deleteConfirm === 'boolean'
      ? source.deleteConfirm
      : DEFAULT_UI_SETTINGS.deleteConfirm;
    merged.contextCount = clampNumber(source.contextCount, DEFAULT_UI_SETTINGS.contextCount, 1, 10);
    merged.displayMode = source.displayMode === 'near-source' ? 'both'
      : ['panel', 'overlay', 'both'].includes(source.displayMode) ? source.displayMode : 'panel';
    merged.nearSourcePlacement = ['auto', 'below', 'above'].includes(source.nearSourcePlacement)
      ? source.nearSourcePlacement : DEFAULT_UI_SETTINGS.nearSourcePlacement;
    merged.nearSourceVerticalOffset = clampNumber(source.nearSourceVerticalOffset, DEFAULT_UI_SETTINGS.nearSourceVerticalOffset, 0, 100);
    merged.nearSourceFontSize = clampNumber(source.nearSourceFontSize, DEFAULT_UI_SETTINGS.nearSourceFontSize, 12, 64);
    const opacity = Number(source.nearSourceBackgroundOpacity);
    merged.nearSourceBackgroundOpacity = Number.isFinite(opacity)
      ? Math.min(1, Math.max(0.1, Math.round(opacity * 100) / 100))
      : DEFAULT_UI_SETTINGS.nearSourceBackgroundOpacity;
    merged.nearSourceMaxWidth = clampNumber(source.nearSourceMaxWidth, DEFAULT_UI_SETTINGS.nearSourceMaxWidth, 240, 1400);
    merged.nearSourceMaxLines = clampNumber(source.nearSourceMaxLines, DEFAULT_UI_SETTINGS.nearSourceMaxLines, 1, 6);

    return merged;
  }

  return { DEFAULT_UI_SETTINGS, normalizeUiSettings };
}));
