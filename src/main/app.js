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
const { SubtitleAreaTracker, STATES, isSimilarArea, stabilizeArea, clampAreaToScreen } = require('../shared/ocr/subtitle-area-tracker');
const { adaptSubtitleArea } = require('../shared/ocr/subtitle-area-adapter');
const { getActiveOcrArea: selectActiveOcrArea, physicalAreaToDip } = require('../shared/ocr/active-ocr-area');
const { captureAreaToDisplayDipArea, displayDipAreaToCaptureArea, clampCaptureArea, validateAreaMapping } = require('../shared/ocr/ocr-area-coordinates');
const { validateSubtitleCandidate, buildSubtitleEnvelope } = require('../shared/ocr/subtitle-candidate-validator');
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
let developerManualOcrZoneWindow;
let developerAutomaticOcrZoneWindow;
let developerSubtitleCandidateWindow;
let gameOcrWorkerPromise;
let ocrArea = null;
let ocrAnchorBoundsDip = null;
let manualOcrArea = null;
let manualOcrAnchorBoundsDip = null;
let automaticOcrArea = null;
let automaticOcrAnchorBoundsDip = null;
let automaticDisplayId = null;
let lastAutomaticBoundsDip = null;
let automaticAreaAdapterState = {};
let automaticAreaAdaptation = { lineCountEstimate: null, areaAdapted: null, adaptationReason: null, expandedTop: false, expandedBottom: false };
let nearSourceContent = null;
let nearSourceSettings = normalizeUiSettings(DEFAULT_UI_SETTINGS);
let detectedSubtitleBoundsDip = null;
let detectedSubtitleDisplayId = null;
let detectedSubtitleLocalArea = null;
let detectedSubtitleCaptureSize = null;
let automaticCaptureSize = null;
let automaticAreaRevision = 0;
let lastDetectionSample = null;
let subtitleDetectionBusy = false;
let subtitleDetectionRequestId = 0;
let subtitleDetectionRetryTimer = null;
let pendingDistantCandidate = null;
const subtitleAreaTracker = new SubtitleAreaTracker();
const subtitleTrackingMetrics = { globalSearches: 0, totalSearchMs: 0, reacquireCount: 0, lockedStartedAt: null, lockedMs: 0, captureCount: 0, ocrRequestCount: 0, acceptedSubtitleCount: 0, duplicateRejectedCount: 0, emptyResultCount: 0, fallbackCount: 0, detector640Ms: 0, fallbackDetectorMs: 0, automaticEmptyFrames: 0, recentOcrRequests: [], recentGlobalSearches: [] };

function getActiveOcrArea() {
  return selectActiveOcrArea({ manualArea: manualOcrArea, manualAnchorBoundsDip: manualOcrAnchorBoundsDip, automaticArea: automaticOcrArea, automaticAnchorBoundsDip: automaticOcrAnchorBoundsDip, automaticDisplayId });
}
function activeOcrArea() { return getActiveOcrArea()?.area || null; }
function activeOcrAnchorBoundsDip() { return getActiveOcrArea()?.anchorBoundsDip || null; }
function activeAreaSource() { return getActiveOcrArea()?.source || null; }
function syncActiveOcrArea() { const active = getActiveOcrArea(); ocrArea = active?.area || null; ocrAnchorBoundsDip = active?.anchorBoundsDip || null; }

function trackingDetails() {
  const snapshot = subtitleAreaTracker.snapshot();
  const visualizedAreaType = detectedSubtitleBoundsDip ? 'candidate' : activeAreaSource();
  const visualWindow = visualizedAreaType === 'candidate' ? developerSubtitleCandidateWindow : visualizedAreaType === 'automatic' ? developerAutomaticOcrZoneWindow : developerManualOcrZoneWindow;
  return {
    areaSource: activeAreaSource(), trackerState: snapshot.state, emptyDurationMs: snapshot.emptyDurationMs,
    lockedArea: automaticOcrArea ? { width: automaticOcrArea.width, height: automaticOcrArea.height } : null,
    lineCountEstimate: automaticAreaAdaptation.lineCountEstimate,
    areaAdapted: automaticAreaAdaptation.areaAdapted,
    adaptationReason: automaticAreaAdaptation.adaptationReason,
    expandedTop: automaticAreaAdaptation.expandedTop,
    expandedBottom: automaticAreaAdaptation.expandedBottom,
    lastGlobalSearchDurationMs: subtitleTrackingMetrics.globalSearches ? subtitleTrackingMetrics.totalSearchMs / subtitleTrackingMetrics.globalSearches : null,
    reacquireCount: subtitleTrackingMetrics.reacquireCount,
    captureCount: subtitleTrackingMetrics.captureCount, ocrRequestCount: subtitleTrackingMetrics.ocrRequestCount,
    acceptedSubtitleCount: subtitleTrackingMetrics.acceptedSubtitleCount, duplicateRejectedCount: subtitleTrackingMetrics.duplicateRejectedCount,
    emptyResultCount: subtitleTrackingMetrics.emptyResultCount, fallbackCount: subtitleTrackingMetrics.fallbackCount,
    detector640Ms: Math.round(subtitleTrackingMetrics.detector640Ms), fallbackDetectorMs: Math.round(subtitleTrackingMetrics.fallbackDetectorMs),
    ocrRequestsPerMinute: subtitleTrackingMetrics.recentOcrRequests.length, globalSearchesPerMinute: subtitleTrackingMetrics.recentGlobalSearches.length
    , visualizedAreaType, activeOcrArea: ocrArea ? { ...ocrArea } : null,
    overlayWindow: visualWindow && !visualWindow.isDestroyed() ? (visualWindow.isVisible() ? 'visible' : 'hidden') : 'destroyed'
    , detection: lastDetectionSample?.status || null
  };
}

