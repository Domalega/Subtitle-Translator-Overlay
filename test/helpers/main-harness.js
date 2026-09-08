'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { EventEmitter } = require('node:events');
const { PNG } = require('pngjs');

function makeImage(width, height, data = Buffer.alloc(width * height * 4)) {
  return {
    getSize: () => ({ width, height }),
    toBitmap: () => data,
    toPNG: () => PNG.sync.write({ width, height, data }),
    crop(bounds) {
      if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isInteger) ||
          bounds.x < 0 || bounds.y < 0 || bounds.width < 1 || bounds.height < 1 ||
          bounds.x + bounds.width > width || bounds.y + bounds.height > height) throw new Error('Invalid crop');
      const cropped = Buffer.alloc(bounds.width * bounds.height * 4);
      for (let y = 0; y < bounds.height; y++) data.copy(cropped, y * bounds.width * 4, ((bounds.y + y) * width + bounds.x) * 4, ((bounds.y + y) * width + bounds.x + bounds.width) * 4);
      return makeImage(bounds.width, bounds.height, cropped);
    }
  };
}
function mainHarness(t, options = {}) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'subtitle-audit-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  if (options.settings) fs.writeFileSync(path.join(folder, 'ui-settings.json'), JSON.stringify(options.settings));
  const logs = [];
  let resolveReady;
  const readyPromise = new Promise(resolve => { resolveReady = resolve; });
  const handlers = new Map();
  const windows = [];
  const shortcuts = new Map();
  const display = options.display || { id: 1, bounds: { x: 0, y: 0, width: 1280, height: 720 }, size: { width: 1280, height: 720 }, workArea: { x: 0, y: 0, width: 1280, height: 680 }, scaleFactor: 1 };
  class Window extends EventEmitter {
    constructor(config) {
      super(); this.config = config; this.destroyed = false; this.visible = config.show !== false;
      this.bounds = { x: config.x || 0, y: config.y || 0, width: config.width, height: config.height };
      this.webContents = new EventEmitter();
      this.messages = [];
      this.webContents.send = (channel, ...args) => { if (this.destroyed) throw new Error('Object has been destroyed'); this.messages.push([channel, ...args]); };
      this.webContents.isLoading = () => false;
      this.webContents.mainFrame = { url: '' };
      this.webContents.setWindowOpenHandler = handler => { this.openHandler = handler; };
      app.emit('web-contents-created', {}, this.webContents);
      windows.push(this);
    }
    isDestroyed() { return this.destroyed; }
    isVisible() { return this.visible; }
    show() { this.visible = true; }
    showInactive() { this.show(); }
    hide() { this.visible = false; }
    close() { this.destroyed = true; this.visible = false; this.emit('closed'); }
    focus() {}
    isMinimized() { return false; }
    restore() {}
    setAlwaysOnTop() {}
    setIgnoreMouseEvents() {}
    setContentProtection() {}
    loadFile(file) { this.file = file; this.webContents.mainFrame.url = require('node:url').pathToFileURL(file).href; queueMicrotask(() => { if (!this.destroyed) this.webContents.emit('did-finish-load'); }); return Promise.resolve(); }
    getBounds() { return this.bounds; }
    setBounds(bounds) { this.bounds = bounds; }
    getSize() { return [this.bounds.width, this.bounds.height]; }
    setSize(width, height) { if (![width, height].every(Number.isInteger)) throw new Error('Invalid size'); Object.assign(this.bounds, { width, height }); }
    getPosition() { return [this.bounds.x, this.bounds.y]; }
    setPosition(x, y) { if (![x, y].every(Number.isInteger)) throw new Error('Invalid position'); Object.assign(this.bounds, { x, y }); }
    static fromWebContents(contents) { return windows.find(w => w.webContents === contents); }
    static getAllWindows() { return windows.filter(w => !w.destroyed); }
  }
  const app = new EventEmitter();
  Object.assign(app, { getPath: () => folder, getVersion: () => 'test', disableHardwareAcceleration() {}, requestSingleInstanceLock: () => true, whenReady: () => readyPromise, quit() {}, exit() {} });
  const screen = new EventEmitter();
  Object.assign(screen, { getPrimaryDisplay: () => display, getAllDisplays: () => [display], getDisplayMatching: () => display });
  const electron = {
    app, screen, BrowserWindow: Window,
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    globalShortcut: {
      register: (key, action) => { if (key === 'Occupied' || shortcuts.has(key)) return false; if (key === 'Invalid') throw new Error('Invalid accelerator'); shortcuts.set(key, action); return true; },
      unregister: key => shortcuts.delete(key), unregisterAll: () => shortcuts.clear()
    },
    desktopCapturer: { getSources: options.getSources || (async () => [{ display_id: String(display.id), thumbnail: makeImage(display.size.width, display.size.height) }]) },
    nativeImage: { createFromDataURL: () => makeImage(display.size.width, display.size.height) },
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }), showSaveDialog: async () => ({ canceled: true }) },
    shell: { openPath: async () => '' }
  };
  const file = path.resolve(__dirname, '../../src/main/app.js');
  const realRequire = createRequire(file);
  const worker = { setParameters: async () => {}, recognize: async () => ({ data: { text: 'Hello world', confidence: 90 } }), terminate: async () => {} };
  const context = vm.createContext({
    require: name => name === 'electron' ? electron : name === 'tesseract.js' ? { createWorker: options.createWorker || (async () => worker) } : realRequire(name),
    __dirname: path.dirname(file), Buffer, URLSearchParams, AbortController, ArrayBuffer, Uint8Array,
    performance, console: { ...console, error: (...args) => logs.push(args), debug: (...args) => logs.push(args) }, process: { env: {}, pid: process.pid }, setTimeout, clearTimeout,
    fetch: options.fetch || (async () => ({ ok: true, json: async () => [[['Translation']]] }))
  });
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  const evaluate = code => vm.runInContext(code, context);
  if (!options.autoReady) evaluate('createWindow()');
  t.after(async () => {
    evaluate('clearTimeout(subtitleDetectionRetryTimer)');
    await evaluate('screenOcrWorker.dispose()');
    await evaluate('gameOcrWorker.dispose()');
  });
  return { folder, handlers, windows, shortcuts, electron, context, evaluate, logs,
    start: async () => { resolveReady(); await new Promise(resolve => setImmediate(resolve)); },
    invoke: (channel, ...args) => handlers.get(channel)({ sender: windows[0].webContents, senderFrame: windows[0].webContents.mainFrame }, ...args) };
}
module.exports = { mainHarness, makeImage };
