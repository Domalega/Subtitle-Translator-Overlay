const playPauseButton = document.getElementById('playPause');
const ocrOnceButton = document.getElementById('ocrOnce');
const addWordButton = document.getElementById('addWord');
const dictionaryOpenButton = document.getElementById('dictionaryOpen');
const hideControlsButton = document.getElementById('hideControls');
const settingsToggleButton = document.getElementById('settingsToggle');
const statusElement = document.getElementById('status');
const englishTextElement = document.getElementById('englishText');
const russianTextElement = document.getElementById('russianText');
const panel = document.querySelector('.panel');

let cues = [];
let currentIndex = -1;
let startedAt = 0;
let pausedAt = 0;
let isRunning = false;
let tickHandle = null;
let isOcrRunning = false;
let ocrTimer = null;
let lastOcrText = '';
let hasOcrArea = false;
let isOcrBusy = false;

const ocrIntervalMs = 3000;

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

async function translate(text) {
  const cacheKey = cachePrefix + text;
  const cached = localStorage.getItem(cacheKey);
  if (cached) return cached;

  const translated = await window.overlayApi.translate(text);
  localStorage.setItem(cacheKey, translated);
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

function isLikelySubtitle(text) {
  if (!text || text.length < 3 || text.length > 180) return false;
  if (!/[a-zA-Z]/.test(text)) return false;
  if (/[&=:%]{2,}/.test(text)) return false;
  if ((text.match(/[A-Za-z]/g) || []).length < text.length * 0.45) return false;
  if (/\b(?:Tosapminzam|zay2o0e|FBRo|Screen OCR|Click-through)\b/i.test(text)) return false;
  return !/^\d{1,2}:\d{2}/.test(text);
}

async function readOcrSubtitle({ scheduleNext = true } = {}) {
  if (isOcrBusy) {
    statusElement.textContent = 'OCR is already reading. Wait a moment.';
    return;
  }

  if (!hasOcrArea) {
    statusElement.textContent = 'Select OCR area first';
    if (isOcrRunning) setOcrRunning(false);
    return;
  }

  isOcrBusy = true;
  statusElement.textContent = 'Reading subtitle...';

  try {
    const text = await window.overlayApi.readScreenSubtitle();
    if (isLikelySubtitle(text) && text !== lastOcrText) {
      lastOcrText = text;
      englishTextElement.textContent = text;
      russianTextElement.textContent = 'Translating...';
      russianTextElement.textContent = await translate(text);
      statusElement.textContent = 'Screen OCR: subtitle translated';
    } else if (isLikelySubtitle(text)) {
      statusElement.textContent = 'Same subtitle, already translated';
    } else {
      statusElement.textContent = text ? `Ignored OCR noise: ${text.slice(0, 40)}` : 'No subtitle detected in selected area';
    }
  } catch (error) {
    statusElement.textContent = `Screen OCR error: ${error.message}`;
  } finally {
    isOcrBusy = false;
    if (scheduleNext && isOcrRunning) {
      ocrTimer = window.setTimeout(readOcrSubtitle, ocrIntervalMs);
    }
  }
}

function setOcrRunning(nextRunning) {
  isOcrRunning = nextRunning;
  playPauseButton.textContent = isOcrRunning || isRunning ? 'Stop' : 'Start';

  if (isOcrRunning) {
    setRunning(false);
    currentIndex = -1;
    statusElement.textContent = 'Screen OCR: slow mode, one read every 3 seconds';
    readOcrSubtitle();
  } else {
    window.clearTimeout(ocrTimer);
    statusElement.textContent = '';
  }
}

function stopOcr(message = 'Screen OCR stopped') {
  isOcrRunning = false;
  window.clearTimeout(ocrTimer);
  playPauseButton.textContent = isRunning ? 'Pause' : 'Start';
  statusElement.textContent = message;
}

playPauseButton.addEventListener('click', () => {
  setOcrRunning(!isOcrRunning);
});
ocrOnceButton.addEventListener('click', () => readOcrSubtitle({ scheduleNext: false }));
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
});

panel.dataset.theme = localStorage.getItem('subtitle-overlay-theme') || 'green';

hideControlsButton.addEventListener('click', () => {
  panel.classList.toggle('controlsHidden');
  hideControlsButton.textContent = panel.classList.contains('controlsHidden') ? 'Full view' : 'Compact view';
});

window.overlayApi.onToggleControls(() => {
  panel.classList.toggle('controlsHidden');
  hideControlsButton.textContent = panel.classList.contains('controlsHidden') ? 'Full view' : 'Compact view';
});

window.overlayApi.onWindowRestored(() => {
  panel.classList.remove('controlsHidden');
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
