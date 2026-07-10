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
    clear() { this.recognized = ''; this.translation = ''; },
    hideOverlay() {}
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
    captureFrame: options.captureFrame,
    recognizeFrame: options.recognizeFrame,
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

test('ScreenOcrCoordinator keeps overlay visible for repeated unchanged empty OCR results', async () => {
  const scheduler = createScheduler();
  let reads = 0;
  const output = createOutput();
  let hideCalls = 0;
  output.hideOverlay = () => { hideCalls += 1; };
  const { coordinator } = createCoordinator({
    scheduler,
    output,
    stabilizer: new SubtitleStabilizer({ emptyFrameThreshold: 2 }),
    readOcr: async () => (reads++ === 0 ? 'Wait!' : '')
  });
  await coordinator.readOnce();
  scheduler.runNext();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await coordinator.readOnce();
  assert.equal(hideCalls, 0);
  await coordinator.readOnce();
  scheduler.runNext();
  assert.equal(hideCalls, 0);
});

test('ScreenOcrCoordinator stop hides overlay immediately and stale async work cannot restore it', async () => {
  let resolveTranslation;
  const output = createOutput(); let hideCalls = 0;
  output.hideOverlay = () => { hideCalls += 1; };
  const { coordinator, scheduler } = createCoordinator({ output, translate: () => new Promise((resolve) => { resolveTranslation = resolve; }) });
  await coordinator.readOnce(); scheduler.runNext();
  coordinator.stop('stopped'); resolveTranslation('late');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(hideCalls >= 1);
  assert.equal(output.translation, 'Translating...');
});

test('ScreenOcrCoordinator keeps an in-flight translation after a stable-frame hold period', async () => {
  let resolveTranslation;
  const output = createOutput(); let hideCalls = 0;
  output.hideOverlay = () => { hideCalls += 1; };
  const { coordinator, scheduler } = createCoordinator({ output, translate: () => new Promise((resolve) => { resolveTranslation = resolve; }) });
  await coordinator.readOnce();
  scheduler.runNext();
  scheduler.runNext();
  resolveTranslation('late');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(hideCalls, 0);
  assert.equal(output.translation, 'late');
});

test('ScreenOcrCoordinator confirms absence only after changed empty frame and forced empty check', async () => {
  const scheduler = createScheduler();
  const output = createOutput(); let hideCalls = 0;
  output.hideOverlay = () => { hideCalls += 1; };
  const { coordinator } = createCoordinator({ scheduler, output });
  coordinator.processText('Wait!', 80, 0, { imageChanged: true });
  scheduler.runNext();
  await new Promise(resolve => setTimeout(resolve, 0));
  coordinator.processText('', 80, 0, { imageChanged: true });
  assert.equal(coordinator.subtitleState, 'possible-absent');
  assert.equal(hideCalls, 0);
  coordinator.processText('', 80, 0, { forced: true });
  assert.equal(coordinator.subtitleState, 'absent');
  assert.equal(hideCalls, 1);
});

test('unchanged and forced duplicate subtitle results do not route another translation or hide overlay', async () => {
  const scheduler = createScheduler();
  const output = createOutput(); let translations = 0; let hideCalls = 0;
  output.hideOverlay = () => { hideCalls += 1; };
  const { coordinator } = createCoordinator({ scheduler, output, translate: async () => { translations += 1; return 'translation'; } });
  coordinator.processText('The subtitle stays visible.', 80, 0, { imageChanged: true });
  scheduler.runNext();
  await new Promise(resolve => setTimeout(resolve, 0));
  for (let index = 0; index < 20; index += 1) coordinator.processText('The subtitle stays visible.', 40 + index, 0, { forced: true });
  assert.equal(translations, 1);
  assert.equal(hideCalls, 0);
  assert.equal(output.translation, 'translation');
});

test('a substantially lower-confidence OCR candidate cannot replace a translated subtitle', async () => {
  const scheduler = createScheduler();
  const output = createOutput(); let translations = 0;
  const { coordinator } = createCoordinator({ scheduler, output, translate: async () => `translation-${++translations}` });
  coordinator.processText('A clear subtitle with enough words.', 90, 0, { imageChanged: true });
  scheduler.runNext();
  await new Promise(resolve => setTimeout(resolve, 0));
  coordinator.processText('A different but weak OCR phrase.', 40, 0, { imageChanged: true });
  assert.equal(translations, 1);
  assert.equal(output.translation, 'translation-1');
});

test('a timed out frame releases busy and the latest pending frame is recognized', async () => {
  let firstReject;
  let calls = 0;
  const { coordinator } = createCoordinator({
    captureFrame: async () => ({ id: ++calls, capturedAt: 0, image: Buffer.alloc(1) }),
    recognizeFrame: () => calls === 1 ? new Promise((_resolve, reject) => { firstReject = reject; }) : Promise.resolve({ text: 'Second subtitle is valid text', confidence: 80 }),
    translate: async () => 'translation'
  });
  const first = coordinator.capture({ scheduleNext: false, generation: coordinator.generation });
  await new Promise(resolve => setTimeout(resolve, 0));
  const second = coordinator.capture({ scheduleNext: false, generation: coordinator.generation });
  firstReject(Object.assign(new Error('timeout'), { code: 'OCR_TIMEOUT' }));
  await Promise.all([first, second]);
  assert.equal(coordinator.isBusy, false);
  assert.equal(calls, 2);
});
