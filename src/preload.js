const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlayApi', {
  openSrt: () => ipcRenderer.invoke('open-srt'),
  translate: (text, scope) => ipcRenderer.invoke('translate', text, scope),
  translateText: (text, sourceLanguage, targetLanguage, scope) => ipcRenderer.invoke('translate-text', text, sourceLanguage, targetLanguage, scope),
  getPhonetic: (word) => ipcRenderer.invoke('get-phonetic', word),
  dictionaryGet: () => ipcRenderer.invoke('dictionary-get'),
  dictionaryAdd: (entry) => ipcRenderer.invoke('dictionary-add', entry),
  dictionaryDelete: (id) => ipcRenderer.invoke('dictionary-delete', id),
  getContextSentences: (word) => ipcRenderer.invoke('get-context-sentences', word),
  exportDictionary: (entries, format) => ipcRenderer.invoke('export-dictionary', entries, format),
  readScreenSubtitle: () => ipcRenderer.invoke('read-screen-subtitle'),
  selectOcrArea: () => ipcRenderer.invoke('select-ocr-area'),
  completeOcrArea: (area) => ipcRenderer.invoke('complete-ocr-area', area),
  cancelOcrArea: () => ipcRenderer.invoke('cancel-ocr-area'),
  restoreWindow: () => ipcRenderer.invoke('restore-window'),
  moveWindow: (dx, dy) => ipcRenderer.invoke('move-window', dx, dy),
  resizeWindow: (dw, dh) => ipcRenderer.invoke('resize-window', dw, dh),
  setWindowSize: (width, height) => ipcRenderer.invoke('set-window-size', width, height),
  openSettingsWindow: () => ipcRenderer.invoke('open-settings-window'),
  openDictionaryWindow: () => ipcRenderer.invoke('open-dictionary-window'),
  closeCurrentWindow: () => ipcRenderer.invoke('close-current-window'),
  setUiSetting: (key, value) => ipcRenderer.invoke('set-ui-setting', key, value),
  startCaptureTranslate: () => ipcRenderer.invoke('start-capture-translate'),
  completeCaptureTranslate: (area) => ipcRenderer.invoke('complete-capture-translate', area),
  cancelCaptureTranslate: () => ipcRenderer.invoke('cancel-capture-translate'),
  openTranslateWindow: () => ipcRenderer.invoke('open-translate-window'),
  setGameModeEnabled: (enabled) => ipcRenderer.invoke('set-game-mode-enabled', enabled),
  getUiSettings: () => ipcRenderer.invoke('get-ui-settings'),
  setGameHotkey: (accelerator) => ipcRenderer.invoke('set-game-hotkey', accelerator),
  getGameSettings: () => ipcRenderer.invoke('get-game-settings'),
  setGameSetting: (key, value) => ipcRenderer.invoke('set-game-setting', key, value),
  showNearSourceOverlay: (payload) => ipcRenderer.invoke('show-near-source-overlay', payload),
  hideNearSourceOverlay: () => ipcRenderer.invoke('hide-near-source-overlay'),
  clearNearSourceOverlay: () => ipcRenderer.invoke('clear-near-source-overlay'),
  updateNearSourceSettings: (settings) => ipcRenderer.invoke('update-near-source-settings', settings),
  nearSourceOverlayMeasured: (size) => ipcRenderer.invoke('near-source-overlay-measured', size),
  onCaptureResult: (callback) => {
    ipcRenderer.on('capture-result', (_event, data) => callback(data));
  },
  onGameModeDisabled: (callback) => {
    ipcRenderer.on('game-mode-disabled', callback);
  },
  onTranslateResult: (callback) => {
    ipcRenderer.on('translate-result', (_event, data) => callback(data));
  },
  onToggleControls: (callback) => {
    ipcRenderer.on('toggle-controls', callback);
  },
  onWindowRestored: (callback) => {
    ipcRenderer.on('window-restored', callback);
  },
  onStopOcr: (callback) => {
    ipcRenderer.on('stop-ocr', callback);
  },
  onOcrProgress: (callback) => {
    ipcRenderer.on('ocr-progress', (_event, progress) => callback(progress));
  },
  onOcrAreaChanged: (callback) => {
    ipcRenderer.on('ocr-area-changed', (_event, area) => callback(area));
  },
  onApplyUiSetting: (callback) => {
    ipcRenderer.on('apply-ui-setting', (_event, setting) => callback(setting));
  },
  onApplyUiSettings: (callback) => {
    ipcRenderer.on('apply-ui-settings', (_event, settings) => callback(settings));
  },
  onDictionaryChanged: (callback) => {
    ipcRenderer.on('dictionary-changed', callback);
  },
  onNearSourceOverlayContent: (callback) => {
    ipcRenderer.on('near-source-overlay-content', (_event, payload) => callback(payload));
  },
  onNearSourceOverlaySettings: (callback) => {
    ipcRenderer.on('near-source-overlay-settings', (_event, settings) => callback(settings));
  }
});
