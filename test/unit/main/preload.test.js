'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path'); const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { mainHarness } = require('../../helpers/main-harness');

test('every exposed invoke has a registered main handler; events never leak Electron objects and unsubscribe', t => {
  const h = mainHarness(t); const ipc = new EventEmitter(); const calls = [];
  ipc.invoke = (...args) => { calls.push(args); return Promise.resolve(); };
  let api;
  const file = path.resolve(__dirname, '../../../src/preload.js');
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    require: () => ({ contextBridge: { exposeInMainWorld: (_key, value) => { api = value; } }, ipcRenderer: ipc }),
    process: { env: {} }, console
  }, { filename: file });
  for (const [name, method] of Object.entries(api)) {
    if (!name.startsWith('on')) { method(); assert.ok(h.handlers.has(calls.at(-1)[0]), name); continue; }
    const before = ipc.eventNames();
    let received;
    const unsubscribe = method((...args) => { received = args; });
    const channel = ipc.eventNames().find(key => !before.includes(key));
    const event = { sender: { privileged: true } };
    ipc.emit(channel, event, 'data');
    assert.deepEqual(received, ['data'], name);
    assert.equal(typeof unsubscribe, 'function', name);
    unsubscribe(); assert.equal(ipc.listenerCount(channel), 0);
  }
});
