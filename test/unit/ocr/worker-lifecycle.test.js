'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { OcrWorkerService } = require('../../../src/main/services/ocr-worker-service');
const flush = () => new Promise(resolve => setImmediate(resolve));
const worker = () => ({ setParameters: async () => {}, recognize: async () => ({ data: { text: 'recovered' } }), terminate: async () => {} });

test('dispose during initialization terminates a late-created worker exactly once', async () => {
  let resolveCreate; let terminated = 0;
  const service = new OcrWorkerService({ createWorker: () => new Promise(resolve => { resolveCreate = resolve; }) });
  const initialization = service.initialize();
  const rejected = assert.rejects(initialization, /disposed|cancelled/);
  await flush(); await service.dispose();
  resolveCreate({ ...worker(), terminate: async () => { terminated++; } });
  await rejected; await flush();
  assert.equal(service.worker, null); assert.equal(terminated, 1);
});
test('initialization timeout permits retry and retires the late old worker', async () => {
  let calls = 0; let resolveOld; let retired = 0;
  const service = new OcrWorkerService({ initializeTimeoutMs: 5, createWorker: () => ++calls === 1 ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve(worker()) });
  await assert.rejects(service.initialize(), { code: 'OCR_INITIALIZE_TIMEOUT' });
  assert.equal((await service.recognize(Buffer.alloc(1))).data.text, 'recovered');
  resolveOld({ ...worker(), terminate: async () => { retired++; } });
  await flush(); assert.equal(retired, 1); await service.dispose();
});
test('stalled termination cannot hold the recognition queue forever', async () => {
  let calls = 0;
  const service = new OcrWorkerService({ recognizeTimeoutMs: 5, terminateTimeoutMs: 5,
    createWorker: async () => ++calls === 1 ? { ...worker(), recognize: () => new Promise(() => {}), terminate: () => new Promise(() => {}) } : worker() });
  await assert.rejects(service.recognize(Buffer.alloc(1)), { code: 'OCR_TIMEOUT' });
  assert.equal((await service.recognize(Buffer.alloc(1))).data.text, 'recovered');
  await service.dispose();
});
test('dispose releases active recognition even if the worker never settles', async () => {
  const service = new OcrWorkerService({ createWorker: async () => ({ ...worker(), recognize: () => new Promise(() => {}) }) });
  const work = service.recognize(Buffer.alloc(1)); const rejected = assert.rejects(work, /disposed/);
  await flush(); await service.dispose(); await rejected;
  await assert.rejects(service.recognize(Buffer.alloc(1)), /disposed/);
});

test('dispose also cancels a worker creation that never settles', async () => {
  const service = new OcrWorkerService({ createWorker: () => new Promise(() => {}) });
  const initializing = service.initialize();
  const rejected = assert.rejects(initializing, /disposed/);
  await flush(); await service.dispose(); await rejected;
});
