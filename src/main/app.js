const { app, BrowserWindow, dialog, ipcMain, globalShortcut, desktopCapturer, nativeImage, screen, shell } = require('electron');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { createWorker } = require('tesseract.js');
const { PNG } = require('pngjs');
const { cleanScreenOcrText } = require('../shared/ocr/text-utils');
const { OcrWorkerService } = require('./services/ocr-worker-service');
const { calculateCropBounds } = require('../shared/ocr/crop-bounds');
const { FrameChangeDetector } = require('../shared/ocr/frame-change-detector');
const { detectSubtitleArea } = require('../shared/ocr/subtitle-area-detector');
const { OcrMetrics } = require('./services/ocr-metrics');
const { TranslationService } = require('./services/translation-service');
const { OcrDiagnosticSampleService } = require('./services/ocr-diagnostic-sample-service');
const { DEFAULT_UI_SETTINGS, normalizeUiSettings } = require('../shared/settings/settings-store');
const { calculateNearSourceBounds } = require('../shared/output/near-source-position');

const UI_SMOKE = process.env.UI_SMOKE === '1';
if (UI_SMOKE) app.setPath('userData', path.join(require('node:os').tmpdir(), `subtitle-overlay-ui-smoke-${process.pid}`));
if (UI_SMOKE) {
  process.on('uncaughtException', (error) => {
    console.error('UI smoke uncaught exception:', error.stack || error.message);
    app.exit(1);
  });
}
app.disableHardwareAcceleration();
const singleInstanceLock = app.requestSingleInstanceLock();

let mainWindow;
let selectionWindow;
let settingsWindow;
let dictionaryWindow;
let captureWindow;
let translateWindow;
let nearSourceWindow;
let developerOcrZoneWindow;
let developerSubtitleCandidateWindow;
let gameOcrWorkerPromise;
let ocrArea = null;
let ocrAnchorBoundsDip = null;
let nearSourceContent = null;
let nearSourceSettings = normalizeUiSettings(DEFAULT_UI_SETTINGS);
let detectedSubtitleBoundsDip = null;
let subtitleDetectionBusy = false;

function developerZoneColor(theme) {
  return ({ green: '#41d17c', blue: '#4ca8ff', purple: '#b07cff', dark: '#d7dce2', nothing: '#222222', 'nothing-dark': '#eeeeee', 'nothing-os-light': '#222222', 'nothing-os-dark': '#eeeeee' })[theme] || '#41d17c';
}

function excludeWindowFromScreenCapture(window) {
  // Electron 31 uses WDA_EXCLUDEFROMCAPTURE on supported Windows versions.
  try { window.setContentProtection(true); } catch (_) {}
}

function sendDeveloperStatus(stage, details = {}) {
  if (loadUiSettings().developerMode === true) mainWindow?.webContents.send('developer-status', { stage, ...details });
}

function updateDeveloperOcrZone(settings = loadUiSettings()) {
  const enabled = settings.developerMode === true;
  if (!enabled || !ocrAnchorBoundsDip) {
    if (developerOcrZoneWindow && !developerOcrZoneWindow.isDestroyed()) developerOcrZoneWindow.hide();
    return;
  }
  const border = 2;
  const bounds = { x: Math.round(ocrAnchorBoundsDip.x - border), y: Math.round(ocrAnchorBoundsDip.y - border), width: Math.round(ocrAnchorBoundsDip.width + border * 2), height: Math.round(ocrAnchorBoundsDip.height + border * 2) };
  if (!developerOcrZoneWindow || developerOcrZoneWindow.isDestroyed()) {
    developerOcrZoneWindow = new BrowserWindow({ ...bounds, transparent: true, frame: false, alwaysOnTop: true, skipTaskbar: true, focusable: false, resizable: false, show: false, webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false } });
    developerOcrZoneWindow.setAlwaysOnTop(true, 'screen-saver');
    excludeWindowFromScreenCapture(developerOcrZoneWindow);
    developerOcrZoneWindow.setIgnoreMouseEvents(true);
    developerOcrZoneWindow.loadFile(path.join(__dirname, '..', 'renderer', 'overlays', 'developer-zone', 'developer-ocr-zone.html'));
    developerOcrZoneWindow.webContents.once('did-finish-load', () => { developerOcrZoneWindow?.webContents.send('developer-ocr-zone-theme', developerZoneColor(settings.theme)); developerOcrZoneWindow?.showInactive(); });
    developerOcrZoneWindow.on('closed', () => { developerOcrZoneWindow = null; });
  } else {
    developerOcrZoneWindow.setBounds(bounds);
    developerOcrZoneWindow.webContents.send('developer-ocr-zone-theme', developerZoneColor(settings.theme));
    if (!developerOcrZoneWindow.isVisible()) developerOcrZoneWindow.showInactive();
  }
}

function updateDeveloperSubtitleCandidateZone(settings = loadUiSettings()) {
  if (settings.developerMode !== true) {
    if (developerSubtitleCandidateWindow && !developerSubtitleCandidateWindow.isDestroyed()) developerSubtitleCandidateWindow.close();
    return;
  }
  if (!detectedSubtitleBoundsDip) {
    if (developerSubtitleCandidateWindow && !developerSubtitleCandidateWindow.isDestroyed()) developerSubtitleCandidateWindow.hide();
    return;
  }
  const border = 2;
  const bounds = {
    x: Math.round(detectedSubtitleBoundsDip.x - border),
    y: Math.round(detectedSubtitleBoundsDip.y - border),
    width: Math.max(1, Math.round(detectedSubtitleBoundsDip.width + border * 2)),
    height: Math.max(1, Math.round(detectedSubtitleBoundsDip.height + border * 2))
  };
  if (!developerSubtitleCandidateWindow || developerSubtitleCandidateWindow.isDestroyed()) {
    developerSubtitleCandidateWindow = new BrowserWindow({ ...bounds, transparent: true, frame: false, alwaysOnTop: true, skipTaskbar: true, focusable: false, resizable: false, show: false, webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false } });
    developerSubtitleCandidateWindow.setAlwaysOnTop(true, 'screen-saver');
    excludeWindowFromScreenCapture(developerSubtitleCandidateWindow);
    developerSubtitleCandidateWindow.setIgnoreMouseEvents(true);
    developerSubtitleCandidateWindow.loadFile(path.join(__dirname, '..', 'renderer', 'overlays', 'developer-zone', 'developer-subtitle-candidate.html'));
    developerSubtitleCandidateWindow.webContents.once('did-finish-load', () => { developerSubtitleCandidateWindow?.webContents.send('developer-subtitle-candidate-state', { visible: true }); developerSubtitleCandidateWindow?.showInactive(); });
    developerSubtitleCandidateWindow.on('closed', () => { developerSubtitleCandidateWindow = null; });
  } else {
    developerSubtitleCandidateWindow.setBounds(bounds);
    if (!developerSubtitleCandidateWindow.isVisible()) developerSubtitleCandidateWindow.showInactive();
  }
}