function sendTrackingStatus(stage) { sendDeveloperStatus(stage, trackingDetails()); }

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

function updateDeveloperZone({ window, setWindow, getWindow, boundsDip, type, settings }) {
  if (settings.developerMode !== true || !boundsDip) {
    if (window && !window.isDestroyed()) window.hide();
    return;
  }
  const border = 2;
  const bounds = { x: Math.round(boundsDip.x - border), y: Math.round(boundsDip.y - border), width: Math.max(1, Math.round(boundsDip.width + border * 2)), height: Math.max(1, Math.round(boundsDip.height + border * 2)) };
  if (!window || window.isDestroyed()) {
    const created = new BrowserWindow({ ...bounds, transparent: true, frame: false, alwaysOnTop: true, skipTaskbar: true, focusable: false, resizable: false, show: false, webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false } });
    setWindow(created);
    created.setAlwaysOnTop(true, 'screen-saver'); excludeWindowFromScreenCapture(created); created.setIgnoreMouseEvents(true);
    created.loadFile(path.join(__dirname, '..', 'renderer', 'overlays', 'developer-zone', 'developer-ocr-zone.html'));
    created.webContents.once('did-finish-load', () => {
      if (getWindow() !== created || created.isDestroyed() || loadUiSettings().developerMode !== true) return;
      created.webContents.send('developer-ocr-zone-theme', developerZoneColor(settings.theme));
      created.webContents.send('developer-ocr-zone-style', type);
      created.webContents.send('developer-ocr-zone-state', { type, bounds: boundsDip });
      if (!created.isDestroyed()) created.showInactive();
    });
    created.on('closed', () => {
      if (type === 'manual' && developerManualOcrZoneWindow === created) developerManualOcrZoneWindow = null;
      if (type === 'automatic' && developerAutomaticOcrZoneWindow === created) developerAutomaticOcrZoneWindow = null;
      if (mainWindow && !mainWindow.isDestroyed()) setTimeout(() => updateDeveloperOcrZone(), 0);
    });
  } else {
    window.setBounds(bounds); window.webContents.send('developer-ocr-zone-theme', developerZoneColor(settings.theme)); window.webContents.send('developer-ocr-zone-style', type); window.webContents.send('developer-ocr-zone-state', { type, bounds: boundsDip });
    if (!window.isVisible()) window.showInactive();
  }
}

function updateDeveloperOcrZone(settings = loadUiSettings()) {
  updateDeveloperZone({ window: developerManualOcrZoneWindow, setWindow: (value) => { developerManualOcrZoneWindow = value; }, getWindow: () => developerManualOcrZoneWindow, boundsDip: manualOcrAnchorBoundsDip, type: 'manual', settings });
  updateDeveloperZone({ window: developerAutomaticOcrZoneWindow, setWindow: (value) => { developerAutomaticOcrZoneWindow = value; }, getWindow: () => developerAutomaticOcrZoneWindow, boundsDip: automaticOcrAnchorBoundsDip, type: 'automatic', settings });
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
    const created = developerSubtitleCandidateWindow;
    created.webContents.once('did-finish-load', () => { if (developerSubtitleCandidateWindow === created && !created.isDestroyed()) { created.webContents.send('developer-subtitle-candidate-state', { visible: true }); created.showInactive(); } });
    created.on('closed', () => { if (developerSubtitleCandidateWindow === created) developerSubtitleCandidateWindow = null; });
  } else {
    developerSubtitleCandidateWindow.setBounds(bounds);
    if (!developerSubtitleCandidateWindow.isVisible()) developerSubtitleCandidateWindow.showInactive();
  }
}

