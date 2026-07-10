const test = require('node:test');
const assert = require('node:assert/strict');
const { ScreenOcrCoordinator } = require('../src/screen-ocr-coordinator');
const { SubtitleStabilizer } = require('../src/subtitle-stabilizer');

function createOutput() {
  return {
    recognized: '',
    translation: '',
    status: '',
    showRecognizedText(text) { this.recognized = text; },
    showTranslation(text) { this.translation = text; },
    showTranslationPending() { if (!this.translation) this.translation = 'Translating...'; },
    showTranslationError(message) { this.status = message; },
    setStatus(message) { this.status = message; },
    clear() { this.recognized = ''; this.translation = ''; }
  };
}

function createScheduler() {
  let nextId = 1;
  const timers = [];
  return {
    setTimeout(callback, delay) {
      const timer = { id: nextId++, callback, delay, canceled: false };
      timers.push(timer);
      return timer.id;
    },
    clearTimeout(timerId) {
      const timer = timers.find((entry) => entry.id === timerId);
      if (timer) timer.canceled = true;
    },
    runNext() {
      const timer = timers.find((entry) => !entry.canceled);
      if (!timer) return false;
      timer.canceled = true;
      timer.callback();
      return true;
    },
    pendingCount() {
      return timers.filter((entry) => !entry.canceled).length;
    }
  };
}

function createCoordinator(options = {}) {
  const scheduler = options.scheduler || createScheduler();
  const output = options.output || createOutput();
  const coordinator = new ScreenOcrCoordinator({
    output,
    stabilizer: options.stabilizer || new SubtitleStabilizer(),
    hasOcrArea: options.hasOcrArea || (() => true),
    readOcr: options.readOcr || (async () => 'Hello, this is a subtitle'),
    translate: options.translate || (async () => 'translation'),
    setTimeout: scheduler.setTimeout,
    clearTimeout: scheduler.clearTimeout,
    candidateTimeoutMs: 1,
    ocrIntervalMs: 1
  });
  return { coordinator, output, scheduler };
}

test('ScreenOcrCoordinator start launches OCR', async () => {
  let calls = 0;
  const { coordinator } = createCoordinator({
    readOcr: async () => {
      calls += 1;
      return 'Hello, this is a subtitle';
    }
  });

  await coordinator.start();
  assert.equal(calls, 1);
});

test('ScreenOcrCoordinator start does not create a second parallel cycle', async () => {
  let calls = 0;
  let resolveOcr;
  const { coordinator } = createCoordinator({
    readOcr: () => {
      calls += 1;
      return new Promise((resolve) => { resolveOcr = resolve; });
    }
  });

  const firstRead = coordinator.start();
  coordinator.start();
  resolveOcr('Hello, this is a subtitle');
  await firstRead;
  assert.equal(calls, 1);
});

test('ScreenOcrCoordinator readOnce calls OCR exactly once', async () => {
  let calls = 0;
  const { coordinator } = createCoordinator({
    readOcr: async () => {
      calls += 1;
      return 'Hello, this is a subtitle';
    }
  });

  await coordinator.readOnce();
  assert.equal(calls, 1);
});

test('ScreenOcrCoordinator readOnce releases busy after error', async () => {
  let calls = 0;
  const { coordinator, output } = createCoordinator({
    readOcr: async () => {
      calls += 1;
      if (calls === 1) throw new Error('first failure');
      return 'Hello, this is a subtitle';
    }
  });

  await coordinator.readOnce();
  assert.equal(output.status, 'Screen OCR error: first failure');
  await coordinator.readOnce();
  assert.equal(calls, 2);
});

test('ScreenOcrCoordinator start releases busy after error', async () => {
  let calls = 0;
  const { coordinator } = createCoordinator({
    readOcr: async () => {
      calls += 1;
      throw new Error('failed');
    }
  });

  await coordinator.start();
  assert.equal(coordinator.isBusy, false);
  coordinator.stop('stopped');
  await coordinator.start();
  assert.equal(calls, 2);
});