function displayForSubtitleDetection() {
  return ocrAnchorBoundsDip ? screen.getDisplayMatching(ocrAnchorBoundsDip) : screen.getPrimaryDisplay();
}

function subtitleCandidateBoundsDip(candidate, imageSize, display) {
  const scaleX = display.size.width / imageSize.width;
  const scaleY = display.size.height / imageSize.height;
  return {
    x: display.bounds.x + candidate.x * scaleX,
    y: display.bounds.y + candidate.y * scaleY,
    width: candidate.width * scaleX,
    height: candidate.height * scaleY
  };
}
let gameOcrBusy = false;
let gameModeEnabled = false;
const gameTranslationCache = new Map();
const gameDictionaryCache = new Map();
const translationService = new TranslationService({ fetch: (...args) => fetch(...args) });
const ocrMetrics = new OcrMetrics();
const screenOcrWorker = new OcrWorkerService({
  createWorker,
  logger: (message) => {
    const request = message.request;
    if (message.status === 'recognizing text' && request) {
      mainWindow?.webContents.send('ocr-progress', { type: 'progress', requestId: request.requestId, generation: request.generation, progress: Math.round(message.progress * 100) });
      if (process.env.OCR_DEBUG === '1') console.debug('[OCR] progress', { requestId: request.requestId, generation: request.generation, progress: Math.round(message.progress * 100) });
    }
    if (message.status === 'worker-ready') ocrMetrics.record(message);
  }
});
const frameChangeDetector = new FrameChangeDetector();
let screenFrameId = 0;
const ocrDiagnosticSamples = new OcrDiagnosticSampleService({ getUserDataPath: () => app.getPath('userData'), getAppVersion: () => app.getVersion() });
const pendingDiagnosticFrames = new Map();

function rememberDiagnosticFrame(frameId, sourceImage, captureMode, display) {
  pendingDiagnosticFrames.set(frameId, {
    sourceImage: Buffer.from(sourceImage),
    captureMode,
    ocrArea: ocrArea ? { ...ocrArea } : null,
    screen: { width: display.size.width, height: display.size.height, scaleFactor: display.scaleFactor || 1 }
  });
  while (pendingDiagnosticFrames.size > 2) pendingDiagnosticFrames.delete(pendingDiagnosticFrames.keys().next().value);
}

function dictionaryFilePath() {
  return path.join(app.getPath('userData'), 'dictionary.json');
}

async function readDictionary() {
  try {
    return JSON.parse(await fs.readFile(dictionaryFilePath(), 'utf8'));
  } catch (_error) {
    return [];
  }
}

async function writeDictionary(entries) {
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  await fs.writeFile(dictionaryFilePath(), JSON.stringify(entries, null, 2), 'utf8');
}

async function getGameOcrWorker() {
  if (!gameOcrWorkerPromise) {
    gameOcrWorkerPromise = createWorker('eng', 1, { logger: () => {} });
    gameOcrWorkerPromise = gameOcrWorkerPromise.then(async (worker) => {
      await worker.setParameters({ tessedit_pageseg_mode: '11' });
      return worker;
    });
  }
  return gameOcrWorkerPromise;
}

function cleanOcrText(text) {
  return cleanScreenOcrText(text);
}

function defaultOcrArea(imageSize) {
  const cropHeight = Math.round(imageSize.height * 0.18);
  const cropWidth = Math.round(imageSize.width * 0.58);
  return {
    x: Math.round((imageSize.width - cropWidth) / 2),
    y: Math.round(imageSize.height * 0.74),
    width: cropWidth,
    height: cropHeight
  };
}

function clampArea(area, imageSize) {
  const x = Math.max(0, Math.min(imageSize.width - 1, Math.round(area.x)));
  const y = Math.max(0, Math.min(imageSize.height - 1, Math.round(area.y)));
  const width = Math.max(20, Math.min(imageSize.width - x, Math.round(area.width)));
  const height = Math.max(20, Math.min(imageSize.height - y, Math.round(area.height)));
  return { x, y, width, height };
}

function subtitleMaskToPng(image) {
  const size = image.getSize();
  const source = image.toBitmap();
  const png = new PNG({ width: size.width, height: size.height });

  for (let index = 0; index < size.width * size.height; index += 1) {
    const sourceOffset = index * 4;
    const targetOffset = index * 4;
    const blue = source[sourceOffset];
    const green = source[sourceOffset + 1];
    const red = source[sourceOffset + 2];
    const brightness = Math.max(red, green, blue);
    const darkness = Math.min(red, green, blue);
    const saturation = brightness - darkness;
    const isSubtitlePixel = brightness > 175 && saturation < 95;
    const value = isSubtitlePixel ? 255 : 0;

    png.data[targetOffset] = value;
    png.data[targetOffset + 1] = value;
    png.data[targetOffset + 2] = value;
    png.data[targetOffset + 3] = 255;
  }

  return PNG.sync.write(png);
}

function createSelectionWindow() {
  const display = screen.getPrimaryDisplay();
  selectionWindow = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  selectionWindow.setAlwaysOnTop(true, 'screen-saver');
  selectionWindow.loadFile(path.join(__dirname, '..', 'renderer', 'capture', 'select.html'));
  selectionWindow.on('closed', () => {
    selectionWindow = null;
  });
}

