const storage = {
  getItem(key) { try { return localStorage.getItem(key); } catch (_) { return null; } },
  setItem(key, value) { try { localStorage.setItem(key, value); } catch (_) {} },
  removeItem(key) { try { localStorage.removeItem(key); } catch (_) {} }
};
const playPauseButton = document.getElementById('playPause');
const ocrOnceButton = document.getElementById('ocrOnce');
const addWordButton = document.getElementById('addWord');
const dictionaryOpenButton = document.getElementById('dictionaryOpen');
const settingsToggleButton = document.getElementById('settingsToggle');
const statusElement = document.getElementById('status');
const englishTextElement = document.getElementById('englishText');
const russianTextElement = document.getElementById('russianText');
const panel = document.querySelector('.panel');
const { SubtitleStabilizer } = window.SubtitleStabilizerModule;
const { MainPanelOutput } = window.MainPanelOutputModule;
const { NearSourceOutput } = window.NearSourceOutputModule;
const { OutputRouter } = window.OutputRouterModule;
const { ScreenOcrCoordinator } = window.ScreenOcrCoordinatorModule;

let cues = [];
let currentIndex = -1;
let startedAt = 0;
let pausedAt = 0;
let isRunning = false;
let tickHandle = null;
let isOcrRunning = false;
let hasOcrArea = false;
let ocrTranslationCache = new Map();
const OCR_CACHE_MAX = 500;
let ocrCacheInsertOrder = [];
const CANDIDATE_TIMEOUT_MS = 180;
const EMPTY_FRAME_THRESHOLD = 3;
const HOLD_CLEAR_MS = 1200;

const ocrIntervalMs = 200;

const cachePrefix = 'subtitle-translation:';

function parseTime(value) {
  const match = String(value || '').trim().match(/^(\d{2,}):([0-5]\d):([0-5]\d)[,.](\d{3})(?:\s|$)/);
  if (!match) return null;
  const [, hours, minutes, seconds, millis] = match.map(Number);
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis;
}

function parseSrt(content) {
  return content
    .replace(/^\uFEFF/, '')
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split('\n').filter(Boolean);
      const timeLineIndex = lines.findIndex((line) => line.includes('-->'));
      if (timeLineIndex === -1) return null;

      const [start, end] = lines[timeLineIndex].split('-->').map((part) => part.trim());
      const text = lines.slice(timeLineIndex + 1).join('\n').replace(/<[^>]+>/g, '');
      return { start: parseTime(start), end: parseTime(end), text };
    })
    .filter((cue) => cue && cue.text && cue.start !== null && cue.end !== null && cue.end > cue.start).sort((a, b) => a.start - b.start);
}

function mediaTime() {
  if (!isRunning) return pausedAt;
  return performance.now() - startedAt;
}

function findCueIndex(time) {
  return cues.findIndex((cue) => time >= cue.start && time < cue.end);
}

async function translate(text, options = {}) {
  const cacheKey = cachePrefix + text;
  const cached = options.scope ? null : storage.getItem(cacheKey);
  if (cached) return cached;

  const translated = await window.overlayApi.translate(text, options.scope);
  if (!options.scope) storage.setItem(cacheKey, translated);
  return translated;
}