function displayForSubtitleDetection() {
  return ocrAnchorBoundsDip ? screen.getDisplayMatching(ocrAnchorBoundsDip) : screen.getPrimaryDisplay();
}

function subtitleCandidateBoundsDip(candidate, imageSize, display) { return captureAreaToDisplayDipArea(clampCaptureArea(candidate, imageSize), imageSize, display.bounds); }

function setAutomaticAreaFromCandidate(candidateCaptureArea, captureSize, display, { reacquired = false } = {}) {
  const relative = clampCaptureArea(candidateCaptureArea, captureSize);
  const candidateBoundsDip = captureAreaToDisplayDipArea(relative, captureSize, display.bounds);
  const previousRelative = automaticOcrAnchorBoundsDip && automaticDisplayId === display.id ? {
    x: automaticOcrAnchorBoundsDip.x - display.bounds.x, y: automaticOcrAnchorBoundsDip.y - display.bounds.y,
    width: automaticOcrAnchorBoundsDip.width, height: automaticOcrAnchorBoundsDip.height
  } : null;
  const stable = stabilizeArea(previousRelative, relative, display.size);
  automaticOcrArea = displayDipAreaToCaptureArea(stable, captureSize, display.bounds);
  automaticCaptureSize = { ...captureSize };
  automaticOcrAnchorBoundsDip = captureAreaToDisplayDipArea(automaticOcrArea, automaticCaptureSize, display.bounds);
  automaticAreaRevision += 1;
  lastAutomaticBoundsDip = { ...automaticOcrAnchorBoundsDip };
  automaticDisplayId = display.id;
  automaticAreaAdapterState = {};
  automaticAreaAdaptation = { lineCountEstimate: null, areaAdapted: null, adaptationReason: null, expandedTop: false, expandedBottom: false };
  syncActiveOcrArea();
  frameChangeDetector.reset();
  if (reacquired) subtitleTrackingMetrics.reacquireCount += 1;
  subtitleTrackingMetrics.lockedStartedAt = performance.now();
  updateDeveloperOcrZone();
  mainWindow?.webContents.send('ocr-area-changed', ocrArea);
}

function stopAutomaticTracking() {
  if (subtitleTrackingMetrics.lockedStartedAt) subtitleTrackingMetrics.lockedMs += performance.now() - subtitleTrackingMetrics.lockedStartedAt;
  subtitleTrackingMetrics.lockedStartedAt = null;
  subtitleAreaTracker.dispatch('manualStop');
  automaticOcrArea = null;
  automaticCaptureSize = null;
  automaticOcrAnchorBoundsDip = null;
  automaticDisplayId = null;
  lastAutomaticBoundsDip = null;
  automaticAreaAdapterState = {};
  automaticAreaAdaptation = { lineCountEstimate: null, areaAdapted: null, adaptationReason: null, expandedTop: false, expandedBottom: false };
  pendingDistantCandidate = null;
  clearTimeout(subtitleDetectionRetryTimer);
  subtitleDetectionRetryTimer = null;
  syncActiveOcrArea();
  frameChangeDetector.reset();
  updateDeveloperOcrZone();
  mainWindow?.webContents.send('ocr-area-changed', ocrArea);
  sendTrackingStatus('Auto tracking stopped');
}