function createToolWindow(fileName, title, width, height) {
  const existingWindow = fileName === 'renderer/settings/settings.html' ? settingsWindow : dictionaryWindow;
  if (existingWindow && !existingWindow.isDestroyed()) {
    existingWindow.show();
    existingWindow.focus();
    return existingWindow;
  }

  const toolWindow = new BrowserWindow({
    width,
    height,
    minWidth: 360,
    minHeight: 260,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    title,
    parent: mainWindow,
    show: !UI_SMOKE,
    paintWhenInitiallyHidden: UI_SMOKE,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  toolWindow.setAlwaysOnTop(true, 'screen-saver');
  toolWindow.loadFile(path.join(__dirname, '..', fileName));
  toolWindow.on('closed', () => {
    if (fileName === 'renderer/settings/settings.html') settingsWindow = null;
    if (fileName === 'renderer/dictionary/dictionary.html') dictionaryWindow = null;
  });

  if (fileName === 'renderer/settings/settings.html') settingsWindow = toolWindow;
  if (fileName === 'renderer/dictionary/dictionary.html') dictionaryWindow = toolWindow;
  return toolWindow;
}

function createCaptureWindow() {
  const display = screen.getPrimaryDisplay();
  captureWindow = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  captureWindow.setAlwaysOnTop(true, 'screen-saver');
  captureWindow.loadFile(path.join(__dirname, '..', 'renderer', 'capture', 'capture-select.html'));
  captureWindow.on('closed', () => {
    captureWindow = null;
  });
}

function createTranslateWindow() {
  if (translateWindow && !translateWindow.isDestroyed()) {
    translateWindow.show();
    translateWindow.focus();
    return translateWindow;
  }
  translateWindow = new BrowserWindow({
    width: 520,
    height: 580,
    minWidth: 380,
    minHeight: 420,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    title: 'Screen Translation',
    parent: mainWindow,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  translateWindow.setAlwaysOnTop(true, 'screen-saver');
  translateWindow.loadFile(path.join(__dirname, '..', 'legacy', 'translate-window.html'));
  translateWindow.on('closed', () => {
    translateWindow = null;
  });
  return translateWindow;
}

function sendNearSourceState() {
  if (!nearSourceWindow || nearSourceWindow.isDestroyed()) return;
  nearSourceWindow.webContents.send('near-source-overlay-settings', nearSourceSettings);
  if (nearSourceContent) nearSourceWindow.webContents.send('near-source-overlay-content', nearSourceContent);
  if (nearSourceContent) placeNearSourceOverlay();
}

function nearSourceOverlaySize(display) {
  const width = Math.max(240, Math.min(nearSourceSettings.nearSourceMaxWidth, display.workArea.width));
  const lineHeight = nearSourceSettings.nearSourceFontSize * 1.25;
  return { width, height: Math.max(40, Math.ceil(lineHeight * nearSourceSettings.nearSourceMaxLines + 20)) };
}

function createNearSourceWindow() {
  if (nearSourceWindow && !nearSourceWindow.isDestroyed()) return nearSourceWindow;
  nearSourceWindow = new BrowserWindow({
    width: 300,
    height: 100,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  nearSourceWindow.setAlwaysOnTop(true, 'screen-saver');
  excludeWindowFromScreenCapture(nearSourceWindow);
  nearSourceWindow.setIgnoreMouseEvents(true);
  nearSourceWindow.loadFile(path.join(__dirname, '..', 'renderer', 'overlays', 'near-source', 'near-source-overlay.html'));
  nearSourceWindow.webContents.once('did-finish-load', sendNearSourceState);
  nearSourceWindow.on('closed', () => { nearSourceWindow = null; });
  return nearSourceWindow;
}

function hideNearSourceOverlay() {
  if (nearSourceWindow && !nearSourceWindow.isDestroyed()) nearSourceWindow.hide();
}

function updateNearSourceSettings(settings) {
  nearSourceSettings = normalizeUiSettings({ ...nearSourceSettings, ...settings });
  if (nearSourceWindow && !nearSourceWindow.isDestroyed()) {
    nearSourceWindow.webContents.send('near-source-overlay-settings', nearSourceSettings);
    if (nearSourceContent) placeNearSourceOverlay();
  }
}

function isNearSourceEnabled() {
  return ['overlay', 'both'].includes(nearSourceSettings.displayMode) && !gameModeEnabled;
}

function showNearSourceOverlay(payload) {
  if (!isNearSourceEnabled() || !ocrAnchorBoundsDip || typeof payload?.text !== 'string' || !payload.text.trim()) return false;
  nearSourceContent = { text: payload.text };
  const window = createNearSourceWindow();
  if (process.env.OCR_DEBUG === '1') console.debug('[OCR] overlay show requested', { textLength: payload.text.length });
  if (!window.webContents.isLoading()) {
    window.webContents.send('near-source-overlay-content', nearSourceContent);
    placeNearSourceOverlay();
  }
  return true;
}

function placeNearSourceOverlay() {
  if (!isNearSourceEnabled() || !nearSourceContent || !ocrAnchorBoundsDip) return false;
  const window = createNearSourceWindow();
  const display = screen.getDisplayMatching(ocrAnchorBoundsDip);
  const overlaySize = nearSourceOverlaySize(display);
  const bounds = calculateNearSourceBounds({
    anchorBounds: ocrAnchorBoundsDip,
    overlaySize,
    workArea: display.workArea,
    placement: nearSourceSettings.nearSourcePlacement,
    verticalOffset: nearSourceSettings.nearSourceVerticalOffset
  });
  const currentBounds = window.getBounds();
  if (currentBounds.x !== bounds.x || currentBounds.y !== bounds.y || currentBounds.width !== bounds.width || currentBounds.height !== bounds.height) {
    try { window.setBounds(bounds); } catch (error) { console.error('[Near source overlay] positioning failed', error); return false; }
  }
  if (!window.isVisible()) window.showInactive();
  if (process.env.OCR_DEBUG === '1') console.debug('[OCR] overlay shown', { width: bounds.width, height: bounds.height });
  return true;
}

async function runCaptureTranslate(area) {
  if (gameOcrBusy) return;
  gameOcrBusy = true;

  try {
    const display = screen.getPrimaryDisplay();
    const scale = display.scaleFactor || 1;
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: display.size.width, height: display.size.height }
    });
    const source = sources[0];
    if (!source) return;

    const image = nativeImage.createFromDataURL(source.thumbnail.toDataURL());
    const cropArea = {
      x: Math.round(area.x * scale),
      y: Math.round(area.y * scale),
      width: Math.round(area.width * scale),
      height: Math.round(area.height * scale)
    };
    const crop = image.crop(cropArea);
    const pngBuffer = crop.toPNG();

    const worker = await getGameOcrWorker();
    const result = await worker.recognize(pngBuffer);

    const text = cleanGameOcrText(result.data.text);
    const words = extractGameWords(text);

    await refreshDictionaryCache();

    if (!text || text.length < 3) {
      mainWindow?.webContents.send('capture-result', { original: '', translation: '', words: [] });
      return;
    }

    const cacheKey = text.toLowerCase().trim();
    let translation = gameTranslationCache.get(cacheKey);
    if (!translation) {
      translation = await translateText(text, 'en', 'ru', 'game');
      if (translation) gameTranslationCache.set(cacheKey, translation);
    }

    const wordEntries = words.map((w) => ({
      english: w,
      russian: ''
    }));

    mainWindow?.webContents.send('capture-result', {
      original: text,
      translation: translation || '',
      words: wordEntries
    });
  } catch (error) {
    console.error('Capture translate error:', error);
  } finally {
    gameOcrBusy = false;
  }
}

function cleanGameOcrText(text) {
  return text
    .replace(/[|_{}[\]<>~`^]/g, '')
    .replace(/[^a-zA-Z0-9 .,!?'"\-:;()[\]\n]/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ +/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length >= 3 && /[a-zA-Z]{2}/.test(l))
    .join('\n')
    .trim();
}

function extractGameWords(text) {
  const seen = new Set();
  return text
    .split(/[\s\n,.;:!?()[\]]+/)
    .map((w) => w.replace(/^['"]+|['"]+$/g, '').trim())
    .filter((w) => w.length >= 3 && /^[a-zA-Z'-]+$/.test(w))
    .filter((w) => {
      const lower = w.toLowerCase();
      if (seen.has(lower)) return false;
      seen.add(lower);
      return true;
    })
    .slice(0, 30);
}

async function refreshDictionaryCache() {
  const entries = await readDictionary();
  gameDictionaryCache.clear();
  entries.forEach((e) => {
    const word = (e.english || '').toLowerCase().trim();
    if (word) gameDictionaryCache.set(word, true);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 360,
    minWidth: 620,
    minHeight: 260,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: false,
    show: !UI_SMOKE,
    paintWhenInitiallyHidden: UI_SMOKE,
    title: 'Subtitle Translation Overlay',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  excludeWindowFromScreenCapture(mainWindow);
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'main', 'index.html'));

  mainWindow.on('closed', () => {
    if (nearSourceWindow && !nearSourceWindow.isDestroyed()) nearSourceWindow.close();
    if (developerOcrZoneWindow && !developerOcrZoneWindow.isDestroyed()) developerOcrZoneWindow.close();
    if (developerSubtitleCandidateWindow && !developerSubtitleCandidateWindow.isDestroyed()) developerSubtitleCandidateWindow.close();
    nearSourceWindow = null;
    mainWindow = null;
    globalShortcut.unregisterAll();
    screenOcrWorker.dispose().catch(() => {});
    if (gameOcrWorkerPromise) {
      gameOcrWorkerPromise.then((worker) => worker.terminate()).catch(() => {});
    }
    app.quit();
  });

  globalShortcut.register('CommandOrControl+Shift+O', () => {
    restoreMainWindow();
  });

  globalShortcut.register('CommandOrControl+Shift+H', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('toggle-controls');
    }
  });

  globalShortcut.register('CommandOrControl+Shift+S', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('stop-ocr');
      restoreMainWindow();
    }
  });

  const uiSettings = loadUiSettings();
  const savedOcrArea = uiSettings.ocrArea;
  if (savedOcrArea && [savedOcrArea.x, savedOcrArea.y, savedOcrArea.width, savedOcrArea.height].every(Number.isFinite)
    && savedOcrArea.width > 0 && savedOcrArea.height > 0) {
    const display = screen.getPrimaryDisplay();
    const scale = display.scaleFactor || 1;
    ocrArea = {
      x: savedOcrArea.x * scale,
      y: savedOcrArea.y * scale,
      width: savedOcrArea.width * scale,
      height: savedOcrArea.height * scale
    };
    ocrAnchorBoundsDip = {
      x: display.bounds.x + savedOcrArea.x,
      y: display.bounds.y + savedOcrArea.y,
      width: savedOcrArea.width,
      height: savedOcrArea.height
    };
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow?.webContents.send('ocr-area-changed', ocrArea);
    });
  }
  updateNearSourceSettings(uiSettings);
  updateDeveloperOcrZone(uiSettings);
  updateDeveloperSubtitleCandidateZone(uiSettings);
  registerGameHotkey(uiSettings.hotkey || 'CommandOrControl+Shift+T');
}

async function runUiSmokeTest() {
  console.log('UI smoke test: loading windows.');
  const failures = [];
  const reportFailure = (message) => failures.push(message);
  const evaluate = (window, source, name) => Promise.race([
    window.webContents.executeJavaScript(source),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${name} evaluation timed out`)), 5000))
  ]);
  const watchWindow = (window, name) => {
    window.webContents.on('did-fail-load', (_event, code, description, url) => reportFailure(`${name} failed to load ${url}: ${code} ${description}`));
    window.webContents.on('render-process-gone', (_event, details) => reportFailure(`${name} renderer exited: ${details.reason}`));
    window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      if (level >= 3) reportFailure(`${name} console error at ${sourceId}:${line}: ${message}`);
    });
  };
  try {
    watchWindow(mainWindow, 'main');
    mainWindow.setPosition(-10000, -10000);
    mainWindow.showInactive();
    await new Promise((resolve) => setTimeout(resolve, 100));
    console.log('UI smoke test: main window checked.');
    settingsWindow = createToolWindow('renderer/settings/settings.html', 'Settings', 560, 760);
    dictionaryWindow = createToolWindow('renderer/dictionary/dictionary.html', 'Dictionary', 720, 620);
    // Off-screen windows receive native control layout without appearing to the user.
    for (const window of [settingsWindow, dictionaryWindow]) {
      window.setPosition(-10000, -10000);
      window.showInactive();
    }
    developerOcrZoneWindow = new BrowserWindow({
      width: 120,
      height: 80,
      show: false,
      paintWhenInitiallyHidden: true,
      frame: false,
      webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false }
    });
    developerOcrZoneWindow.loadFile(path.join(__dirname, '..', 'renderer', 'overlays', 'developer-zone', 'developer-ocr-zone.html'));
    watchWindow(settingsWindow, 'settings');
    watchWindow(dictionaryWindow, 'dictionary');
    if (developerOcrZoneWindow) watchWindow(developerOcrZoneWindow, 'developer overlay');
    await new Promise((resolve) => setTimeout(resolve, 100));
    console.log('UI smoke test: tool windows checked.');

    const mainResult = await evaluate(mainWindow, `(() => {
      const ids = ['playPause', 'ocrOnce', 'settingsToggle', 'dictionaryOpen', 'gameModeToggle', 'findSubtitleArea'];
      document.getElementById('playPause').click();
      document.getElementById('playPause').click();
      document.getElementById('ocrOnce').click();
      return { missing: ids.filter((id) => !document.getElementById(id)), preload: Boolean(window.overlayApi), enabled: ids.filter((id) => document.getElementById(id)?.disabled) };
    })()`, 'main');
    if (mainResult.missing.length || !mainResult.preload || mainResult.enabled.length) reportFailure(`main controls failed: ${JSON.stringify(mainResult)}`);

    const settingsResult = await evaluate(settingsWindow, `new Promise((resolve) => setTimeout(() => {
      const displayMode = document.getElementById('displayMode');
      displayMode.value = 'both'; displayMode.dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelectorAll('.accordionHeader').forEach((header) => {
        if (!header.classList.contains('open')) header.click();
      });
      const checkboxes = [...document.querySelectorAll('input[type="checkbox"]')];
      const ranges = [...document.querySelectorAll('input[type="range"]')];
      const select = document.getElementById('themeSelect');
      select.value = 'blue'; select.dispatchEvent(new Event('change', { bubbles: true }));
      const visible = [...checkboxes, ...ranges].every((element) => getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden');
      const sized = [...checkboxes, ...ranges].every((element) => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0);
      setTimeout(() => resolve({ checkboxes: checkboxes.length, ranges: ranges.length, visible, sized, theme: document.body.dataset.theme, enabled: !document.getElementById('resetDefaults').disabled }), 100);
    }, 50))`, 'settings');
    if (!settingsResult.checkboxes || !settingsResult.ranges || !settingsResult.visible || !settingsResult.sized || settingsResult.theme !== 'blue' || !settingsResult.enabled) reportFailure(`Settings controls failed: ${JSON.stringify(settingsResult)}`);

    const appliedTheme = await evaluate(mainWindow, `document.querySelector('.panel').dataset.theme`, 'main theme');
    if (appliedTheme !== 'blue') reportFailure(`main theme did not change: ${appliedTheme}`);

    const dictionaryResult = await evaluate(dictionaryWindow, `(() => {
      const list = document.getElementById('dictionaryList');
      const sort = document.getElementById('dictionarySort');
      sort.value = 'alpha-asc'; sort.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('dictionaryNext').click();
      const rect = list?.getBoundingClientRect();
      return { list: Boolean(list), context: Boolean(document.getElementById('contextContent')), visible: rect?.width > 0 && rect?.height > 0, sort: sort.value };
    })()`, 'dictionary');
    if (!dictionaryResult.list || !dictionaryResult.context || !dictionaryResult.visible || dictionaryResult.sort !== 'alpha-asc') reportFailure(`Dictionary controls failed: ${JSON.stringify(dictionaryResult)}`);
  } catch (error) {
    reportFailure(error.stack || error.message);
  }
  setTimeout(() => {
    if (failures.length) {
      console.error(`UI smoke test failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
      app.exit(1);
    } else {
      console.log('UI smoke test passed.');
      app.exit(0);
    }
  }, 100);
}

function restoreMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setIgnoreMouseEvents(false);
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.focus();
  mainWindow.webContents.send('window-restored');
}

async function translateText(text, sourceLanguage, targetLanguage, scope = null) {
  return translationService.translate(text, sourceLanguage, targetLanguage, scope ? { scope } : {});
}

async function getEnglishPhonetic(word) {
  const normalizedWord = word.toLowerCase().replace(/[^a-z'-]/g, '').trim();
  if (!normalizedWord) return '';

  const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(normalizedWord)}`);
  if (!response.ok) return '';

  const data = await response.json();
  const phonetics = data?.[0]?.phonetics || [];
  return phonetics.find((item) => item.text)?.text || data?.[0]?.phonetic || '';
}

if (!singleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    restoreMainWindow();
  });

  app.whenReady().then(() => {
    createWindow();
    if (UI_SMOKE) {
      console.log('UI smoke test: app ready.');
      runUiSmokeTest();
      return;
    }
    screenOcrWorker.initialize().catch((error) => {
      if (process.env.OCR_DEBUG === '1') console.debug('[OCR] worker warm-up failed:', error.message);
    });
  });
}

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  screenOcrWorker.dispose().catch(() => {});
  if (gameOcrWorkerPromise) {
    gameOcrWorkerPromise.then((worker) => worker.terminate()).catch(() => {});
  }
  app.quit();
});

