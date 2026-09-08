'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const { normalizeUiSettings } = require('../../src/shared/settings/settings-store');

function rendererHarness(t, relativeHtml, overrides = {}) {
  const htmlPath = path.resolve(__dirname, '../../src', relativeHtml);
  const dom = new JSDOM(fs.readFileSync(htmlPath, 'utf8'), { url: 'https://overlay.test/', runScripts: 'outside-only', pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const events = {};
  const calls = [];
  const errors = [];
  dom.window.addEventListener('error', e => { errors.push(e.error); e.preventDefault(); });
  const defaults = { getUiSettings: async () => normalizeUiSettings(), dictionaryGet: async () => [], getContextSentences: async () => [], translate: async () => 'Translation' };
  dom.window.overlayApi = new Proxy({}, {
    get: (_, key) => (...args) => {
      if (String(key).startsWith('on')) { events[key] = args[0]; return () => delete events[key]; }
      calls.push([key, ...args]);
      return (overrides[key] || defaults[key] || (async () => true))(...args);
    }
  });
  const context = dom.getInternalVMContext();
  for (const script of dom.window.document.querySelectorAll('script[src]')) {
    const file = path.resolve(path.dirname(htmlPath), script.getAttribute('src'));
    new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file }).runInContext(context);
  }
  return { window: dom.window, document: dom.window.document, events, calls, errors,
    evaluate: code => vm.runInContext(code, context), flush: async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); } };
}
module.exports = { rendererHarness };
