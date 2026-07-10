const playPauseButton = document.getElementById('playPause');
const ocrOnceButton = document.getElementById('ocrOnce');
const addWordButton = document.getElementById('addWord');
const dictionaryOpenButton = document.getElementById('dictionaryOpen');
const focusToggleButton = document.getElementById('focusToggle');
const gameModeToggleButton = document.getElementById('gameModeToggle');
const settingsToggleButton = document.getElementById('settingsToggle');
const statusElement = document.getElementById('status');
const englishTextElement = document.getElementById('englishText');
const russianTextElement = document.getElementById('russianText');
const panel = document.querySelector('.panel');
const { SubtitleStabilizer } = window.SubtitleStabilizerModule;
const { MainPanelOutput } = window.MainPanelOutputModule;
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
const HOLD_CLEAR_MS = 2000;

const ocrIntervalMs = 1000;

const cachePrefix = 'subtitle-translation:';

function parseTime(value) {
  const match = value.trim().match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
  if (!match) return 0;
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
    .filter((cue) => cue && cue.text);
}

function mediaTime() {
  if (!isRunning) return pausedAt;
  return performance.now() - startedAt;
}

function findCueIndex(time) {
  return cues.findIndex((cue) => time >= cue.start && time <= cue.end);
}

async function translate(text, options = {}) {
  const cacheKey = cachePrefix + text;
  const cached = options.scope ? null : localStorage.getItem(cacheKey);
  if (cached) return cached;

  const translated = await window.overlayApi.translate(text, options.scope);
  if (!options.scope) localStorage.setItem(cacheKey, translated);
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
  const selectedText = cleanSelectedWord(window.getSelection().toString());
  if (!selectedText) {
    statusElement.textContent = 'Select a word in English or Russian subtitles first';
    return;
  }

  statusElement.textContent = 'Adding word...';

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
      statusElement.textContent = 'This word is already in dictionary';
      return;
    }

    statusElement.textContent = `Added: ${english} - ${russian}`;
  } catch (error) {
    statusElement.textContent = `Could not add word: ${error.message}`;
  }
}

async function showCue(index) {
  currentIndex = index;

  if (index === -1) {
    englishTextElement.textContent = '';
    russianTextElement.textContent = '';
    return;
  }

  const cue = cues[index];
  englishTextElement.textContent = cue.text;
  russianTextElement.textContent = 'Translating...';

  try {
    russianTextElement.textContent = await translate(cue.text);
  } catch (error) {
    russianTextElement.textContent = 'Translation unavailable';
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
  playPauseButton.textContent = isRunning || isOcrRunning ? 'Stop' : 'Start';

  if (isRunning) {
    startedAt = performance.now() - pausedAt;
    tick();
  } else {
    pausedAt = mediaTime();
    window.cancelAnimationFrame(tickHandle);
  }
}

function getCachedTranslation(normalizedKey) {
  if (ocrTranslationCache.has(normalizedKey)) return ocrTranslationCache.get(normalizedKey);
  const localKey = 'ocr-norm-' + normalizedKey;
  const cached = localStorage.getItem(localKey);
  if (cached) {
    ocrTranslationCache.set(normalizedKey, cached);
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
      try { localStorage.removeItem('ocr-norm-' + oldest); } catch (_) {}
    }
  }
  ocrTranslationCache.set(normalizedKey, translation);
  try { localStorage.setItem('ocr-norm-' + normalizedKey, translation); } catch (_) {}
}

function stopOcr(message = 'Screen OCR stopped') {
  screenOcrCoordinator.stop(message);
}

const mainPanelOutput = new MainPanelOutput({
  englishTextElement,
  russianTextElement,
  statusElement
});

const screenOcrCoordinator = new ScreenOcrCoordinator({
  output: mainPanelOutput,
  stabilizer: new SubtitleStabilizer({ emptyFrameThreshold: EMPTY_FRAME_THRESHOLD }),
  readOcr: () => window.overlayApi.readScreenSubtitle(),
  translate: (text, options) => translate(text, options),
  hasOcrArea: () => hasOcrArea,
  onRunningChange: (running) => {
    if (running) setRunning(false);
    isOcrRunning = running;
    playPauseButton.textContent = isOcrRunning || isRunning ? 'Stop' : 'Start';
  },
  getCachedTranslation,
  setCachedTranslation,
  setTimeout: (callback, delay) => window.setTimeout(callback, delay),
  clearTimeout: (timerId) => window.clearTimeout(timerId),
  ocrIntervalMs,
  candidateTimeoutMs: CANDIDATE_TIMEOUT_MS,
  holdClearMs: HOLD_CLEAR_MS
});

playPauseButton.addEventListener('click', () => {
  if (isOcrRunning) screenOcrCoordinator.stop('');
  else screenOcrCoordinator.start();
});
ocrOnceButton.addEventListener('click', () => screenOcrCoordinator.readOnce());
addWordButton.addEventListener('click', addSelectedWord);
dictionaryOpenButton.addEventListener('click', () => window.overlayApi.openDictionaryWindow());
settingsToggleButton.addEventListener('click', () => window.overlayApi.openSettingsWindow());