function adaptAutomaticArea(source, display, imageSize, capturedAt) {
  if (!automaticOcrArea) return null;
  const guard = Math.max(16, Math.round(imageSize.height * 0.02));
  const guardBounds = clampCaptureArea({ ...automaticOcrArea, y: automaticOcrArea.y - guard, height: automaticOcrArea.height + guard * 2 }, imageSize);
  const guardCrop = source.thumbnail.crop(guardBounds);
  const result = adaptSubtitleArea({
    area: automaticOcrArea,
    screen: imageSize,
    image: { width: guardCrop.getSize().width, height: guardCrop.getSize().height, data: guardCrop.toBitmap(), pixelOrder: 'bgra', originY: guardBounds.y },
    state: automaticAreaAdapterState,
    now: capturedAt
  });
  automaticAreaAdapterState = result.state;
  automaticAreaAdaptation = { lineCountEstimate: result.lineCountEstimate, areaAdapted: result.changed, adaptationReason: result.reason, expandedTop: result.expandedTop, expandedBottom: result.expandedBottom };
  if (!result.changed) return null;
  automaticOcrArea = result.area;
  automaticCaptureSize = { ...imageSize };
  automaticOcrAnchorBoundsDip = captureAreaToDisplayDipArea(automaticOcrArea, automaticCaptureSize, display.bounds);
  automaticAreaRevision += 1;
  lastAutomaticBoundsDip = { ...automaticOcrAnchorBoundsDip };
  syncActiveOcrArea();
  updateDeveloperOcrZone();
  sendTrackingStatus(`Auto area adapted: ${result.reason}`);
  return result;
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
    tracking: { state: subtitleAreaTracker.state, ...trackingDetails() },
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

function hasTextLikePixels(image) {
  const bitmap = image.toBitmap();
  let count = 0;
  for (let index = 0; index < bitmap.length; index += 16) {
    const maximum = Math.max(bitmap[index], bitmap[index + 1], bitmap[index + 2]);
    const minimum = Math.min(bitmap[index], bitmap[index + 1], bitmap[index + 2]);
    if (maximum > 175 && maximum - minimum < 110 && ++count >= 12) return true;
  }
  return false;
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
    if (developerManualOcrZoneWindow && !developerManualOcrZoneWindow.isDestroyed()) developerManualOcrZoneWindow.close();
    if (developerAutomaticOcrZoneWindow && !developerAutomaticOcrZoneWindow.isDestroyed()) developerAutomaticOcrZoneWindow.close();
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
    manualOcrArea = {
      x: savedOcrArea.x * scale,
      y: savedOcrArea.y * scale,
      width: savedOcrArea.width * scale,
      height: savedOcrArea.height * scale
    };
    manualOcrAnchorBoundsDip = {
      x: display.bounds.x + savedOcrArea.x,
      y: display.bounds.y + savedOcrArea.y,
      width: savedOcrArea.width,
      height: savedOcrArea.height
    };
    syncActiveOcrArea();
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
    watchWindow(settingsWindow, 'settings');
    watchWindow(dictionaryWindow, 'dictionary');
    await new Promise((resolve) => setTimeout(resolve, 100));
    console.log('UI smoke test: tool windows checked.');

    const mainResult = await evaluate(mainWindow, `(() => {
      const ids = ['playPause', 'ocrOnce', 'settingsToggle', 'dictionaryOpen', 'gameModeToggle', 'findSubtitleArea', 'useDetectedSubtitleArea', 'stopAutoTracking', 'saveDetectionSample'];
      document.getElementById('playPause').click();
      document.getElementById('playPause').click();
      document.getElementById('ocrOnce').click();
      const tools = document.getElementById('developerTools');
      const hiddenBefore = tools.hidden;
      document.dispatchEvent(new CustomEvent('developer-mode-changed', { detail: { enabled: true } }));
      const visibleAfter = !tools.hidden;
      document.dispatchEvent(new CustomEvent('developer-mode-changed', { detail: { enabled: false } }));
      const hiddenAfter = tools.hidden;
      const developerInside = ['saveOcrSample', 'saveDetectionSample', 'openOcrDiagnostics', 'findSubtitleArea', 'useDetectedSubtitleArea', 'stopAutoTracking'].every((id) => tools.contains(document.getElementById(id)));
      const mainOutside = ['playPause', 'ocrOnce', 'settingsToggle', 'dictionaryOpen', 'gameModeToggle'].every((id) => !tools.contains(document.getElementById(id)));
      return { missing: ids.filter((id) => !document.getElementById(id)), preload: Boolean(window.overlayApi), enabled: ids.filter((id) => document.getElementById(id)?.disabled), hiddenBefore, visibleAfter, hiddenAfter, developerInside, mainOutside };
    })()`, 'main');
    if (mainResult.missing.length || !mainResult.preload || mainResult.enabled.length || !mainResult.hiddenBefore || !mainResult.visibleAfter || !mainResult.hiddenAfter || !mainResult.developerInside || !mainResult.mainOutside) reportFailure(`main controls failed: ${JSON.stringify(mainResult)}`);

    const settingsResult = await evaluate(settingsWindow, `new Promise((resolve) => setTimeout(() => {
      const displayMode = document.getElementById('displayMode');
      const headers = [...document.querySelectorAll('.accordionHeader')];
      const initiallyClosed = headers.every((header) => !header.classList.contains('open')) && [...document.querySelectorAll('.accordionBody')].every((body) => !body.classList.contains('open'));
      const displayHeader = document.querySelector('[data-section="display"]');
      displayHeader.click(); const displayOpens = displayHeader.classList.contains('open');
      displayHeader.click(); const displayCloses = !displayHeader.classList.contains('open');
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
      setTimeout(() => resolve({ checkboxes: checkboxes.length, ranges: ranges.length, visible, sized, theme: document.body.dataset.theme, enabled: !document.getElementById('resetDefaults').disabled, initiallyClosed, displayOpens, displayCloses }), 100);
    }, 50))`, 'settings');
    if (!settingsResult.checkboxes || !settingsResult.ranges || !settingsResult.visible || !settingsResult.sized || settingsResult.theme !== 'blue' || !settingsResult.enabled || !settingsResult.initiallyClosed || !settingsResult.displayOpens || !settingsResult.displayCloses) reportFailure(`Settings controls failed: ${JSON.stringify(settingsResult)}`);

    settingsWindow.close();
    await new Promise((resolve) => setTimeout(resolve, 50));
    settingsWindow = createToolWindow('renderer/settings/settings.html', 'Settings', 560, 760);
    settingsWindow.setPosition(-10000, -10000); settingsWindow.showInactive(); watchWindow(settingsWindow, 'settings reopened');
    const reopenedSettings = await evaluate(settingsWindow, `new Promise((resolve) => setTimeout(() => resolve({ closed: [...document.querySelectorAll('.accordionHeader')].every((header) => !header.classList.contains('open')) && [...document.querySelectorAll('.accordionBody')].every((body) => !body.classList.contains('open')), display: !document.querySelector('[data-section="display"]').classList.contains('open'), mode: document.getElementById('displayMode').value, theme: document.getElementById('themeSelect').value }), 100))`, 'settings reopened');
    if (!reopenedSettings.closed || !reopenedSettings.display || reopenedSettings.mode !== 'both' || reopenedSettings.theme !== 'blue') reportFailure(`Settings reopen failed: ${JSON.stringify(reopenedSettings)}`);

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
    const invalidateAutomaticArea = () => {
      if (!automaticOcrArea) return;
      subtitleAreaTracker.dispatch('screenChanged');
      automaticOcrArea = null;
      automaticOcrAnchorBoundsDip = null;
      automaticDisplayId = null;
      syncActiveOcrArea();
      frameChangeDetector.reset();
      updateDeveloperOcrZone();
      mainWindow?.webContents.send('ocr-area-changed', ocrArea);
      sendTrackingStatus('Auto area lost: display changed');
      scheduleTrackedSearch();
    };
    screen.on('display-metrics-changed', invalidateAutomaticArea);
    screen.on('display-added', invalidateAutomaticArea);
    screen.on('display-removed', invalidateAutomaticArea);
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
  manualOcrArea = {
    x: area.x * scale,
    y: area.y * scale,
    width: area.width * scale,
    height: area.height * scale
  };
  manualOcrAnchorBoundsDip = {
    x: display.bounds.x + area.x,
    y: display.bounds.y + area.y,
    width: area.width,
    height: area.height
  };
  if (!automaticOcrArea) syncActiveOcrArea();
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
  const active = getActiveOcrArea();
  if (!active) return null;
  const capturedAt = performance.now();
  subtitleTrackingMetrics.captureCount += 1;
  const display = automaticDisplayId ? screen.getAllDisplays().find((entry) => entry.id === automaticDisplayId) : screen.getDisplayMatching(activeOcrAnchorBoundsDip() || screen.getPrimaryDisplay().bounds);
  if (!display) return null;
  const scale = display.scaleFactor || 1;
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: Math.round(display.size.width * scale), height: Math.round(display.size.height * scale) }
  });
  const captureMs = performance.now() - capturedAt;
  const source = sources.find((entry) => entry.display_id === String(display.id)) || sources[0];
  if (!source) return null;
  const imageSize = source.thumbnail.getSize();
  const cropStartedAt = performance.now();
  if (automaticOcrArea) adaptAutomaticArea(source, display, imageSize, capturedAt);
  const currentActive = getActiveOcrArea();
  if (!currentActive) return null;
  const cropBounds = automaticOcrArea ? clampCaptureArea(currentActive.area, imageSize) : calculateCropBounds({ imageSize, displaySize: { width: display.size.width * scale, height: display.size.height * scale }, ocrArea: currentActive.area });
  const crop = source.thumbnail.crop(cropBounds);
  const cropMs = performance.now() - cropStartedAt;
  const fingerprintStartedAt = performance.now();
  const change = frameChangeDetector.inspect(crop.toBitmap(), crop.getSize(), capturedAt);
  const frameFingerprintMs = performance.now() - fingerprintStartedAt;
  if (!change.changed) {
    sendTrackingStatus('Capture: frame unchanged');
    if (process.env.OCR_DEBUG === '1') console.debug('[OCR] frame skipped', { reason: 'unchanged' });
    return null;
  }
  const sourcePng = crop.toPNG();
  const png = subtitleMaskToPng(crop);
  const frameId = ++screenFrameId;
  rememberDiagnosticFrame(frameId, sourcePng, activeAreaSource() || (captureMode === 'manual' ? 'manual' : 'automatic'), display);
  const frame = {
    id: frameId,
    capturedAt,
    image: png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
    imageChanged: change.imageChanged,
    forced: change.forced,
    textLike: hasTextLikePixels(crop)
  };
  sendTrackingStatus(change.imageChanged ? 'Capture: frame changed' : 'OCR: forced check');
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
  subtitleTrackingMetrics.ocrRequestCount += 1;
  subtitleTrackingMetrics.recentOcrRequests.push(startedAt);
  subtitleTrackingMetrics.recentOcrRequests = subtitleTrackingMetrics.recentOcrRequests.filter((time) => startedAt - time < 60000);
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
        tracking: diagnosticFrame.tracking,
        ocr: { text, confidence, durationMs: ocrMs }
      });
    }
    if (automaticOcrArea) {
      const event = /[a-zA-Z]{2}/.test(text) ? 'textDetected' : 'emptyFrame';
      subtitleTrackingMetrics.automaticEmptyFrames = event === 'emptyFrame' ? subtitleTrackingMetrics.automaticEmptyFrames + 1 : 0;
      if (subtitleTrackingMetrics.automaticEmptyFrames >= 2) automaticAreaAdapterState = {};
      const tracking = subtitleAreaTracker.dispatch(event);
      if (tracking.action === 'markLost') {
        sendTrackingStatus('Auto area lost');
        scheduleTrackedSearch();
      } else if (tracking.state === STATES.POSSIBLE_LOST) {
        sendTrackingStatus('Auto area possible-lost');
      }
    }
    if (process.env.OCR_DEBUG === '1') console.debug('[OCR] completed', { ...request, textLength: text.length, confidence });
    sendTrackingStatus('OCR: accepted');
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
  if (decision?.accepted && decision.reason === 'accepted') subtitleTrackingMetrics.acceptedSubtitleCount += 1;
  if (decision && ['same', 'similar'].includes(decision.reason)) subtitleTrackingMetrics.duplicateRejectedCount += 1;
  if (decision?.reason === 'empty') subtitleTrackingMetrics.emptyResultCount += 1;
  return ocrDiagnosticSamples.updateLastCycle(update.frameId, { decision, translation });
});

