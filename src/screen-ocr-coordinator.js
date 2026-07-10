(function initScreenOcrCoordinator(root, factory) {
  const deps = typeof require === 'function' ? { LatestFrameQueue: require('./latest-frame-queue').LatestFrameQueue } : root.LatestFrameQueueModule;
  const api = factory(deps.LatestFrameQueue);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ScreenOcrCoordinatorModule = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createScreenOcrCoordinator(LatestFrameQueue) {
  class ScreenOcrCoordinator {
    constructor(options) {
      this.output = options.output;
      this.stabilizer = options.stabilizer;
      this.readOcr = options.readOcr;
      this.captureFrame = options.captureFrame;
      this.recognizeFrame = options.recognizeFrame;
      this.translate = options.translate;
      this.hasOcrArea = options.hasOcrArea;
      this.onRunningChange = options.onRunningChange || (() => {});
      this.onMetrics = options.onMetrics || (() => {});
      this.getCachedTranslation = options.getCachedTranslation || (() => null);
      this.setCachedTranslation = options.setCachedTranslation || (() => {});
      this.setTimeout = options.setTimeout || ((callback, delay) => globalThis.setTimeout(callback, delay));
      this.clearTimeout = options.clearTimeout || ((timerId) => globalThis.clearTimeout(timerId));
      this.now = options.now || (() => performance.now());
      this.debug = options.debug || (() => false);
      this.ocrIntervalMs = options.ocrIntervalMs || 200;
      this.candidateTimeoutMs = options.candidateTimeoutMs || 180;
      this.holdClearMs = options.holdClearMs || 2000;
      this.isRunning = false;
      this.isBusy = false;
      this.captureBusy = false;
      this.generation = 0;
      this.ocrTimer = null;
      this.candidateTimer = null;
      this.holdClearTimer = null;
      this.latestTranslationKey = '';
      this.translationRequestId = 0;
      this.lastGoodEnglish = '';
      this.lastGoodRussian = '';
      this.lastAcceptedConfidence = undefined;
      this.queue = new LatestFrameQueue();
      this.skippedUnchangedFrames = 0;
      this.discardedStaleResults = 0;
      this.subtitleState = 'absent';
      this.emptyAfterChangeCount = 0;
    }

    log(event, details = {}) {
      if (this.debug()) console.debug(`[OCR] ${event}`, details);
    }

    resetVolatileState() {
      this.clearTimeout(this.ocrTimer);
      this.clearTimeout(this.candidateTimer);
      this.clearTimeout(this.holdClearTimer);
      this.ocrTimer = null;
      this.candidateTimer = null;
      this.holdClearTimer = null;
      this.latestTranslationKey = '';
      this.translationRequestId += 1;
      this.queue.clear();
      this.subtitleState = 'absent';
      this.emptyAfterChangeCount = 0;
      this.lastGoodEnglish = '';
      this.lastAcceptedConfidence = undefined;
    }

    start() {
      if (this.isRunning) return;
      this.isRunning = true;
      this.generation += 1;
      this.stabilizer.reset();
      this.resetVolatileState();
      this.onRunningChange(true);
      this.output.setStatus('Screen OCR: scanning every 200 ms');
      return this.capture({ scheduleNext: true, generation: this.generation });
    }

    stop(message = 'Screen OCR stopped') {
      this.isRunning = false;
      this.generation += 1;
      this.resetVolatileState();
      this.onRunningChange(false);
      this.output.setStatus(message);
      if (typeof this.output.hideOverlay === 'function') this.output.hideOverlay();
      if (typeof this.output.setVisible === 'function') this.output.setVisible(false);
    }

    readOnce() {
      if (!this.captureFrame) return this.readLegacy({ scheduleNext: false, generation: this.generation });
      return this.capture({ scheduleNext: false, generation: this.generation, waitForOcr: true });
    }

    async capture({ scheduleNext, generation, waitForOcr = false }) {
      if (!this.captureFrame) return this.readLegacy({ scheduleNext, generation });
      if (this.captureBusy) return;
      if (!this.hasOcrArea()) {
        this.output.setStatus('Select OCR area first');
        if (this.isRunning) this.stop('Select OCR area first');
        return;
      }
      this.captureBusy = true;
      try {
        const frame = await this.captureFrame(generation);
        this.log('frame captured', { generation, frameId: frame?.id });
        if (generation !== this.generation) return;
        if (!frame) { this.skippedUnchangedFrames += 1; this.log('frame skipped', { generation, reason: 'unchanged' }); }
        else {
          frame.generation = generation;
          this.queue.enqueue(frame);
          this.log('frame queued', { generation, frameId: frame.id });
          const work = this.consume(generation);
          if (waitForOcr) await work;
        }
      } catch (error) {
        if (generation === this.generation) this.output.setStatus(`Screen OCR error: ${error.message}`);
      } finally {
        this.captureBusy = false;
        if (this.isRunning && scheduleNext && generation === this.generation) {
          this.ocrTimer = this.setTimeout(() => this.capture({ scheduleNext: true, generation }), this.ocrIntervalMs);
        } else if (this.isRunning && generation !== this.generation) {
          this.capture({ scheduleNext: true, generation: this.generation });
        }
      }
    }

    async consume(generation) {
      if (this.isBusy) return;
      this.isBusy = true;
      try {
        let frame;
        while ((frame = this.queue.take(generation))) {
          const queuedAt = this.now();
          try {
            this.log('OCR started', { generation, frameId: frame.id });
            const result = await this.recognizeFrame(frame);
            this.log('OCR completed', { generation, frameId: frame.id, textLength: (result?.text || '').length, confidence: result?.confidence });
            if (generation !== this.generation || frame.generation !== this.generation || this.queue.pending?.id > frame.id) {
              this.discardedStaleResults += 1;
              continue;
            }
            this.processText(result?.text || '', result?.confidence, generation, {
              ...result?.metrics,
              frameId: frame.id,
              generation,
              ocrQueueWaitMs: queuedAt - frame.capturedAt,
              ocrConfidence: result?.confidence,
              skippedUnchangedFrames: this.skippedUnchangedFrames,
              replacedPendingFrames: this.queue.replacedCount,
              discardedStaleResults: this.discardedStaleResults,
              imageChanged: Boolean(frame.imageChanged),
              forced: Boolean(frame.forced)
            });
          } catch (error) {
            this.log(error?.code === 'OCR_TIMEOUT' ? 'OCR timeout' : 'OCR failed', { generation, frameId: frame.id, message: error?.message });
            if (generation === this.generation) this.output.setStatus(`Screen OCR error: ${error.message}`);
          }
        }
      } finally {
        this.isBusy = false;
        this.log('busy flags released', { generation, pending: Boolean(this.queue.pending) });
        if (this.queue.pending && generation === this.generation) this.consume(generation);
      }
    }

    async readLegacy({ scheduleNext, generation }) {
      if (this.isBusy) { this.output.setStatus('OCR is already reading. Wait a moment.'); return; }
      if (!this.hasOcrArea()) { this.output.setStatus('Select OCR area first'); if (this.isRunning) this.stop('Select OCR area first'); return; }
      this.isBusy = true;
      this.output.setStatus('Reading subtitle...');
      try {
        const text = await this.readOcr();
        if (generation !== this.generation) return;
        this.processText(text, undefined, generation, {});
      } catch (error) {
        if (generation === this.generation) this.output.setStatus(`Screen OCR error: ${error.message}`);
      } finally {
        this.isBusy = false;
        if (this.isRunning && scheduleNext && generation === this.generation) this.ocrTimer = this.setTimeout(() => this.readLegacy({ scheduleNext: true, generation }), this.ocrIntervalMs);
        else if (this.isRunning && generation !== this.generation) this.readLegacy({ scheduleNext: true, generation: this.generation });
      }
    }

    processText(text, confidence, generation, metrics) {
      const startedAt = this.now();
      const result = this.stabilizer.process(text, confidence);
      if (result.candidate && this.lastGoodEnglish && Number.isFinite(confidence) && Number.isFinite(this.lastAcceptedConfidence) && confidence < this.lastAcceptedConfidence - 30) {
        // Do not replace a translated subtitle with a substantially weaker OCR candidate.
        this.stabilizer.candidateText = this.lastGoodEnglish;
        this.stabilizer.candidateNormalizedText = this.stabilizer.lastAcceptedText;
        this.stabilizer.candidateCount = 0;
        this.log('quality filter rejected', { reason: 'quality-regression', textLength: String(text || '').length, confidence });
        return;
      }
      this.log('quality filter ' + (['artifact', 'low-confidence', 'empty'].includes(result.reason) ? 'rejected' : 'accepted'), { reason: result.reason, textLength: String(text || '').length, confidence });
      this.handleStabilizerResult(result, generation, { ...metrics, confidence }, startedAt);
    }

    handleStabilizerResult(result, generation, metrics = {}, startedAt = this.now()) {
      const diagnostic = { ...metrics, stabilizationMs: this.now() - startedAt, stabilizerDecision: result.reason };
      this.log('stabilizer ' + (result.candidate ? 'accepted' : 'rejected'), { reason: result.reason });
      this.onMetrics(diagnostic);
      if (!result.candidate) {
        this.updateAbsenceState(result, metrics);
        if (result.reason === 'same') this.output.setStatus('Same subtitle, already translated');
        else if (result.reason === 'similar') this.output.setStatus('Similar subtitle, reusing previous translation');
        else this.output.setStatus(result.rawText ? `Ignored OCR noise: ${result.rawText.slice(0, 40)}` : 'No subtitle detected in selected area');
        return;
      }
      this.emptyAfterChangeCount = 0;
      this.subtitleState = 'present';
      this.output.showRecognizedText(result.rawText);
      this.output.showTranslationPending(result.rawText);
      this.clearTimeout(this.candidateTimer);
      this.candidateTimer = this.setTimeout(() => {
        if (generation !== this.generation) return;
          const accepted = this.stabilizer.acceptCandidate();
          if (!accepted.accepted) return;
          this.lastGoodEnglish = accepted.rawText;
          this.lastAcceptedConfidence = metrics.confidence;
        this.translateAccepted(accepted.normalizedText, accepted.rawText, generation, diagnostic);
        this.output.setStatus('Screen OCR: subtitle queued for translation');
      }, this.candidateTimeoutMs);
      this.output.setStatus(result.reason === 'growing' ? 'Screen OCR: subtitle growing, waiting...' : 'Screen OCR: subtitle detected, translating...');
    }

    updateAbsenceState(result, metrics) {
      // A stable paused frame is not evidence that subtitles disappeared.
      if (result.reason !== 'empty') return;
      if (metrics.imageChanged && this.subtitleState === 'present') {
        this.subtitleState = 'possible-absent';
        this.emptyAfterChangeCount = 1;
      } else if (this.subtitleState === 'possible-absent' && (metrics.imageChanged || metrics.forced)) {
        this.emptyAfterChangeCount += 1;
      }
      if (this.subtitleState === 'possible-absent' && this.emptyAfterChangeCount >= 2) {
        this.subtitleState = 'absent';
        this.emptyAfterChangeCount = 0;
        this.translationRequestId += 1;
        this.latestTranslationKey = '';
        this.output.hideOverlay();
        this.stabilizer.reset();
        this.log('subtitle absent', { reason: 'confirmed-empty' });
      }
    }

    async translateAccepted(normalizedKey, displayText, generation, metrics = {}) {
      this.latestTranslationKey = normalizedKey;
      const requestId = ++this.translationRequestId;
      this.log('translation started', { generation, requestId, textLength: displayText.length });
      const translatedAt = this.now();
      const cached = this.getCachedTranslation(normalizedKey);
      if (cached) { if (generation === this.generation && normalizedKey === this.latestTranslationKey) { this.output.showTranslation(cached); this.log('translation completed', { generation, requestId, cached: true }); this.lastGoodRussian = cached; this.output.setStatus('Screen OCR: subtitle translated'); this.onMetrics({ ...metrics, translationMs: 0, acceptedToDisplayedMs: this.now() - translatedAt, totalMs: metrics.capturedAt ? this.now() - metrics.capturedAt : undefined }); } return; }
      try {
        const translation = await this.translate(displayText, { scope: 'screen-ocr' });
        if (generation !== this.generation || requestId !== this.translationRequestId || normalizedKey !== this.latestTranslationKey) return;
        this.output.showTranslation(translation); this.log('translation completed', { generation, requestId, cached: false }); this.lastGoodRussian = translation; this.setCachedTranslation(normalizedKey, translation); this.output.setStatus('Screen OCR: subtitle translated');
        this.onMetrics({ ...metrics, translationMs: this.now() - translatedAt, acceptedToDisplayedMs: this.now() - translatedAt, totalMs: metrics.capturedAt ? this.now() - metrics.capturedAt : undefined });
      } catch (error) { if (generation === this.generation && requestId === this.translationRequestId && error?.code !== 'ABORTED' && error?.code !== 'STALE') this.output.showTranslationError('Translation failed'); }
    }
  }
  return { ScreenOcrCoordinator };
}));
