(function initScreenOcrCoordinator(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ScreenOcrCoordinatorModule = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createScreenOcrCoordinator() {
  class ScreenOcrCoordinator {
    constructor(options) {
      this.output = options.output;
      this.stabilizer = options.stabilizer;
      this.readOcr = options.readOcr;
      this.translate = options.translate;
      this.hasOcrArea = options.hasOcrArea;
      this.onRunningChange = options.onRunningChange || (() => {});
      this.getCachedTranslation = options.getCachedTranslation || (() => null);
      this.setCachedTranslation = options.setCachedTranslation || (() => {});
      this.setTimeout = options.setTimeout || setTimeout;
      this.clearTimeout = options.clearTimeout || clearTimeout;
      this.ocrIntervalMs = options.ocrIntervalMs || 1000;
      this.candidateTimeoutMs = options.candidateTimeoutMs || 180;
      this.holdClearMs = options.holdClearMs || 2000;
      this.isRunning = false;
      this.isBusy = false;
      this.generation = 0;
      this.ocrTimer = null;
      this.candidateTimer = null;
      this.holdClearTimer = null;
      this.latestTranslationKey = '';
      this.translationRequestId = 0;
      this.lastGoodEnglish = '';
      this.lastGoodRussian = '';
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
    }

    start() {
      if (this.isRunning) return;
      this.isRunning = true;
      this.generation += 1;
      this.stabilizer.reset();
      this.resetVolatileState();
      this.onRunningChange(true);
      this.output.setStatus('Screen OCR: scanning every 1 second');
      this.read({ scheduleNext: true, generation: this.generation });
    }

    stop(message = 'Screen OCR stopped') {
      this.isRunning = false;
      this.generation += 1;
      this.resetVolatileState();
      this.onRunningChange(false);
      this.output.setStatus(message);
    }

    readOnce() {
      this.read({ scheduleNext: false, generation: this.generation });
    }

    async read({ scheduleNext, generation }) {
      if (this.isBusy) {
        this.output.setStatus('OCR is already reading. Wait a moment.');
        return;
      }

      if (!this.hasOcrArea()) {
        this.output.setStatus('Select OCR area first');
        if (this.isRunning) this.stop('Select OCR area first');
        return;
      }

      this.isBusy = true;
      this.output.setStatus('Reading subtitle...');

      try {
        const text = await this.readOcr();
        if (generation !== this.generation) return;

        const result = this.stabilizer.process(text);
        this.handleStabilizerResult(result, generation);
      } catch (error) {
        if (generation === this.generation) this.output.setStatus(`Screen OCR error: ${error.message}`);
      } finally {
        this.isBusy = false;
        if (scheduleNext && this.isRunning && generation === this.generation) {
          this.ocrTimer = this.setTimeout(() => this.read({ scheduleNext: true, generation }), this.ocrIntervalMs);
        }
      }
    }

    handleStabilizerResult(result, generation) {
      if (result.shouldClearAfterHold && !this.holdClearTimer) {
        this.holdClearTimer = this.setTimeout(() => {
          if (generation !== this.generation) return;
          this.output.clear();
          this.stabilizer.reset();
          this.holdClearTimer = null;
        }, this.holdClearMs);
      }

      if (!result.candidate) {
        if (result.reason === 'same') this.output.setStatus('Same subtitle, already translated');
        else if (result.reason === 'similar') this.output.setStatus('Similar subtitle, reusing previous translation');
        else this.output.setStatus(result.rawText ? `Ignored OCR noise: ${result.rawText.slice(0, 40)}` : 'No subtitle detected in selected area');
        return;
      }

      this.clearTimeout(this.holdClearTimer);
      this.holdClearTimer = null;
      this.output.showRecognizedText(result.rawText);
      this.output.showTranslationPending(result.rawText);
      this.clearTimeout(this.candidateTimer);
      this.candidateTimer = this.setTimeout(() => {
        if (generation !== this.generation) return;
        const accepted = this.stabilizer.acceptCandidate();
        if (!accepted.accepted) return;
        this.lastGoodEnglish = accepted.rawText;
        this.translateAccepted(accepted.normalizedText, accepted.rawText, generation);
        this.output.setStatus('Screen OCR: subtitle queued for translation');
      }, this.candidateTimeoutMs);

      this.output.setStatus(result.reason === 'growing'
        ? 'Screen OCR: subtitle growing, waiting...'
        : 'Screen OCR: subtitle detected, translating...');
    }

    async translateAccepted(normalizedKey, displayText, generation) {
      this.latestTranslationKey = normalizedKey;
      const requestId = ++this.translationRequestId;
      const cached = this.getCachedTranslation(normalizedKey);
      if (cached) {
        if (generation === this.generation && normalizedKey === this.latestTranslationKey) {
          this.output.showTranslation(cached);
          this.lastGoodRussian = cached;
          this.output.setStatus('Screen OCR: subtitle translated');
        }
        return;
      }

      try {
        const translation = await this.translate(displayText, { scope: 'screen-ocr' });
        if (generation !== this.generation || requestId !== this.translationRequestId || normalizedKey !== this.latestTranslationKey) return;
        this.output.showTranslation(translation);
        this.lastGoodRussian = translation;
        this.setCachedTranslation(normalizedKey, translation);
        this.output.setStatus('Screen OCR: subtitle translated');
      } catch (error) {
        if (generation === this.generation && requestId === this.translationRequestId && error?.code !== 'ABORTED' && error?.code !== 'STALE') {
          this.output.showTranslationError('Translation failed');
        }
      }
    }
  }

  return { ScreenOcrCoordinator };
}));