window.overlayApi.onApplyUiSetting(({ key, value }) => {
  if (key === 'fontScale') {
    document.documentElement.style.setProperty('--font-scale', `${Number(value) / 100}`);
  }
  if (key === 'theme') {
    panel.dataset.theme = value;
    localStorage.setItem('subtitle-overlay-theme', value);
  }
  if (key === 'font') {
    applyFont(value);
  }
  if (key === 'deleteConfirm') {
    localStorage.setItem('subtitle-confirm-delete', value);
  }
});

window.overlayApi.onApplyUiSettings((settings) => {
  if (settings.fontScale) document.documentElement.style.setProperty('--font-scale', `${Number(settings.fontScale) / 100}`);
  if (settings.theme) { panel.dataset.theme = settings.theme; localStorage.setItem('subtitle-overlay-theme', settings.theme); }
  if (settings.font) applyFont(settings.font);
  if (typeof settings.deleteConfirm !== 'undefined') localStorage.setItem('subtitle-confirm-delete', settings.deleteConfirm);
  if (settings.windowWidth && settings.windowHeight) {
    window.overlayApi.setWindowSize(Number(settings.windowWidth), Number(settings.windowHeight));
  }
});

function applyFont(font) {
  const fonts = {
    system: 'Inter, Segoe UI, Arial, sans-serif',
    inter: 'Inter, sans-serif',
    'segoe ui': '"Segoe UI", sans-serif',
    arial: 'Arial, sans-serif',
    consolas: 'Consolas, "Courier New", monospace',
    'jetbrains mono': '"JetBrains Mono", Consolas, monospace',
    'dot matrix': 'Consolas, "Courier New", monospace'
  };
  document.body.style.fontFamily = fonts[font] || fonts.system;
  localStorage.setItem('subtitle-overlay-font', font);
}

panel.dataset.theme = 'green';
applyFont('system');

async function loadInitSettings() {
  try {
    const s = await window.overlayApi.getUiSettings();
    panel.dataset.theme = s.theme || 'green';
    localStorage.setItem('subtitle-overlay-theme', panel.dataset.theme);
    applyFont(s.font || 'system');
    document.documentElement.style.setProperty('--font-scale', `${(s.fontScale || 100) / 100}`);
    localStorage.setItem('subtitle-confirm-delete', s.deleteConfirm !== false);
    if (s.windowWidth && s.windowHeight) {
      window.overlayApi.setWindowSize(Number(s.windowWidth), Number(s.windowHeight));
    }
  } catch (_) {}
}
loadInitSettings();

const retranslateButton = document.getElementById('retranslateButton');
retranslateButton.addEventListener('click', async () => {
  const editedText = englishTextElement.textContent.trim();
  if (!editedText) return;
  statusElement.textContent = 'Translating...';
  try {
    russianTextElement.textContent = await window.overlayApi.translate(editedText, 'manual');
    statusElement.textContent = 'Translation updated';
  } catch (_) {
    statusElement.textContent = 'Translation failed';
  }
});

focusToggleButton.addEventListener('click', () => {
  panel.classList.toggle('focusMode');
  focusToggleButton.textContent = panel.classList.contains('focusMode') ? 'Exit focus' : 'Focus mode';
});

let isGameMode = false;
gameModeToggleButton.addEventListener('click', async () => {
  isGameMode = !isGameMode;
  gameModeToggleButton.textContent = isGameMode ? 'Close game' : 'Game mode';
  gameModeToggleButton.classList.toggle('primary', isGameMode);
  await window.overlayApi.setGameModeEnabled(isGameMode);
  englishTextElement.contentEditable = isGameMode ? 'true' : 'false';
  retranslateButton.hidden = !isGameMode;
  if (isGameMode) {
    statusElement.textContent = 'Game OCR: Press Ctrl+Shift+T to translate screen';
    englishTextElement.textContent = 'Select area with Ctrl+Shift+T';
    russianTextElement.textContent = 'Translation will appear here';
  } else {
    statusElement.textContent = '';
    englishTextElement.contentEditable = 'false';
    retranslateButton.hidden = true;
  }
});

window.overlayApi.onCaptureResult((data) => {
  englishTextElement.textContent = data.original || 'No English text found';
  russianTextElement.textContent = data.translation || '-';
  retranslateButton.hidden = false;
});

window.overlayApi.onGameModeDisabled(() => {
  statusElement.textContent = 'Enable Game mode first';
});

window.overlayApi.onWindowRestored(() => {
  statusElement.textContent = 'Window restored. Controls are clickable.';
});

window.overlayApi.onStopOcr(() => stopOcr('Screen OCR stopped by Ctrl+Shift+S'));

window.overlayApi.onOcrProgress((progress) => {
  if (isOcrRunning) statusElement.textContent = `Screen OCR: recognizing ${progress}%`;
});

window.overlayApi.onOcrAreaChanged((area) => {
  hasOcrArea = true;
  statusElement.textContent = `OCR area selected: ${Math.round(area.width)}x${Math.round(area.height)}`;
});
