const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { OcrDiagnosticSampleService, createMetadata, createSampleFolderName } = require('../../../src/main/services/ocr-diagnostic-sample-service');

async function createFixture(options = {}) {
  const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'ocr-diagnostics-test-'));
  const service = new OcrDiagnosticSampleService({
    getUserDataPath: () => userData,
    getAppVersion: () => '0.2.1-test',
    now: options.now || (() => new Date('2026-07-11T12:34:56.789Z')),
    random: () => 0.123,
    fs: options.fs || fs
  });
  return { service, userData };
}

function recordSample(service, frameId = 1) {
  return service.recordCompletedCycle({
    frameId,
    sourceImage: Buffer.from('source'),
    ocrInputImage: Buffer.from('input'),
    captureMode: 'manual',
    ocrArea: { x: 10, y: 20, width: 300, height: 80 },
    screen: { width: 1920, height: 1080, scaleFactor: 1.25 },
    ocr: { text: 'Example subtitle', confidence: 88, durationMs: 42 }
  });
}

test('creates a safe timestamp sample folder name', () => {
  assert.equal(createSampleFolderName(new Date(2026, 6, 11, 2, 3, 4, 5)), '2026-07-11_02-03-04-005');
  assert.match(createSampleFolderName(new Date()), /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}$/);
});

test('metadata replaces unavailable values with null and never contains undefined', () => {
  const metadata = createMetadata({ createdAt: undefined, ocrArea: {}, screen: {}, ocr: {}, decision: {}, translation: {} });
  assert.equal(JSON.stringify(metadata).includes('undefined'), false);
  assert.deepEqual(metadata.ocrArea, { x: null, y: null, width: null, height: null });
  assert.deepEqual(metadata.translation, { requested: null, completed: null, durationMs: null });
  assert.deepEqual(metadata.tracking, { state: null, reacquireCount: null, areaSource: null, lineCountEstimate: null, areaAdapted: null, adaptationReason: null });
});

test('metadata records automatic area tracking without changing image fields', () => {
  const metadata = createMetadata({ captureMode: 'automatic', tracking: { state: 'locked', reacquireCount: 2, areaSource: 'automatic', lineCountEstimate: 2, areaAdapted: true, adaptationReason: 'second-line-above' }, ocrArea: {}, screen: {}, ocr: {}, decision: {}, translation: {} });
  assert.equal(metadata.captureMode, 'automatic');
  assert.deepEqual(metadata.tracking, { state: 'locked', reacquireCount: 2, areaSource: 'automatic', lineCountEstimate: 2, areaAdapted: true, adaptationReason: 'second-line-above' });
});

test('saves expected images and metadata in a separate sample directory', async (t) => {
  const { service, userData } = await createFixture();
  t.after(() => fs.rm(userData, { recursive: true, force: true }));
  recordSample(service);
  service.updateLastCycle(1, { decision: { accepted: true, reason: 'accepted', normalizedText: 'example subtitle' } });

  assert.deepEqual(await service.saveLastSample(), { ok: true });
  const root = service.diagnosticsPath();
  const entries = await fs.readdir(root);
  assert.equal(entries.length, 1);
  const samplePath = path.join(root, entries[0]);
  assert.equal((await fs.readFile(path.join(samplePath, 'source.png'))).toString(), 'source');
  assert.equal((await fs.readFile(path.join(samplePath, 'ocr-input.png'))).toString(), 'input');
  const metadata = JSON.parse(await fs.readFile(path.join(samplePath, 'metadata.json'), 'utf8'));
  assert.equal(metadata.appVersion, '0.2.1-test');
  assert.equal(metadata.decision.normalizedText, 'example subtitle');
});

test('writing failure returns a safe error, cleans only its temporary folder, and preserves earlier samples', async (t) => {
  const { service, userData } = await createFixture();
  t.after(() => fs.rm(userData, { recursive: true, force: true }));
  recordSample(service);
  assert.deepEqual(await service.saveLastSample(), { ok: true });
  const existing = await fs.readdir(service.diagnosticsPath());
  const failingFs = { ...fs, writeFile: async () => { throw new Error('disk full'); } };
  service.fs = failingFs;

  assert.deepEqual(await service.saveLastSample(), { ok: false, error: 'SAVE_FAILED' });
  assert.deepEqual(await fs.readdir(service.diagnosticsPath()), existing);
  assert.equal((await fs.readdir(service.diagnosticsPath())).some((entry) => entry.startsWith('.')), false);
});

test('keeps only the last completed OCR cycle and rejects updates for earlier cycles', async () => {
  const { service, userData } = await createFixture();
  try {
    recordSample(service, 1);
    recordSample(service, 2);
    assert.equal(service.updateLastCycle(1, { decision: { accepted: false, reason: 'old', normalizedText: '' } }), false);
    assert.equal(service.updateLastCycle(2, { decision: { accepted: false, reason: 'latest', normalizedText: '' } }), true);
    assert.equal(service.lastSample.frameId, 2);
    assert.equal(service.lastSample.decision.reason, 'latest');
  } finally {
    await fs.rm(userData, { recursive: true, force: true });
  }
});

test('saving without a completed OCR cycle reports a clear error', async () => {
  const { service, userData } = await createFixture();
  try {
    assert.deepEqual(await service.saveLastSample(), { ok: false, error: 'NO_COMPLETED_OCR_SAMPLE' });
  } finally {
    await fs.rm(userData, { recursive: true, force: true });
  }
});
