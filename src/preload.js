const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlayApi', {
  openSrt: () => ipcRenderer.invoke('open-srt'),
  translate: (text) => ipcRenderer.invoke('translate', text),
  translateText: (text, sourceLanguage, targetLanguage) => ipcRenderer.invoke('translate-text', text, sourceLanguage, targetLanguage),
  getPhonetic: (word) => ipcRenderer.invoke('get-phonetic', word),
  dictionaryGet: () => ipcRenderer.invoke('dictionary-get'),
  dictionaryAdd: (entry) => ipcRenderer.invoke('dictionary-add', entry),
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
  onDictionaryChanged: (callback) => {
    ipcRenderer.on('dictionary-changed', callback);
  }
});
