'use strict';

function selectSubtitleLayout(layout = 'multi-line') {
  return layout === 'single-line' ? '7' : '6';
}

class OcrWorkerService {
  constructor({ createWorker, logger = () => {}, layout = 'multi-line', now = () => performance.now(), setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout, recognizeTimeoutMs = 10000 }) {
    this.createWorker = createWorker;
    this.logger = logger;
    this.layout = layout;
    this.now = now;
    this.setTimeout = setTimeoutFn;
    this.clearTimeout = clearTimeoutFn;
    this.recognizeTimeoutMs = recognizeTimeoutMs;
    this.worker = null;
    this.workerInitMs = undefined;
    this.initializePromise = null;
    this.recognizeTail = Promise.resolve();
    this.retirePromise = Promise.resolve();
    this.activeRequest = null;
    this.disposed = false;
  }

  initialize() {
    if (this.disposed) return Promise.reject(new Error('OCR worker service is disposed'));
    if (this.worker) return Promise.resolve(this.worker);
    if (this.initializePromise) return this.initializePromise;

    const startedAt = this.now();
    let createdWorker;
    this.initializePromise = this.retirePromise
      .then(() => this.createWorker('eng', 1, { logger: (message) => this.logger({ ...message, request: this.activeRequest }) }))
      .then(async (worker) => {
        createdWorker = worker;
        await worker.setParameters({
          tessedit_pageseg_mode: selectSubtitleLayout(this.layout),
          preserve_interword_spaces: '1'
        });
        this.worker = worker;
        this.workerInitMs = this.now() - startedAt;
        return worker;
      })
      .finally(() => {
        this.logger({ status: 'worker-ready', workerInitMs: this.workerInitMs || this.now() - startedAt });
      });

    this.initializePromise.catch(() => {
      if (createdWorker && createdWorker !== this.worker) createdWorker.terminate().catch(() => {});
      this.initializePromise = null;
    });
    return this.initializePromise;
  }

  async resetWorker(worker = this.worker) {
    if (worker && this.worker === worker) this.worker = null;
    this.initializePromise = null;
    this.retirePromise = this.retirePromise.then(() => worker?.terminate?.()).catch(() => {});
    await this.retirePromise;
  }

  recognize(image, request = {}) {
    const run = async () => {
      const worker = await this.initialize();
      this.activeRequest = request;
      let timerId;
      const timedOut = new Promise((_, reject) => {
        timerId = this.setTimeout(async () => {
          await this.resetWorker(worker);
          const error = new Error(`OCR timed out after ${this.recognizeTimeoutMs} ms`);
          error.code = 'OCR_TIMEOUT';
          reject(error);
        }, this.recognizeTimeoutMs);
      });
      try {
        // Tesseract.js v5 accepts binary image input and an output object as the third argument.
        return await Promise.race([worker.recognize(image, {}, { text: true }), timedOut]);
      } finally {
        this.clearTimeout(timerId);
        this.activeRequest = null;
      }
    };
    const result = this.recognizeTail.then(run, run);
    this.recognizeTail = result.catch(() => {});
    return result;
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const worker = this.worker;
    this.worker = null;
    if (worker) await this.resetWorker(worker);
  }
}

module.exports = { OcrWorkerService, selectSubtitleLayout };
