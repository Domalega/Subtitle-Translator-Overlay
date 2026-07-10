const test = require('node:test');
const assert = require('node:assert/strict');
const { OcrWorkerService, selectSubtitleLayout } = require('../../../src/main/services/ocr-worker-service');

function createWorkerMock({ failInitialize = false, failRecognize = false } = {}) {
  const calls = { create: 0, recognize: 0, terminate: 0, active: 0, maxActive: 0 };
  const worker = {
    async setParameters() { if (failInitialize) throw new Error('init failed'); },
    async recognize() { calls.recognize += 1; calls.active += 1; calls.maxActive = Math.max(calls.maxActive, calls.active); await new Promise(resolve => setTimeout(resolve, 1)); calls.active -= 1; if (failRecognize) throw new Error('recognize failed'); return { data: { text: 'hello' } }; },
    async terminate() { calls.terminate += 1; }
  };
  return { calls, createWorker: async () => { calls.create += 1; return worker; } };
}

test('worker is created once and concurrent initialize shares one Promise', async () => {
  const mock = createWorkerMock(); const service = new OcrWorkerService(mock);
  assert.equal(service.initialize(), service.initialize());
  await Promise.all([service.initialize(), service.initialize()]);
  assert.equal(mock.calls.create, 1);
});
test('sequential recognize calls reuse one worker and never run concurrently', async () => {
  const mock = createWorkerMock(); const service = new OcrWorkerService(mock);
  await Promise.all([service.recognize(Buffer.alloc(1)), service.recognize(Buffer.alloc(1))]);
  assert.equal(mock.calls.create, 1); assert.equal(mock.calls.recognize, 2); assert.equal(mock.calls.maxActive, 1);
});
test('recognize queue releases after an error', async () => {
  const mock = createWorkerMock(); let failed = true;
  mock.createWorker = async () => ({ ...mock.createWorker, setParameters: async () => {}, recognize: async () => { if (failed) { failed = false; throw new Error('bad'); } return { data: { text: 'ok' } }; }, terminate: async () => {} });
  const service = new OcrWorkerService(mock);
  await assert.rejects(service.recognize(Buffer.alloc(1)));
  await service.recognize(Buffer.alloc(1));
});
test('initialization failure can be retried', async () => {
  let attempts = 0;
  const service = new OcrWorkerService({ createWorker: async () => ({ setParameters: async () => { attempts += 1; if (attempts === 1) throw new Error('failed'); }, recognize: async () => ({}), terminate: async () => {} }) });
  await assert.rejects(service.initialize()); await service.initialize(); assert.equal(attempts, 2);
});
test('dispose terminates once, is safe twice, and Stop has no worker lifecycle effect', async () => {
  const mock = createWorkerMock(); const service = new OcrWorkerService(mock); await service.initialize(); await service.dispose(); await service.dispose(); assert.equal(mock.calls.terminate, 1);
});
test('layout selection keeps a single safe multi-line profile', () => {
  assert.equal(selectSubtitleLayout(), '6'); assert.equal(selectSubtitleLayout('single-line'), '7'); assert.equal(selectSubtitleLayout('new-profile'), '6');
});
test('changing requested layout after initialization does not create a second worker', async () => {
  const mock = createWorkerMock(); const service = new OcrWorkerService(mock);
  await service.initialize(); service.layout = 'single-line'; await service.initialize(); assert.equal(mock.calls.create, 1);
});
test('recognize timeout terminates the stuck worker and permits a fresh request', async () => {
  let createCount = 0;
  const workers = [
    { setParameters: async () => {}, recognize: () => new Promise(() => {}), terminate: async () => {} },
    { setParameters: async () => {}, recognize: async () => ({ data: { text: 'recovered' } }), terminate: async () => {} }
  ];
  const service = new OcrWorkerService({ createWorker: async () => workers[createCount++], recognizeTimeoutMs: 5 });
  await assert.rejects(service.recognize(Buffer.alloc(1)), { code: 'OCR_TIMEOUT' });
  const result = await service.recognize(Buffer.alloc(1));
  assert.equal(result.data.text, 'recovered');
  assert.equal(createCount, 2);
});
