const { app, BrowserWindow, dialog, ipcMain, globalShortcut, desktopCapturer, nativeImage, screen } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createWorker } = require('tesseract.js');
const { PNG } = require('pngjs');

app.disableHardwareAcceleration();
const singleInstanceLock = app.requestSingleInstanceLock();

let mainWindow;
let selectionWindow;
let ocrWorkerPromise;
let ocrArea = null;

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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 360,
    minWidth: 520,
    minHeight: 220,
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

  globalShortcut.register('CommandOrControl+Shift+O', () => {
    restoreMainWindow();
  });

  globalShortcut.register('CommandOrControl+Shift+H', () => {
    mainWindow.webContents.send('toggle-controls');
  });

  globalShortcut.register('CommandOrControl+Shift+S', () => {
    mainWindow.webContents.send('stop-ocr');
    restoreMainWindow();
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
  if (process.platform !== 'darwin') app.quit();
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
    Math.max(420, Number(width || 0)),
    Math.max(180, Number(height || 0))
  );
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
  return ocrArea;
});

ipcMain.handle('cancel-ocr-area', () => {
  selectionWindow?.close();
});

ipcMain.handle('translate', async (_event, text) => {
  const query = new URLSearchParams({
    client: 'gtx',
    sl: 'en',
    tl: 'ru',
    dt: 't',
    q: text
  });

  const response = await fetch(`https://translate.googleapis.com/translate_a/single?${query}`);
  if (!response.ok) {
    throw new Error(`Translate request failed: ${response.status}`);
  }

  const data = await response.json();
  return data?.[0]?.map((part) => part?.[0]).join('') || '';
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
