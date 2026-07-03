const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlayApi', {
  openSrt: () => ipcRenderer.invoke('open-srt'),
  translate: (text) => ipcRenderer.invoke('translate', text),
  readScreenSubtitle: () => ipcRenderer.invoke('read-screen-subtitle'),
  selectOcrArea: () => ipcRenderer.invoke('select-ocr-area'),
  completeOcrArea: (area) => ipcRenderer.invoke('complete-ocr-area', area),
  cancelOcrArea: () => ipcRenderer.invoke('cancel-ocr-area'),
  restoreWindow: () => ipcRenderer.invoke('restore-window'),
  moveWindow: (dx, dy) => ipcRenderer.invoke('move-window', dx, dy),
  resizeWindow: (dw, dh) => ipcRenderer.invoke('resize-window', dw, dh),
  setWindowSize: (width, height) => ipcRenderer.invoke('set-window-size', width, height),
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
  }
});