ipcMain.handle('save-ocr-diagnostic-sample', async () => ocrDiagnosticSamples.saveLastSample());

ipcMain.handle('save-detection-sample', async () => {
  if (!lastDetectionSample?.sourceImage) return { ok: false, error: 'NO_DETECTION_SAMPLE' };
  const name = `detection-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const folder = path.join(ocrDiagnosticSamples.diagnosticsPath(), name);
  try {
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(folder, 'detection-source.png'), lastDetectionSample.sourceImage);
    if (lastDetectionSample.candidateImage) await fs.writeFile(path.join(folder, 'detection-candidate.png'), lastDetectionSample.candidateImage);
    await fs.writeFile(path.join(folder, 'detection-metadata.json'), JSON.stringify(lastDetectionSample.status, null, 2), 'utf8');
    return { ok: true };
  } catch (_) { return { ok: false, error: 'SAVE_FAILED' }; }
});

ipcMain.handle('open-ocr-diagnostics-folder', async () => {
  try {
    await fs.mkdir(ocrDiagnosticSamples.diagnosticsPath(), { recursive: true });
    return (await shell.openPath(ocrDiagnosticSamples.diagnosticsPath())) === '';
  } catch (_) {
    return false;
  }
});

async function findSubtitleArea({ tracking = false } = {}) {
  if (loadUiSettings().developerMode !== true) return { ok: false, error: 'DEVELOPER_MODE_DISABLED' };
  if (subtitleDetectionBusy) return { ok: false, error: 'DETECTION_BUSY' };
  subtitleDetectionBusy = true;
  const requestId = ++subtitleDetectionRequestId;
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
      detectedSubtitleDisplayId = null;
      detectedSubtitleLocalArea = null;
      detectedSubtitleCaptureSize = null;
      updateDeveloperSubtitleCandidateZone();
      if (tracking) subtitleAreaTracker.dispatch('candidateNotFound');
      sendTrackingStatus('Detection: not found');
      return { ok: true, found: false, metrics: { captureMs, detectorMs: null, totalMs: performance.now() - actionStartedAt } };
    }
    const imageSize = source.thumbnail.getSize();
    const screenshot = { width: imageSize.width, height: imageSize.height, data: source.thumbnail.toBitmap(), pixelOrder: 'bgra' };
    const result = detectSubtitleArea(screenshot);
    subtitleTrackingMetrics.detector640Ms += result.metrics.primaryDurationMs || result.metrics.durationMs || 0;
    subtitleTrackingMetrics.fallbackDetectorMs += result.metrics.fallbackDurationMs || 0;
    if (result.metrics.fallbackUsed) subtitleTrackingMetrics.fallbackCount += 1;
    const totalMs = performance.now() - actionStartedAt;
    const detectorSize = { width: result.metrics.analyzedWidth, height: result.metrics.analyzedHeight };
    const seedCandidate = result.bestCandidate ? clampCaptureArea(result.bestCandidate, imageSize) : null;
    let candidateBeforeValidation = seedCandidate ? buildSubtitleEnvelope(screenshot, seedCandidate) : null;
    let validation = candidateBeforeValidation ? validateSubtitleCandidate(screenshot, candidateBeforeValidation) : { valid: false, reason: 'detector-not-found' };
    if (validation.status === 'incomplete') {
      candidateBeforeValidation = clampCaptureArea({ x: candidateBeforeValidation.x - 24, y: candidateBeforeValidation.y - 8, width: candidateBeforeValidation.width + 48, height: candidateBeforeValidation.height + 16 }, imageSize);
      validation = validateSubtitleCandidate(screenshot, candidateBeforeValidation);
    }
    const candidateDip = candidateBeforeValidation ? subtitleCandidateBoundsDip(candidateBeforeValidation, imageSize, display) : null;
    const roundTrip = candidateBeforeValidation ? validateAreaMapping(candidateBeforeValidation, imageSize, display.bounds) : { valid: false, roundTrip: null };
    let confirmedBySecondFrame = false;
    if (validation.valid && (validation.status === 'accepted-low-confidence' || (result.bestCandidate.score || 0) < 70)) {
      await new Promise((resolve) => setTimeout(resolve, 180));
      const secondSources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: Math.round(display.size.width * scale), height: Math.round(display.size.height * scale) } });
      const secondSource = secondSources.find((entry) => entry.display_id === String(display.id)) || secondSources[0];
      if (secondSource) {
        const secondSize = secondSource.thumbnail.getSize(); const secondImage = { width: secondSize.width, height: secondSize.height, data: secondSource.thumbnail.toBitmap(), pixelOrder: 'bgra' };
        const secondResult = detectSubtitleArea(secondImage); const secondArea = secondResult.bestCandidate ? buildSubtitleEnvelope(secondImage, clampCaptureArea(secondResult.bestCandidate, secondSize)) : null;
        const secondValidation = secondArea ? validateSubtitleCandidate(secondImage, secondArea) : { valid: false, reason: 'second-frame-not-found' };
        confirmedBySecondFrame = Boolean(secondValidation.valid && secondArea && isSimilarArea(candidateBeforeValidation, secondArea, 0.45));
        if (!confirmedBySecondFrame) validation = { ...validation, valid: false, reason: 'second-frame-mismatch' };
      } else validation = { ...validation, valid: false, reason: 'second-frame-unavailable' };
    }
    const detectorCandidate = result.bestCandidate && detectorSize.width ? { x: Math.round(result.bestCandidate.x * detectorSize.width / imageSize.width), y: Math.round(result.bestCandidate.y * detectorSize.height / imageSize.height), width: Math.round(result.bestCandidate.width * detectorSize.width / imageSize.width), height: Math.round(result.bestCandidate.height * detectorSize.height / imageSize.height) } : null;
    lastDetectionSample = {
      sourceImage: source.thumbnail.toPNG(), candidateImage: candidateBeforeValidation && validation.valid ? source.thumbnail.crop(candidateBeforeValidation).toPNG() : null,
      status: { displayId: display.id, displayDipBounds: display.bounds, scaleFactor: scale, captureImage: imageSize, detectorImage: detectorSize, detectorArea: detectorCandidate, captureArea: candidateBeforeValidation, displayDipArea: candidateDip, activeOcrCaptureArea: getActiveOcrArea()?.area || null, activeOcrDisplayDipArea: getActiveOcrArea()?.anchorBoundsDip || null, validation, coordinateRoundTrip: roundTrip, secondFrameConfirmed: confirmedBySecondFrame, accepted: Boolean(result.found && validation.valid && roundTrip.valid), detectorLevel: result.metrics.fallbackUsed ? 1024 : 640 }
    };
    if (!result.found || !validation.valid || !roundTrip.valid) {
      detectedSubtitleBoundsDip = null;
      detectedSubtitleDisplayId = null;
      detectedSubtitleLocalArea = null;
      detectedSubtitleCaptureSize = null;
      updateDeveloperSubtitleCandidateZone();
      if (tracking) subtitleAreaTracker.dispatch('candidateNotFound');
      sendTrackingStatus(`Detection: not found (${validation.reason || 'no-candidate'})`);
      return { ok: true, found: false, metrics: { captureMs, detectorMs: result.metrics.durationMs, totalMs, candidates: 0 } };
    }
    if (requestId !== subtitleDetectionRequestId) return { ok: false, error: 'STALE_DETECTION' };
    detectedSubtitleLocalArea = candidateBeforeValidation;
    detectedSubtitleCaptureSize = { ...imageSize };
    detectedSubtitleBoundsDip = candidateDip;
    detectedSubtitleDisplayId = display.id;
    updateDeveloperSubtitleCandidateZone();
    const candidate = candidateBeforeValidation;
    if (tracking) acceptTrackedCandidate(candidateBeforeValidation, imageSize, display);
    sendTrackingStatus(`Detection: found score ${candidate.score}, confidence ${candidate.confidence}, ${Math.round(candidate.width)}x${Math.round(candidate.height)}, ${Math.round(result.metrics.durationMs)} ms, ${result.candidates.length} candidates`);
    return { ok: true, found: true, metrics: { captureMs, detectorMs: result.metrics.durationMs, totalMs, candidates: result.candidates.length } };
  } catch (error) {
    detectedSubtitleBoundsDip = null;
    detectedSubtitleDisplayId = null;
    detectedSubtitleLocalArea = null;
    detectedSubtitleCaptureSize = null;
    updateDeveloperSubtitleCandidateZone();
    if (tracking) subtitleAreaTracker.dispatch('candidateNotFound');
    sendTrackingStatus('Detection: not found');
    return { ok: false, error: 'DETECTION_FAILED' };
  } finally {
    const duration = performance.now() - actionStartedAt;
    subtitleTrackingMetrics.globalSearches += 1;
    subtitleTrackingMetrics.recentGlobalSearches.push(performance.now());
    subtitleTrackingMetrics.recentGlobalSearches = subtitleTrackingMetrics.recentGlobalSearches.filter((time) => performance.now() - time < 60000);
    subtitleTrackingMetrics.totalSearchMs += duration;
    subtitleDetectionBusy = false;
    if (tracking && subtitleAreaTracker.state === STATES.LOST) scheduleTrackedSearch();
  }
}

function acceptTrackedCandidate(candidate, captureSize, display) {
  const candidateDip = captureAreaToDisplayDipArea(candidate, captureSize, display.bounds);
  const previous = automaticOcrAnchorBoundsDip || lastAutomaticBoundsDip;
  if (previous && !isSimilarArea(previous, candidateDip)) {
    if (!pendingDistantCandidate || !isSimilarArea(pendingDistantCandidate, candidateDip)) {
      pendingDistantCandidate = candidateDip;
      scheduleTrackedSearch();
      return false;
    }
  }
  pendingDistantCandidate = null;
  subtitleAreaTracker.dispatch('candidateFound');
  setAutomaticAreaFromCandidate(candidate, captureSize, display, { reacquired: Boolean(previous) });
  return true;
}

function scheduleTrackedSearch() {
  if (subtitleDetectionBusy || subtitleDetectionRetryTimer || subtitleAreaTracker.state !== STATES.LOST) return;
  subtitleDetectionRetryTimer = setTimeout(async () => {
    subtitleDetectionRetryTimer = null;
    if (subtitleAreaTracker.state === STATES.LOST) await findSubtitleArea({ tracking: true });
  }, 2000);
}

ipcMain.handle('find-subtitle-area', () => findSubtitleArea());
ipcMain.handle('use-detected-subtitle-area', () => {
  const display = detectedSubtitleDisplayId ? screen.getAllDisplays().find((entry) => entry.id === detectedSubtitleDisplayId) : null;
  if (!detectedSubtitleBoundsDip || !display) return { ok: false, error: 'NO_DETECTED_AREA' };
  subtitleAreaTracker.dispatch('candidateFound');
  if (!detectedSubtitleLocalArea || !detectedSubtitleCaptureSize) return { ok: false, error: 'NO_DETECTED_AREA' };
  setAutomaticAreaFromCandidate(detectedSubtitleLocalArea, detectedSubtitleCaptureSize, display);
  detectedSubtitleBoundsDip = null;
  detectedSubtitleDisplayId = null;
  detectedSubtitleLocalArea = null;
  detectedSubtitleCaptureSize = null;
  updateDeveloperSubtitleCandidateZone();
  sendTrackingStatus('Auto area locked');
  return { ok: true, area: ocrArea, tracking: trackingDetails() };
});
ipcMain.handle('stop-auto-tracking', () => { stopAutomaticTracking(); return { ok: true, area: ocrArea, tracking: trackingDetails() }; });

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