ipcMain.handle('open-srt', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose English .srt subtitles',
    properties: ['openFile'],
    filters: [{ name: 'SubRip subtitles', extensions: ['srt'] }]
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  const filePath = result.filePaths[0];
  const content = await fs.readFile(filePath, 'utf8');
  return { fileName: path.basename(filePath), content };
});

ipcMain.handle('restore-window', () => {
  restoreMainWindow();
  return true;
});

ipcMain.handle('move-window', (_event, dx, dy) => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const [x, y] = mainWindow.getPosition();
  mainWindow.setPosition(x + Number(dx || 0), y + Number(dy || 0));
  return true;
});

ipcMain.handle('resize-window', (_event, dw, dh) => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const [width, height] = mainWindow.getSize();
  mainWindow.setSize(
    Math.max(420, width + Number(dw || 0)),
    Math.max(180, height + Number(dh || 0))
  );
  return true;
});

ipcMain.handle('set-window-size', (_event, width, height) => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  mainWindow.setSize(
    Math.max(620, Number(width || 0)),
    Math.max(260, Number(height || 0))
  );
  return true;
});

ipcMain.handle('open-settings-window', () => {
  createToolWindow('renderer/settings/settings.html', 'Subtitle Overlay Settings', 600, 620);
});

ipcMain.handle('open-dictionary-window', () => {
  createToolWindow('renderer/dictionary/dictionary.html', 'Subtitle Dictionary', 680, 560);
});

