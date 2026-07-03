const { app, BrowserWindow, dialog, ipcMain, globalShortcut, desktopCapturer, nativeImage, screen } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createWorker } = require('tesseract.js');
const { PNG } = require('pngjs');

app.disableHardwareAcceleration();
const singleInstanceLock = app.requestSingleInstanceLock();

let mainWindow;
let selectionWindow;
let settingsWindow;
let dictionaryWindow;
let ocrWorkerPromise;
let ocrArea = null;

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

async function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = createWorker('eng', 1, {
      logger: (message) => {
        if (message.status === 'recognizing text') {
          mainWindow?.webContents.send('ocr-progress', Math.round(message.progress * 100));
        }
      }
    });

    ocrWorkerPromise = ocrWorkerPromise.then(async (worker) => {
      await worker.setParameters({
        tessedit_pageseg_mode: '6',
        preserve_interword_spaces: '1',
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?\'"-:;()[]&% '
      });
      return worker;
    });
  }

  return ocrWorkerPromise;
}

function cleanOcrText(text) {
  const cleaned = text
    .replace(/[|_{}[\]<>~`^]/g, '')
    .replace(/\b(?:ENGLISH|RUSSIAN|Screen OCR|Click-through|Open SRT|Hide controls|Offset|Start)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned.replace(/^[^A-Za-z[("']+/, '').trim();
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
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  selectionWindow.setAlwaysOnTop(true, 'screen-saver');
  selectionWindow.loadFile(path.join(__dirname, 'select.html'));
  selectionWindow.on('closed', () => {
    selectionWindow = null;
  });
}

function createToolWindow(fileName, title, width, height) {
  const existingWindow = fileName === 'settings.html' ? settingsWindow : dictionaryWindow;
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
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  toolWindow.setAlwaysOnTop(true, 'screen-saver');
  toolWindow.loadFile(path.join(__dirname, fileName));
  toolWindow.on('closed', () => {
    if (fileName === 'settings.html') settingsWindow = null;
    if (fileName === 'dictionary.html') dictionaryWindow = null;
  });

  if (fileName === 'settings.html') settingsWindow = toolWindow;
  if (fileName === 'dictionary.html') dictionaryWindow = toolWindow;
  return toolWindow;
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
    title: 'Subtitle Translation Overlay',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
    globalShortcut.unregisterAll();
    if (ocrWorkerPromise) {
      ocrWorkerPromise.then((worker) => worker.terminate()).catch(() => {});
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

async function translateText(text, sourceLanguage, targetLanguage) {
  const query = new URLSearchParams({
    client: 'gtx',
    sl: sourceLanguage,
    tl: targetLanguage,
    dt: 't',
    q: text
  });

  const response = await fetch(`https://translate.googleapis.com/translate_a/single?${query}`);
  if (!response.ok) {
    throw new Error(`Translate request failed: ${response.status}`);
  }

  const data = await response.json();
  return data?.[0]?.map((part) => part?.[0]).join('') || '';
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

  app.whenReady().then(createWindow);
}

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  if (ocrWorkerPromise) {
    ocrWorkerPromise.then((worker) => worker.terminate()).catch(() => {});
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
  createToolWindow('settings.html', 'Subtitle Overlay Settings', 600, 580);
});

ipcMain.handle('open-dictionary-window', () => {
  createToolWindow('dictionary.html', 'Subtitle Dictionary', 680, 560);
});

ipcMain.handle('close-current-window', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window && window !== mainWindow) window.close();
  return true;
});

ipcMain.handle('set-ui-setting', (_event, key, value) => {
  mainWindow?.webContents.send('apply-ui-setting', { key, value });
  settingsWindow?.webContents.send('apply-ui-setting', { key, value });
  dictionaryWindow?.webContents.send('apply-ui-setting', { key, value });
  return true;
});

ipcMain.handle('select-ocr-area', () => {
  if (!selectionWindow) createSelectionWindow();
});

ipcMain.handle('complete-ocr-area', (_event, area) => {
  const display = screen.getPrimaryDisplay();
  const scale = display.scaleFactor || 1;
  ocrArea = {
    x: area.x * scale,
    y: area.y * scale,
    width: area.width * scale,
    height: area.height * scale
  };

  selectionWindow?.close();
  mainWindow?.webContents.send('ocr-area-changed', ocrArea);
  settingsWindow?.webContents.send('ocr-area-changed', ocrArea);
  return ocrArea;
});

ipcMain.handle('cancel-ocr-area', () => {
  selectionWindow?.close();
});

ipcMain.handle('translate', async (_event, text) => {
  return translateText(text, 'en', 'ru');
});

ipcMain.handle('translate-text', async (_event, text, sourceLanguage, targetLanguage) => {
  return translateText(text, sourceLanguage, targetLanguage);
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
                  if (definition.example && sentences.length < 5) {
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
  ];

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

ipcMain.handle('read-screen-subtitle', async () => {
  if (!ocrArea) return '';

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, height }
  });
  const source = sources[0];
  if (!source) return '';

  const image = nativeImage.createFromDataURL(source.thumbnail.toDataURL());
  const imageSize = image.getSize();
  const crop = image.crop(clampArea(ocrArea || defaultOcrArea(imageSize), imageSize));
  const maskedPng = subtitleMaskToPng(crop);

  const worker = await getOcrWorker();
  const result = await worker.recognize(maskedPng);
  return cleanOcrText(result.data.text);
});
