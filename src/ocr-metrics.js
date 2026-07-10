'use strict';

class OcrMetrics {
  constructor({ enabled = process.env.OCR_DEBUG === '1', maxEntries = 200, log = console.debug } = {}) {
    this.enabled = enabled;
    this.maxEntries = maxEntries;
    this.log = log;
    this.count = 0;
  }

  record(entry) {
    if (!this.enabled || this.count >= this.maxEntries) return;
    this.count += 1;
    this.log('[OCR]', entry);
  }
}

module.exports = { OcrMetrics };