ipcMain.handle('close-current-window', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window && window !== mainWindow) window.close();
  return true;
});

ipcMain.handle('set-ui-setting', async (_event, key, value) => {
  const settings = loadUiSettings();
  settings[key] = value;
  const normalized = normalizeUiSettings(settings);
  await saveUiSettings(normalized);
  updateNearSourceSettings(normalized);
  if (key === 'developerMode' || key === 'theme') {
    updateDeveloperOcrZone(normalized);
    updateDeveloperSubtitleCandidateZone(normalized);
  }
  if (!['overlay', 'both'].includes(normalized.displayMode)) hideNearSourceOverlay();
  const appliedValue = normalized[key];
  mainWindow?.webContents.send('apply-ui-setting', { key, value: appliedValue });
  settingsWindow?.webContents.send('apply-ui-setting', { key, value: appliedValue });
  dictionaryWindow?.webContents.send('apply-ui-setting', { key, value: appliedValue });
  return true;
});

ipcMain.handle('get-ui-settings', () => loadUiSettings());

ipcMain.handle('reload-ui-settings', () => {
  const settings = loadUiSettings();
  mainWindow?.webContents.send('apply-ui-settings', settings);
  settingsWindow?.webContents.send('apply-ui-settings', settings);
  dictionaryWindow?.webContents.send('apply-ui-settings', settings);
  return settings;
});

