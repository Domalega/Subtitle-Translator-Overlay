'use strict';
const path = require('node:path');

// All invoke handlers share the same trusted-window and top-frame boundary.
function createIpcHandler({ ipcMain, BrowserWindow, sourceRoot }) {
  function handleIpc(channel, handler) {
    ipcMain.handle(channel, (event, ...args) => {
      const owner = BrowserWindow.fromWebContents(event.sender);
      const frame = event.senderFrame;
      if (!owner || owner.isDestroyed() || !frame || frame !== event.sender.mainFrame) throw new Error('Untrusted IPC sender');
      let file;
      try { file = require('node:url').fileURLToPath(frame.url); } catch (_) { throw new Error('Untrusted IPC sender'); }
      const relative = path.relative(sourceRoot, file);
      if (relative.startsWith('..') || path.isAbsolute(relative) || path.extname(relative) !== '.html') throw new Error('Untrusted IPC sender');
      return handler(event, ...args);
    });
  }
  return handleIpc;
}
module.exports = { createIpcHandler };
