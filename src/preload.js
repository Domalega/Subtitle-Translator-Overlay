const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  if (typeof callback !== 'function') throw new TypeError('Event callback must be a function');
  const listener = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

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
  captureScreenSubtitleFrame: (captureMode) => ipcRenderer.invoke('capture-screen-subtitle-frame', captureMode === 'manual' ? 'manual' : 'automatic'),
  recognizeScreenSubtitleFrame: (frame) => {
    const payload = {
      id: Number(frame?.id),
      generation: Number(frame?.generation),
      areaRevision: Number(frame?.areaRevision),
      capturedAt: Number(frame?.capturedAt),
      imageChanged: Boolean(frame?.imageChanged),
      forced: Boolean(frame?.forced),
      textLike: Boolean(frame?.textLike),
      image: frame?.image
    };
    if (process.env.OCR_DEBUG === '1') {
      console.debug('[OCR preload]', { keys: Object.keys(payload), constructor: payload.image?.constructor?.name, byteLength: payload.image?.byteLength, id: payload.id, generation: payload.generation });
    }
    return ipcRenderer.invoke('recognize-screen-subtitle-frame', payload);
  },
  recordOcrMetrics: (metrics) => ipcRenderer.invoke('ocr-debug-metrics', metrics),
  recordOcrDiagnosticUpdate: (update) => ipcRenderer.invoke('record-ocr-diagnostic-update', update),
  saveOcrDiagnosticSample: () => ipcRenderer.invoke('save-ocr-diagnostic-sample'),
  saveDetectionSample: () => ipcRenderer.invoke('save-detection-sample'),
  openOcrDiagnosticsFolder: () => ipcRenderer.invoke('open-ocr-diagnostics-folder'),
  findSubtitleArea: () => ipcRenderer.invoke('find-subtitle-area'),
  useDetectedSubtitleArea: () => ipcRenderer.invoke('use-detected-subtitle-area'),
  stopAutoTracking: () => ipcRenderer.invoke('stop-auto-tracking'),
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
  onCaptureResult: (callback) => subscribe('capture-result', callback),
  onGameModeDisabled: (callback) => subscribe('game-mode-disabled', callback),
  onTranslateResult: (callback) => subscribe('translate-result', callback),
  onToggleControls: (callback) => subscribe('toggle-controls', callback),
  onWindowRestored: (callback) => subscribe('window-restored', callback),
  onStopOcr: (callback) => subscribe('stop-ocr', callback),
  onOcrProgress: (callback) => subscribe('ocr-progress', callback),
  onOcrAreaChanged: (callback) => subscribe('ocr-area-changed', callback),
  onApplyUiSetting: (callback) => subscribe('apply-ui-setting', callback),
  onApplyUiSettings: (callback) => subscribe('apply-ui-settings', callback),
  onDictionaryChanged: (callback) => subscribe('dictionary-changed', callback),
  onNearSourceOverlayContent: (callback) => subscribe('near-source-overlay-content', callback),
  onNearSourceOverlaySettings: (callback) => subscribe('near-source-overlay-settings', callback),
  onDeveloperOcrZoneTheme: (callback) => subscribe('developer-ocr-zone-theme', callback),
  onDeveloperOcrZoneStyle: (callback) => subscribe('developer-ocr-zone-style', callback),
  onDeveloperOcrZoneState: (callback) => subscribe('developer-ocr-zone-state', callback),
  onDeveloperSubtitleCandidateState: (callback) => subscribe('developer-subtitle-candidate-state', callback),
  onDeveloperStatus: (callback) => subscribe('developer-status', callback)
});