ipcMain.handle('select-ocr-area', () => {
  if (!selectionWindow) createSelectionWindow();
});

ipcMain.handle('complete-ocr-area', async (_event, area) => {
  if (!area || ![area.x, area.y, area.width, area.height].every(Number.isFinite)) return null;
  const display = screen.getPrimaryDisplay();
  const scale = display.scaleFactor || 1;
  ocrArea = {
    x: area.x * scale,
    y: area.y * scale,
    width: area.width * scale,
    height: area.height * scale
  };
  ocrAnchorBoundsDip = {
    x: display.bounds.x + area.x,
    y: display.bounds.y + area.y,
    width: area.width,
    height: area.height
  };
  frameChangeDetector.reset();
  const settings = loadUiSettings();
  settings.ocrArea = { x: area.x, y: area.y, width: area.width, height: area.height };
  await saveUiSettings(settings);

  selectionWindow?.close();
  mainWindow?.webContents.send('ocr-area-changed', ocrArea);
  settingsWindow?.webContents.send('ocr-area-changed', ocrArea);
  updateDeveloperOcrZone(settings);
  return ocrArea;
});

ipcMain.handle('cancel-ocr-area', () => {
  selectionWindow?.close();
});

ipcMain.handle('translate', async (_event, text, scope) => {
  return translateText(text, 'en', 'ru', scope || null);
});

ipcMain.handle('translate-text', async (_event, text, sourceLanguage, targetLanguage, scope) => {
  return translateText(text, sourceLanguage, targetLanguage, scope || null);
});

ipcMain.handle('get-phonetic', async (_event, word) => {
  return getEnglishPhonetic(word);
});

ipcMain.handle('dictionary-get', async () => {
  return readDictionary();
});

ipcMain.handle('dictionary-add', async (_event, entry) => {
  const entries = await readDictionary();
  const duplicate = entries.some((item) => (
    (item.english || '').toLowerCase() === (entry.english || '').toLowerCase()
    || (item.russian || '').toLowerCase() === (entry.russian || '').toLowerCase()
  ));

  if (duplicate) return { added: false, duplicate: true };

  const nextEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    addedAt: Date.now()
  };
  entries.push(nextEntry);
  await writeDictionary(entries);
  gameDictionaryCache.set((entry.english || '').toLowerCase().trim(), true);
  dictionaryWindow?.webContents.send('dictionary-changed');
  return { added: true, entry: nextEntry };
});

ipcMain.handle('dictionary-delete', async (_event, id) => {
  let entries = await readDictionary();
  entries = entries.filter(entry => entry.id !== id);
  await writeDictionary(entries);
  dictionaryWindow?.webContents.send('dictionary-changed');
  return { success: true };
});

ipcMain.handle('get-context-sentences', async (_event, word) => {
  const normalizedWord = word.toLowerCase().replace(/[^a-z'-]/g, '').trim();
  if (!normalizedWord) return [];

  const settings = loadUiSettings();
  const maxCount = settings.contextCount || 5;
  const sentences = [];

  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(normalizedWord)}`);
    const addedExamples = new Set();

    if (response.ok) {
      const data = await response.json();
      if (data && Array.isArray(data)) {
        for (const entry of data) {
          if (entry.meanings && Array.isArray(entry.meanings)) {
            for (const meaning of entry.meanings) {
              if (meaning.definitions && Array.isArray(meaning.definitions)) {
                for (const definition of meaning.definitions) {
                  if (definition.example && sentences.length < maxCount) {
                    const example = definition.example.trim();
                    if (example.length > 10 && !addedExamples.has(example)) {
                      const translated = await translateText(example, 'en', 'ru');
                      sentences.push({ english: example, russian: translated });
                      addedExamples.add(example);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error fetching context sentences:', error);
  }

  if (sentences.length > 0) return sentences;

  const templates = [
    `I learned a new ${normalizedWord} today.`,
    `Can you explain what "${normalizedWord}" means?`,
    `The ${normalizedWord} is very interesting.`,
    `She used the ${normalizedWord} correctly.`,
    `I need to understand the ${normalizedWord} better.`
  ].slice(0, maxCount);

  const fallbackSentences = [];
  for (const template of templates) {
    const translated = await translateText(template, 'en', 'ru');
    fallbackSentences.push({ english: template, russian: translated });
  }

  return fallbackSentences;
});

ipcMain.handle('export-dictionary', async (_event, entries, format) => {
  const result = await dialog.showSaveDialog(dictionaryWindow || mainWindow, {
    title: 'Export Dictionary',
    defaultPath: `dictionary.${format}`,
    filters: [
      format === 'csv' ? { name: 'CSV', extensions: ['csv'] } : { name: 'JSON', extensions: ['json'] }
    ]
  });

  if (result.canceled) return false;

  const filePath = result.filePath;

  if (format === 'csv') {
    const header = 'Word,Translation,Transcription,Date\n';
    const rows = entries.map(e =>
      `"${(e.english || e.sourceText || '').replace(/"/g, '""')}","${(e.russian || '').replace(/"/g, '""')}","${(e.transcription || '').replace(/"/g, '""')}","${e.addedAt ? new Date(e.addedAt).toISOString().slice(0, 10) : ''}"`
    ).join('\n');
    await fs.writeFile(filePath, '\uFEFF' + header + rows, 'utf8');
  } else {
    await fs.writeFile(filePath, JSON.stringify(entries.map(e => ({
      word: e.english || e.sourceText,
      translation: e.russian,
      transcription: e.transcription,
      date: e.addedAt ? new Date(e.addedAt).toISOString().slice(0, 10) : ''
    })), null, 2), 'utf8');
  }

  return true;
});