function cleanSelectedWord(text) {
  return text
    .replace(/[\r\n]+/g, ' ')
    .replace(/^[\s.,!?;:"'()[\]{}]+|[\s.,!?;:"'()[\]{}]+$/g, '')
    .trim();
}

function isRussianText(text) {
  return /[А-Яа-яЁё]/.test(text);
}

async function addSelectedWord() {
  const selectedText = cleanSelectedWord(window.getSelection().toString() || selectedWord);
  if (!selectedText) {
    actionStatus.hidden = false; actionStatus.textContent = window.I18n.t("select.a.word.in.english.or.russian.subtitles.first");
    return;
  }

  actionStatus.hidden = false; actionStatus.textContent = window.I18n.t("adding.word");

  try {
    const selectedIsRussian = isRussianText(selectedText);
    const english = selectedIsRussian
      ? cleanSelectedWord(await window.overlayApi.translateText(selectedText, 'ru', 'en'))
      : selectedText;
    const russian = selectedIsRussian
      ? selectedText
      : cleanSelectedWord(await window.overlayApi.translateText(selectedText, 'en', 'ru'));
    const transcription = await window.overlayApi.getPhonetic(english);
    const result = await window.overlayApi.dictionaryAdd({
      sourceText: selectedText,
      english,
      russian,
      transcription
    });

    if (result.duplicate) {
      actionStatus.hidden = false; actionStatus.textContent = window.I18n.t("this.word.is.already.in.dictionary");
      return;
    }

    actionStatus.hidden = false; actionStatus.textContent = `Added: ${english} - ${russian}`;
  } catch (error) {
    actionStatus.hidden = false; actionStatus.textContent = `Could not add word: ${error.message}`;
  }
}

async function showCue(index) {
  currentIndex = index;

  const requestIndex = index;
  if (index === -1) {
    englishTextElement.textContent = '';
    russianTextElement.textContent = '';
    return;
  }

  const cue = cues[index];
  englishTextElement.textContent = cue.text;
  russianTextElement.textContent = window.I18n.t('translating');

  try {
    const translated = await translate(cue.text);
    if (currentIndex === requestIndex) russianTextElement.textContent = translated;
  } catch (error) {
    if (currentIndex !== requestIndex) return;
    russianTextElement.textContent = window.I18n.t("translation.unavailable");
    statusElement.textContent = error.message;
  }
}

function tick() {
  const index = findCueIndex(mediaTime());
  if (index !== currentIndex) showCue(index);
  tickHandle = window.requestAnimationFrame(tick);
}

function setRunning(nextRunning) {
  if (nextRunning === isRunning) return;

  isRunning = nextRunning;
  updateControls();

  if (isRunning) {
    startedAt = performance.now() - pausedAt;
    tick();
  } else {
    pausedAt = performance.now() - startedAt;
    window.cancelAnimationFrame(tickHandle);
  }
}

function getCachedTranslation(normalizedKey) {
  if (ocrTranslationCache.has(normalizedKey)) return ocrTranslationCache.get(normalizedKey);
  const localKey = 'ocr-norm-' + normalizedKey;
  const cached = storage.getItem(localKey);
  if (cached) {
    setCachedTranslation(normalizedKey, cached);
    return cached;
  }
  return null;
}

function setCachedTranslation(normalizedKey, translation) {
  if (!normalizedKey || normalizedKey.length < 3) return;
  if (!/[a-zA-Z]/.test(normalizedKey)) return;
  if (!translation) return;
  if (!ocrTranslationCache.has(normalizedKey)) {
    ocrCacheInsertOrder.push(normalizedKey);
    if (ocrCacheInsertOrder.length > OCR_CACHE_MAX) {
      const oldest = ocrCacheInsertOrder.shift();
      ocrTranslationCache.delete(oldest);
      try { storage.removeItem('ocr-norm-' + oldest); } catch (_) {}
    }
  }
  ocrTranslationCache.set(normalizedKey, translation);
  try { storage.setItem('ocr-norm-' + normalizedKey, translation); } catch (_) {}
}

function stopOcr(message = window.I18n.t("screen.ocr.stopped")) {
  screenOcrCoordinator.stop(message);
}

const mainPanelOutput = new MainPanelOutput({
  englishTextElement,
  russianTextElement,
  statusElement
});
for (const method of ['showRecognizedText','showTranslation','showTranslationPending','clear']) {
  const original=mainPanelOutput[method].bind(mainPanelOutput);
  mainPanelOutput[method]=(...args)=>{ original(...args); updateControls(); };
}
mainPanelOutput.showTranslationError=message=>notify(message || window.I18n.t('translation.failed'));
const rawStatus=mainPanelOutput.setStatus.bind(mainPanelOutput);
mainPanelOutput.setStatus=message=>{
  const text=String(message || '');
  if(/error|failed/i.test(text)) { notify(text); return; }
  const key=/translat.*(detected|queued)|translating|growing/.test(text)?'translating':/translated/.test(text)?'translation.updated':/no subtitle|noise|same|similar|scanning/i.test(text)?'watching.for.subtitles':null;
  rawStatus(key?window.I18n.t(key):text);
};

const nearSourceOutput = new NearSourceOutput({
  showOverlay: (payload) => window.overlayApi.showNearSourceOverlay(payload),
  hideOverlay: () => window.overlayApi.hideNearSourceOverlay(),
  clearOverlay: () => window.overlayApi.clearNearSourceOverlay(),
  updateOverlaySettings: (settings) => window.overlayApi.updateNearSourceSettings(settings)
});
const outputRouter = new OutputRouter({ mainOutput: mainPanelOutput, nearSourceOutput });

const screenOcrCoordinator = new ScreenOcrCoordinator({
  output: outputRouter,
  stabilizer: new SubtitleStabilizer({ emptyFrameThreshold: EMPTY_FRAME_THRESHOLD }),
  captureFrame: (_generation, options) => window.overlayApi.captureScreenSubtitleFrame(options?.captureMode),
  recognizeFrame: (frame) => window.overlayApi.recognizeScreenSubtitleFrame(frame),
  translate: (text, options) => translate(text, options),
  hasOcrArea: () => hasOcrArea,
  onRunningChange: (running) => {
    if (running) setRunning(false);
    isOcrRunning = running;
    updateControls();
  },
  getCachedTranslation,
  setCachedTranslation,
  setTimeout: (callback, delay) => window.setTimeout(callback, delay),
  clearTimeout: (timerId) => window.clearTimeout(timerId),
  onMetrics: (metrics) => window.overlayApi.recordOcrMetrics(metrics).catch(() => {}),
  onDiagnosticUpdate: (update) => window.overlayApi.recordOcrDiagnosticUpdate(update).catch(() => {}),
  ocrIntervalMs,
  candidateTimeoutMs: CANDIDATE_TIMEOUT_MS,
  holdClearMs: HOLD_CLEAR_MS
});

playPauseButton.addEventListener('click', () => {
  if (capturePending || editing) return;
  if (!hasOcrArea) { chooseArea(); return; }
  if (isGameMode) { resumeSubtitles().catch(error=>notify(error.message)); return; }
  if (isOcrRunning) screenOcrCoordinator.stop(window.I18n.t("stopped"));
  else { notify(''); screenOcrCoordinator.start(); }
});
ocrOnceButton.addEventListener('click', () => { if (!isGameMode && !editing && !capturePending) { if (!hasOcrArea) chooseArea(); else screenOcrCoordinator.readOnce(); } });
addWordButton.addEventListener('click', addSelectedWord);
dictionaryOpenButton.addEventListener('click', () => window.overlayApi.openDictionaryWindow());
settingsToggleButton.addEventListener('click', () => window.overlayApi.openSettingsWindow());

window.overlayApi.onApplyUiSetting(({ key, value }) => {
  if (key === 'font') window.Appearance.apply({font:value});
  if (key === 'displayMode') { outputRouter.setDisplayMode(value); document.getElementById('overlayNotice').hidden = value !== 'overlay'; }
  if (key === 'developerMode') setDeveloperMode(value === true);
  if (key.startsWith('nearSource')) nearSourceOutput.setSettings({ [key]: value });
  if (key === 'fontScale') {
    document.documentElement.style.setProperty('--font-scale', `${Number(value) / 100}`);
  }
  if (key === 'theme') {
    window.Themes.apply(document, value); panel.dataset.theme = window.Themes.normalizeId(value);
    storage.setItem('subtitle-overlay-theme', value);
  }
  if (key === 'font') {
    applyFont(value);
  }
  if (key === 'deleteConfirm') {
    storage.setItem('subtitle-confirm-delete', value);
  }
});

window.overlayApi.onApplyUiSettings((settings) => {
  window.Appearance.apply(settings);
  document.getElementById('overlayNotice').hidden=settings.displayMode!=='overlay';
  outputRouter.setDisplayMode(settings.displayMode);
  setDeveloperMode(settings.developerMode === true);
  nearSourceOutput.setSettings(settings);
  if (settings.fontScale) document.documentElement.style.setProperty('--font-scale', `${Number(settings.fontScale) / 100}`);
  if (settings.theme) { window.Themes.apply(document, settings.theme); panel.dataset.theme = window.Themes.normalizeId(settings.theme); storage.setItem('subtitle-overlay-theme', settings.theme); }
  if (settings.font) applyFont(settings.font);
  if (typeof settings.deleteConfirm !== 'undefined') storage.setItem('subtitle-confirm-delete', settings.deleteConfirm);
  if (settings.windowWidth && settings.windowHeight) {
    window.overlayApi.setWindowSize(Number(settings.windowWidth), Number(settings.windowHeight));
  }
});

function applyFont(font) {
  const fonts = {
    system: window.I18n.t("inter.segoe.ui.arial.sans.serif"),
    inter: window.I18n.t("inter.sans.serif"),
    'segoe ui': '"Segoe UI", sans-serif',
    arial: window.I18n.t("arial.sans.serif"),
    consolas: window.I18n.t("consolas.courier.new.monospace"),
    'jetbrains mono': '"JetBrains Mono", Consolas, monospace',
    'dot matrix': window.I18n.t("consolas.courier.new.monospace")
  };
  document.body.style.fontFamily = fonts[font] || fonts.system;
  storage.setItem('subtitle-overlay-font', font);
}

panel.dataset.theme = 'dark';
applyFont('system');

async function loadInitSettings() {
  try {
    const s = await window.uiReady;
    window.Themes.apply(document, s.theme); panel.dataset.theme = window.Themes.normalizeId(s.theme);
    document.getElementById('overlayNotice').hidden = s.displayMode !== 'overlay';
    storage.setItem('subtitle-overlay-theme', panel.dataset.theme);
    applyFont(s.font || 'system');
    document.documentElement.style.setProperty('--font-scale', `${(s.fontScale || 100) / 100}`);
    storage.setItem('subtitle-confirm-delete', s.deleteConfirm !== false);
    if (s.windowWidth && s.windowHeight) {
      window.overlayApi.setWindowSize(Number(s.windowWidth), Number(s.windowHeight));
    }
    outputRouter.setDisplayMode(s.displayMode);
    setDeveloperMode(s.developerMode === true);
    nearSourceOutput.setSettings(s);
  } catch (_) {}
}
loadInitSettings();

const actionStatus = document.getElementById('actionStatus');
const captureButton = document.getElementById('captureTranslate');
const retranslateButton = document.getElementById('retranslateButton');
let isGameMode = false, manualTranslationRequestId = 0, capturePending = false, editing = false, resumeAfterManual = false;
let snapshot = null, editSnapshot = null, selectedWord = '';
function notify(message) { actionStatus.hidden = !message; actionStatus.textContent = message; actionStatus.classList.toggle('notice',/failed|could not|unavailable|busy/i.test(message)); }
function updateControls() {
  document.getElementById('emptyResult').hidden = Boolean(russianTextElement.textContent.trim());
  playPauseButton.disabled = capturePending || editing;
  playPauseButton.textContent = isOcrRunning ? window.I18n.t("stop.translation") : isGameMode && resumeAfterManual ? window.I18n.t("continue.subtitles") : hasOcrArea ? window.I18n.t("start.translation") : window.I18n.t("choose.subtitle.area");
  captureButton.disabled = capturePending || editing;
  document.getElementById('copyTranslation').disabled = !englishTextElement.textContent.trim();
  document.getElementById('welcome').hidden = hasOcrArea || isGameMode;
  document.getElementById('resumeTranslation').hidden = !resumeAfterManual || capturePending || editing;
  document.getElementById('editOriginal').hidden = editing;
  document.getElementById('editOriginal').disabled = capturePending || !englishTextElement.textContent.trim();
  retranslateButton.hidden = !editing;
  document.getElementById('cancelEdit').hidden = !editing;
  ocrOnceButton.disabled = capturePending || editing || isGameMode;
  document.getElementById('selectOcrArea').disabled = capturePending || editing;
}
async function chooseArea() { try { await window.overlayApi.selectOcrArea(); } catch(error) { notify(window.I18n.t("could.not.select.area")+error.message); } }
async function resumeSubtitles() {
  manualTranslationRequestId++;
  await window.overlayApi.setGameModeEnabled(false);
  isGameMode = false; resumeAfterManual = false; outputRouter.setGameMode(false);
  if (hasOcrArea) screenOcrCoordinator.start(); else chooseArea();
  updateControls();
}
async function beginCapture() {
  if (capturePending || editing) return;
  snapshot = { english:englishTextElement.textContent, russian:russianTextElement.textContent, running:isOcrRunning, manual:isGameMode, resume:resumeAfterManual };
  resumeAfterManual = resumeAfterManual || isOcrRunning;
  screenOcrCoordinator.stop(window.I18n.t("select.an.area.escape.cancels"));
  manualTranslationRequestId++; capturePending = true; isGameMode = true; outputRouter.setGameMode(true); updateControls();
  try { if (!await window.overlayApi.startCaptureTranslate()) throw new Error(window.I18n.t("capture.is.busy.try.again")); }
  catch(error) { await cancelCapture(); notify(error.message); }
}
async function cancelCapture() {
  capturePending = false; manualTranslationRequestId++;
  if(snapshot) { englishTextElement.textContent=snapshot.english; russianTextElement.textContent=snapshot.russian; isGameMode=snapshot.manual; resumeAfterManual=snapshot.resume; await window.overlayApi.setGameModeEnabled(isGameMode); outputRouter.setGameMode(isGameMode); if(snapshot.running) screenOcrCoordinator.start(); else statusElement.textContent=window.I18n.t("ready"); }
  updateControls();
}
captureButton.addEventListener('click', beginCapture);
window.overlayApi.onCaptureRequested(beginCapture);
window.overlayApi.onCaptureResult(async data => {
  if (!capturePending || !data) return;
  if (data.cancelled) { await cancelCapture(); return; }
  capturePending = false; manualTranslationRequestId++;
  if (data.error) notify(window.I18n.t("could.not.translate.this.area")+data.error);
  else if (!data.original) notify(window.I18n.t("no.text.found.try.selecting.a.larger.area"));
  else { englishTextElement.textContent = data.original; russianTextElement.textContent = data.translation || ''; notify(''); }
  statusElement.textContent = resumeAfterManual ? window.I18n.t("subtitles.paused.while.you.view.this.result") : window.I18n.t("ready");
  updateControls();
});
document.getElementById('selectOcrArea').addEventListener('click', chooseArea);
document.getElementById('resumeTranslation').addEventListener('click', () => resumeSubtitles().catch(error=>notify(error.message)));
document.getElementById('editOriginal').addEventListener('click', () => {
  if(!englishTextElement.textContent.trim()) return;
  editSnapshot = { english:englishTextElement.textContent, russian:russianTextElement.textContent, running:isOcrRunning, manual:isGameMode, resume:resumeAfterManual };
  resumeAfterManual ||= isOcrRunning; screenOcrCoordinator.stop(window.I18n.t("editing.original.text")); manualTranslationRequestId++; editing = true;
  document.getElementById('originalDetails').open = true; englishTextElement.contentEditable='true'; englishTextElement.setAttribute('aria-readonly','false'); updateControls(); englishTextElement.focus();
});
function finishEditing() { editing=false; englishTextElement.contentEditable='false'; englishTextElement.setAttribute('aria-readonly','true'); updateControls(); document.getElementById('editOriginal').focus(); }
document.getElementById('cancelEdit').addEventListener('click', () => {
  manualTranslationRequestId++; englishTextElement.textContent=editSnapshot.english; russianTextElement.textContent=editSnapshot.russian; resumeAfterManual=editSnapshot.resume; isGameMode=editSnapshot.manual; finishEditing(); if(editSnapshot.running) screenOcrCoordinator.start();
});
retranslateButton.addEventListener('click', async () => {
  const editedText = englishTextElement.textContent.trim(); if(!editedText) { notify(window.I18n.t("enter.some.text.to.translate")); return; }
  const requestId=++manualTranslationRequestId; retranslateButton.disabled=true; notify(window.I18n.t("translating.changes"));
  try { const result=await window.overlayApi.translate(editedText,'manual'); if(requestId!==manualTranslationRequestId || !editing || englishTextElement.textContent.trim()!==editedText) return; russianTextElement.textContent=result; isGameMode=true; outputRouter.setGameMode(true); finishEditing(); notify(window.I18n.t("translation.updated")); }
  catch(error) { if(requestId===manualTranslationRequestId) notify(window.I18n.t("translation.failed.you.can.retry.without.losing.your.edits")); }
  finally { retranslateButton.disabled=false; }
});
document.addEventListener('selectionchange', () => { const sel=window.getSelection(); const inResult=sel?.anchorNode && document.querySelector('.subtitleBox').contains(sel.anchorNode); selectedWord=inResult ? cleanSelectedWord(sel.toString()) : ''; addWordButton.hidden=!selectedWord; if(selectedWord && isOcrRunning) { resumeAfterManual=true; screenOcrCoordinator.stop(window.I18n.t("subtitles.paused.while.you.select.text")); isGameMode=true; outputRouter.setGameMode(true); updateControls(); } });
addWordButton.addEventListener('mousedown', event=>event.preventDefault());
document.getElementById('copyTranslation').addEventListener('click', async () => { try { await navigator.clipboard.writeText(russianTextElement.textContent); notify(window.I18n.t("translation.copied")); } catch(error) { notify(window.I18n.t("could.not.copy.select.the.text.and.press.ctrl.c")); } });
document.getElementById('minimizeWindow').addEventListener('click',()=>window.overlayApi.minimizeWindow());
document.getElementById('closeWindow').addEventListener('click',()=>window.overlayApi.quitApp());
document.getElementById('restoreSize').addEventListener('click',()=>window.overlayApi.restoreWindowSize().catch(error=>notify(error.message)));
window.overlayApi.onWindowRestored(() => { updateControls(); });
window.overlayApi.onStopOcr(() => { resumeAfterManual=false; screenOcrCoordinator.stop(window.I18n.t("subtitles.stopped")); updateControls(); });
updateControls();

let activeOcrProgressRequest = null;
let developerModeEnabled = false;
function setDeveloperMode(enabled) {
  developerModeEnabled = enabled;
  statusElement.hidden = !enabled;
  document.dispatchEvent(new CustomEvent('developer-mode-changed', { detail: { enabled } }));
}
window.overlayApi.onOcrProgress((event) => {
  if (typeof event === 'number') { if (isOcrRunning) statusElement.textContent = window.I18n.t('reading.subtitles'); return; }
  if (event?.type === 'started') activeOcrProgressRequest = `${event.generation}:${event.requestId}`;
  if (event?.type === 'progress' && activeOcrProgressRequest === `${event.generation}:${event.requestId}` && isOcrRunning) statusElement.textContent = window.I18n.t('reading.subtitles');
  if (event?.type === 'reset' && activeOcrProgressRequest === `${event.generation}:${event.requestId}`) {
    activeOcrProgressRequest = null;
    if (isOcrRunning) statusElement.textContent = window.I18n.t("watching.for.subtitles");
  }
});

window.overlayApi.onOcrAreaChanged((area) => {
  const wasRunning = isOcrRunning;
  screenOcrCoordinator.stop('');
  hasOcrArea = Boolean(area && Number.isFinite(area.width) && Number.isFinite(area.height) && area.width > 0 && area.height > 0);
  document.getElementById('areaStatus').textContent = hasOcrArea ? window.I18n.t("subtitle.area.selected") : window.I18n.t("no.subtitle.area.selected");
  statusElement.textContent = hasOcrArea ? window.I18n.t("ready.to.translate") : window.I18n.t("choose.a.subtitle.area.to.begin");
  updateControls();
  if (wasRunning && hasOcrArea && !isGameMode) screenOcrCoordinator.start();
});

document.addEventListener('keydown',event=>{if(event.key==='Escape' && editing){event.preventDefault();document.getElementById('cancelEdit').click();}});
