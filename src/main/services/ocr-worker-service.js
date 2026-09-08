'use strict';

function selectSubtitleLayout(layout = 'multi-line') {
  return layout === 'single-line' ? '7' : layout === 'sparse' ? '11' : '6';
}

class OcrWorkerService {
  constructor({ createWorker, logger = () => {}, layout = 'multi-line', now = () => performance.now(), setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout, recognizeTimeoutMs = 10000, initializeTimeoutMs = 20000, terminateTimeoutMs = 1000 }) {
    Object.assign(this, { createWorker, logger, layout, now, recognizeTimeoutMs, initializeTimeoutMs, terminateTimeoutMs });
    this.setTimeout = setTimeoutFn;
    this.clearTimeout = clearTimeoutFn;
    this.worker = null;
    this.initializePromise = null;
    this.recognizeTail = Promise.resolve();
    this.retirePromise = Promise.resolve();
    this.activeRequest = null;
    this.disposed = false;
    this.epoch = 0;
    this.terminated = new WeakSet();
    this.activeCancel = null;
  }
  timed(promise, milliseconds, code, onTimeout = () => {}) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = this.setTimeout(() => {
        const error = Object.assign(new Error(`OCR timed out after ${milliseconds} ms`), { code });
        reject(error);
        onTimeout();
      }, milliseconds);
    });
    return Promise.race([promise, timeout]).finally(() => this.clearTimeout(timer));
  }
  retire(worker) {
    if (!worker || this.terminated.has(worker)) return Promise.resolve();
    this.terminated.add(worker);
    return this.timed(Promise.resolve().then(() => worker.terminate()), this.terminateTimeoutMs, 'OCR_TERMINATE_TIMEOUT').catch(() => {});
  }
  initialize() {
    if (this.disposed) return Promise.reject(new Error('OCR worker service is disposed'));
    if (this.worker) return Promise.resolve(this.worker);
    if (this.initializePromise) return this.initializePromise;
    const startedAt = this.now();
    const epoch = this.epoch;
    let createdWorker;
    const work = this.retirePromise.then(() => {
      if (this.disposed || epoch !== this.epoch) throw new Error('OCR initialization cancelled');
      return this.createWorker('eng', 1, { logger: message => this.logger({ ...message, request: this.activeRequest }), errorHandler: message => this.logger({ status: 'worker-error', message: String(message) }) });
    }).then(async worker => {
      createdWorker = worker;
      if (this.disposed || epoch !== this.epoch) { await this.retire(worker); throw new Error('OCR initialization cancelled'); }
      await worker.setParameters({ tessedit_pageseg_mode: selectSubtitleLayout(this.layout), preserve_interword_spaces: '1' });
      if (this.disposed || epoch !== this.epoch) { await this.retire(worker); throw new Error('OCR initialization cancelled'); }
      this.worker = worker;
      this.workerInitMs = this.now() - startedAt;
      this.logger({ status: 'worker-ready', workerInitMs: this.workerInitMs });
      return worker;
    });
    const cancelled = new Promise((_, reject) => { this.initializeCancel = () => reject(new Error('OCR worker service is disposed')); });
    const initialization = this.timed(Promise.race([work, cancelled]), this.initializeTimeoutMs, 'OCR_INITIALIZE_TIMEOUT', () => {
      this.epoch += 1;
      this.retirePromise = this.retire(createdWorker);
    }).catch(async error => {
      await this.retire(createdWorker);
      if (this.initializePromise === initialization) this.initializePromise = null;
      throw error;
    }).finally(() => { if (this.initializePromise === initialization) this.initializeCancel = null; });
    this.initializePromise = initialization;
    return initialization;
  }
  async resetWorker(worker = this.worker) {
    this.epoch += 1;
    if (this.worker === worker) this.worker = null;
    this.initializePromise = null;
    this.retirePromise = this.retire(worker);
    await this.retirePromise;
  }
  recognize(image, request = {}) {
    const run = async () => {
      const worker = await this.initialize();
      if (this.disposed) throw new Error('OCR worker service is disposed');
      this.activeRequest = request;
      const cancelled = new Promise((_, reject) => { this.activeCancel = () => reject(new Error('OCR worker service is disposed')); });
      try {
        return await this.timed(Promise.race([Promise.resolve().then(() => worker.recognize(image, {}, { text: true })), cancelled]),
          this.recognizeTimeoutMs, 'OCR_TIMEOUT', () => { void this.resetWorker(worker); });
      } catch (error) {
        throw error instanceof Error ? error : new Error(String(error));
      } finally {
        this.activeCancel = null;
        this.activeRequest = null;
      }
    };
    const result = this.recognizeTail.then(run);
    this.recognizeTail = result.catch(() => {});
    return result;
  }
  async dispose() {
    if (this.disposed) return this.retirePromise;
    this.disposed = true;
    this.initializeCancel?.();
    this.activeCancel?.();
    await this.resetWorker();
  }
}
module.exports = { OcrWorkerService, selectSubtitleLayout };