ipcMain.handle('capture-screen-subtitle-frame', async (_event, captureMode) => {
  if (!ocrArea) return null;
  const capturedAt = performance.now();
  const primaryDisplay = screen.getPrimaryDisplay();
  const scale = primaryDisplay.scaleFactor || 1;
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: Math.round(primaryDisplay.size.width * scale), height: Math.round(primaryDisplay.size.height * scale) }
  });
  const captureMs = performance.now() - capturedAt;
  const source = sources[0];
  if (!source) return null;
  const imageSize = source.thumbnail.getSize();
  const cropStartedAt = performance.now();
  const cropBounds = calculateCropBounds({
    imageSize,
    displaySize: { width: primaryDisplay.size.width * scale, height: primaryDisplay.size.height * scale },
    ocrArea
  });
  const crop = source.thumbnail.crop(cropBounds);
  const cropMs = performance.now() - cropStartedAt;
  const fingerprintStartedAt = performance.now();
  const change = frameChangeDetector.inspect(crop.toBitmap(), crop.getSize(), capturedAt);
  const frameFingerprintMs = performance.now() - fingerprintStartedAt;
  if (!change.changed) {
    sendDeveloperStatus('Capture: frame unchanged');
    if (process.env.OCR_DEBUG === '1') console.debug('[OCR] frame skipped', { reason: 'unchanged' });
    return null;
  }
  const sourcePng = crop.toPNG();
  const png = subtitleMaskToPng(crop);
  const frameId = ++screenFrameId;
  rememberDiagnosticFrame(frameId, sourcePng, captureMode === 'manual' ? 'manual' : 'automatic', primaryDisplay);
  const frame = {
    id: frameId,
    capturedAt,
    image: png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
    imageChanged: change.imageChanged,
    forced: change.forced
  };
  sendDeveloperStatus(change.imageChanged ? 'Capture: frame changed' : 'OCR: forced check');
  if (process.env.OCR_DEBUG === '1') {
    console.debug('[OCR] frame changed', { id: frame.id, imageBytes: frame.image.byteLength });
  }
  ocrMetrics.record({ frameId: frame.id, captureMs, cropMs, frameFingerprintMs });
  return frame;
});

function normalizeImageBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (value && Array.isArray(value.data)) return Buffer.from(value.data);
  return null;
}

ipcMain.handle('recognize-screen-subtitle-frame', async (_event, frame) => {
  if (process.env.OCR_DEBUG === '1') {
    const value = frame?.image;
    console.debug('[OCR handler]', {
      keys: frame && typeof frame === 'object' ? Object.keys(frame) : [],
      type: typeof frame,
      imageType: typeof value,
      constructor: value?.constructor?.name,
      isBuffer: Buffer.isBuffer(value),
      isUint8Array: value instanceof Uint8Array,
      isArrayBuffer: value instanceof ArrayBuffer,
      byteLength: value?.byteLength,
      id: frame?.id,
      generation: frame?.generation,
      imageChanged: frame?.imageChanged,
      forced: frame?.forced
    });
  }
  const image = normalizeImageBuffer(frame?.image);
  if (!image) throw new Error('Invalid OCR frame');
  if (process.env.OCR_DEBUG === '1') {
    console.debug('[OCR worker input]', { isBuffer: Buffer.isBuffer(image), constructor: image.constructor.name, byteLength: image.byteLength, id: frame.id, generation: frame.generation });
  }
  const startedAt = performance.now();
  const request = { requestId: frame.id, generation: frame.generation };
  mainWindow?.webContents.send('ocr-progress', { type: 'started', ...request });
  sendDeveloperStatus('OCR: frame queued', request);
  if (process.env.OCR_DEBUG === '1') console.debug('[OCR] started', request);
  try {
    const result = await screenOcrWorker.recognize(image, request);
    const text = cleanOcrText(result.data.text);
    const confidence = Number.isFinite(result.data.confidence) ? result.data.confidence : null;
    const ocrMs = performance.now() - startedAt;
    const diagnosticFrame = pendingDiagnosticFrames.get(frame.id);
    pendingDiagnosticFrames.delete(frame.id);
    if (diagnosticFrame) {
      ocrDiagnosticSamples.recordCompletedCycle({
        frameId: frame.id,
        sourceImage: diagnosticFrame.sourceImage,
        ocrInputImage: image,
        captureMode: diagnosticFrame.captureMode,
        ocrArea: diagnosticFrame.ocrArea,
        screen: diagnosticFrame.screen,
        ocr: { text, confidence, durationMs: ocrMs }
      });
    }
    if (process.env.OCR_DEBUG === '1') console.debug('[OCR] completed', { ...request, textLength: text.length, confidence });
    sendDeveloperStatus('OCR: accepted', request);
    return { text, confidence, metrics: { ...frame.metrics, workerInitMs: screenOcrWorker.workerInitMs, ocrMs } };
  } catch (error) {
    sendDeveloperStatus(error?.code === 'OCR_TIMEOUT' ? 'OCR worker: timeout, restarting' : 'OCR: rejected', request);
    if (process.env.OCR_DEBUG === '1') console.debug(error?.code === 'OCR_TIMEOUT' ? '[OCR] timeout' : '[OCR] failed', { ...request, message: error.message });
    throw error;
  } finally {
    mainWindow?.webContents.send('ocr-progress', { type: 'reset', ...request });
  }
});

ipcMain.handle('record-ocr-diagnostic-update', (_event, update) => {
  if (!update || typeof update !== 'object' || !Number.isFinite(update.frameId)) return false;
  const decision = update.decision;
  const translation = update.translation;
  if (decision && (typeof decision !== 'object' || typeof decision.accepted !== 'boolean' || typeof decision.reason !== 'string' || typeof decision.normalizedText !== 'string')) return false;
  if (translation && (typeof translation !== 'object' || typeof translation.requested !== 'boolean' || typeof translation.completed !== 'boolean' || (translation.durationMs !== null && !Number.isFinite(translation.durationMs)))) return false;
  return ocrDiagnosticSamples.updateLastCycle(update.frameId, { decision, translation });
});

ipcMain.handle('save-ocr-diagnostic-sample', async () => ocrDiagnosticSamples.saveLastSample());

ipcMain.handle('open-ocr-diagnostics-folder', async () => {
  try {
    await fs.mkdir(ocrDiagnosticSamples.diagnosticsPath(), { recursive: true });
    return (await shell.openPath(ocrDiagnosticSamples.diagnosticsPath())) === '';
  } catch (_) {
    return false;
  }
});