test('ScreenOcrCoordinator stop cancels the next scheduled iteration', async () => {
  let calls = 0;
  const { coordinator, scheduler } = createCoordinator({
    readOcr: async () => {
      calls += 1;
      return '';
    }
  });

  await coordinator.start();
  assert.equal(scheduler.pendingCount(), 1);
  coordinator.stop('stopped');
  assert.equal(scheduler.pendingCount(), 0);
  scheduler.runNext();
  assert.equal(calls, 1);
});

test('ScreenOcrCoordinator ignores OCR result after stop', async () => {
  let resolveOcr;
  const { coordinator, output } = createCoordinator({
    readOcr: () => new Promise((resolve) => { resolveOcr = resolve; }),
    translate: async () => 'translation'
  });

  coordinator.start();
  coordinator.stop('stopped');
  resolveOcr('Hello, this is a subtitle');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(output.recognized, '');
  assert.equal(output.status, 'stopped');
});

test('ScreenOcrCoordinator blocks parallel Read once during active OCR', async () => {
  let calls = 0;
  let resolveOcr;
  const { coordinator } = createCoordinator({
    readOcr: () => {
      calls += 1;
      return new Promise((resolve) => { resolveOcr = resolve; });
    },
    translate: async () => 'translation'
  });

  coordinator.readOnce();
  coordinator.readOnce();
  resolveOcr('Hello, this is a subtitle');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls, 1);
});

test('ScreenOcrCoordinator stop/start ignores old result', async () => {
  let resolveFirst;
  const reads = [
    () => new Promise((resolve) => { resolveFirst = resolve; }),
    async () => 'Second subtitle is valid text'
  ];
  const { coordinator, output } = createCoordinator({
    readOcr: () => reads.shift()()
  });

  coordinator.start();
  coordinator.stop('stopped');
  resolveFirst('First subtitle should not be shown');
  await new Promise((resolve) => setTimeout(resolve, 0));
  const secondRead = coordinator.start();
  await secondRead;
  assert.equal(output.recognized, 'Second subtitle is valid text');
});

test('ScreenOcrCoordinator resumes after an immediate stop/start during OCR', async () => {
  let resolveFirst;
  let calls = 0;
  const { coordinator, output } = createCoordinator({
    readOcr: () => {
      calls += 1;
      if (calls === 1) return new Promise((resolve) => { resolveFirst = resolve; });
      return Promise.resolve('Second subtitle is valid text');
    }
  });

  coordinator.start();
  coordinator.stop('stopped');
  coordinator.start();
  resolveFirst('First subtitle should not be shown');
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(calls, 2);
  assert.equal(output.recognized, 'Second subtitle is valid text');
});

test('ScreenOcrCoordinator calls output methods with their object receiver', async () => {
  const output = {
    recognized: '',
    translation: '',
    status: '',
    showRecognizedText(text) { assert.equal(this, output); this.recognized = text; },
    showTranslation(text) { assert.equal(this, output); this.translation = text; },
    showTranslationPending() { assert.equal(this, output); },
    showTranslationError(message) { assert.equal(this, output); this.status = message; },
    setStatus(message) { assert.equal(this, output); this.status = message; },
    clear() { assert.equal(this, output); }
  };
  const { coordinator, scheduler } = createCoordinator({ output });

  await coordinator.readOnce();
  scheduler.runNext();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(output.recognized, 'Hello, this is a subtitle');
  assert.equal(output.translation, 'translation');
});

test('ScreenOcrCoordinator dependency wrappers preserve receiver-sensitive calls', async () => {
  const api = {
    readScreenSubtitle() { assert.equal(this, api); return 'Hello, this is a subtitle'; },
    translate(text) { assert.equal(this, api); return `${text} translated`; }
  };
  const { coordinator, scheduler, output } = createCoordinator({
    readOcr: (...args) => api.readScreenSubtitle(...args),
    translate: (...args) => api.translate(...args)
  });

  await coordinator.readOnce();
  scheduler.runNext();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(output.translation, 'Hello, this is a subtitle translated');
});