ipcMain.handle('find-subtitle-area', async () => {
  if (loadUiSettings().developerMode !== true) return { ok: false, error: 'DEVELOPER_MODE_DISABLED' };
  if (subtitleDetectionBusy) return { ok: false, error: 'DETECTION_BUSY' };
  subtitleDetectionBusy = true;
  const actionStartedAt = performance.now();
  try {
    const display = displayForSubtitleDetection();
    const scale = display.scaleFactor || 1;
    const captureStartedAt = performance.now();
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: Math.round(display.size.width * scale), height: Math.round(display.size.height * scale) }
    });
    const captureMs = performance.now() - captureStartedAt;
    const source = sources.find((entry) => entry.display_id === String(display.id)) || sources[0];
    if (!source) {
      detectedSubtitleBoundsDip = null;
      updateDeveloperSubtitleCandidateZone();
      sendDeveloperStatus('Detection: not found');
      return { ok: true, found: false, metrics: { captureMs, detectorMs: null, totalMs: performance.now() - actionStartedAt } };
    }
    const imageSize = source.thumbnail.getSize();
    const result = detectSubtitleArea({ width: imageSize.width, height: imageSize.height, data: source.thumbnail.toBitmap(), pixelOrder: 'bgra' });
    const totalMs = performance.now() - actionStartedAt;
    if (!result.found) {
      detectedSubtitleBoundsDip = null;
      updateDeveloperSubtitleCandidateZone();
      sendDeveloperStatus(`Detection: not found (${Math.round(result.metrics.durationMs)} ms, ${result.candidates.length} candidates)`);
      return { ok: true, found: false, metrics: { captureMs, detectorMs: result.metrics.durationMs, totalMs, candidates: 0 } };
    }
    detectedSubtitleBoundsDip = subtitleCandidateBoundsDip(result.bestCandidate, imageSize, display);
    updateDeveloperSubtitleCandidateZone();
    const candidate = result.bestCandidate;
    sendDeveloperStatus(`Detection: found score ${candidate.score}, confidence ${candidate.confidence}, ${Math.round(candidate.width)}x${Math.round(candidate.height)}, ${Math.round(result.metrics.durationMs)} ms, ${result.candidates.length} candidates`);
    return { ok: true, found: true, metrics: { captureMs, detectorMs: result.metrics.durationMs, totalMs, candidates: result.candidates.length } };
  } catch (error) {
    detectedSubtitleBoundsDip = null;
    updateDeveloperSubtitleCandidateZone();
    sendDeveloperStatus('Detection: not found');
    return { ok: false, error: 'DETECTION_FAILED' };
  } finally {
    subtitleDetectionBusy = false;
  }
});

ipcMain.handle('ocr-debug-metrics', (_event, metrics) => {
  ocrMetrics.record(metrics);
});

ipcMain.handle('start-capture-translate', () => {
  if (!captureWindow || captureWindow.isDestroyed()) createCaptureWindow();
});

ipcMain.handle('complete-capture-translate', (_event, area) => {
  captureWindow?.close();
  runCaptureTranslate(area);
});

ipcMain.handle('cancel-capture-translate', () => {
  captureWindow?.close();
});

const defaultGameSettings = {
  mode: 'hotkey',
  liveInterval: 5,
  cardWidth: 480,
  cardFontSize: 14,
  cardOpacity: 1
};

function gameSettingsPath() {
  return path.join(app.getPath('userData'), 'game-settings.json');
}

function loadGameSettings() {
  try {
    return JSON.parse(fsSync.readFileSync(gameSettingsPath(), 'utf8'));
  } catch (_) {
    return { ...defaultGameSettings };
  }
}

async function saveGameSettings(settings) {
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  await fs.writeFile(gameSettingsPath(), JSON.stringify(settings, null, 2), 'utf8');
}

const defaultUiSettings = DEFAULT_UI_SETTINGS;

function uiSettingsPath() {
  return path.join(app.getPath('userData'), 'ui-settings.json');
}

function loadUiSettings() {
  try {
    const settings = JSON.parse(fsSync.readFileSync(uiSettingsPath(), 'utf8'));
    return normalizeUiSettings(settings);
  } catch (_) {
    return normalizeUiSettings(defaultUiSettings);
  }
}

let uiSettingsSaveQueue = Promise.resolve();

async function saveUiSettings(settings) {
  uiSettingsSaveQueue = uiSettingsSaveQueue.then(async () => {
    await fs.mkdir(app.getPath('userData'), { recursive: true });
    await fs.writeFile(uiSettingsPath(), JSON.stringify(settings, null, 2), 'utf8');
  });
  return uiSettingsSaveQueue;
}

ipcMain.handle('open-translate-window', () => {
  createTranslateWindow();
});

ipcMain.handle('get-game-settings', () => loadGameSettings());

ipcMain.handle('set-game-setting', async (_event, key, value) => {
  const settings = loadGameSettings();
  settings[key] = value;
  await saveGameSettings(settings);
  return true;
});

ipcMain.handle('set-game-mode-enabled', (_event, enabled) => {
  gameModeEnabled = enabled;
  if (gameModeEnabled) hideNearSourceOverlay();
  return true;
});

ipcMain.handle('show-near-source-overlay', (_event, payload) => showNearSourceOverlay(payload));
ipcMain.handle('hide-near-source-overlay', () => { hideNearSourceOverlay(); return true; });
ipcMain.handle('clear-near-source-overlay', () => {
  nearSourceContent = null;
  hideNearSourceOverlay();
  return true;
});
ipcMain.handle('update-near-source-settings', (_event, settings) => {
  if (!settings || typeof settings !== 'object') return false;
  updateNearSourceSettings(settings);
  return true;
});
ipcMain.handle('near-source-overlay-measured', (_event, size) => placeNearSourceOverlay(size));

let currentGameHotkey = 'CommandOrControl+Shift+T';
function registerGameHotkey(accelerator) {
  try {
    globalShortcut.unregister(currentGameHotkey);
  } catch (_) {}
  currentGameHotkey = accelerator;
  try {
    globalShortcut.register(accelerator, () => {
      if (!gameModeEnabled) {
        mainWindow?.webContents.send('game-mode-disabled');
        return;
      }
      if (!captureWindow || captureWindow.isDestroyed()) createCaptureWindow();
    });
    return true;
  } catch (_) {
    return false;
  }
}

ipcMain.handle('set-game-hotkey', async (_event, accelerator) => {
  const ok = registerGameHotkey(accelerator);
  if (ok) {
    const settings = loadUiSettings();
    settings.hotkey = accelerator;
    await saveUiSettings(settings);
  }
  return ok;
});
