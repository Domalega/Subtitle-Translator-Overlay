'use strict';

class FrameChangeDetector {
  constructor({ width = 24, height = 12, threshold = 0.08, forcedIntervalMs = 1000, now = () => performance.now() } = {}) {
    this.width = width;
    this.height = height;
    this.threshold = threshold;
    this.forcedIntervalMs = forcedIntervalMs;
    this.now = now;
    this.reset();
  }

  reset() {
    this.previous = null;
    this.lastOcrAt = -Infinity;
  }

  createFingerprint(buffer, imageSize) {
    const sourceWidth = Math.round(imageSize?.width);
    const sourceHeight = Math.round(imageSize?.height);
    if (!Buffer.isBuffer(buffer) || sourceWidth < 1 || sourceHeight < 1 || buffer.length < sourceWidth * sourceHeight * 4) return null;
    const values = new Uint8Array(this.width * this.height);
    for (let y = 0; y < this.height; y += 1) {
      const sourceY = Math.min(sourceHeight - 1, Math.floor((y + 0.5) * sourceHeight / this.height));
      for (let x = 0; x < this.width; x += 1) {
        const sourceX = Math.min(sourceWidth - 1, Math.floor((x + 0.5) * sourceWidth / this.width));
        const offset = (sourceY * sourceWidth + sourceX) * 4;
        values[y * this.width + x] = Math.round((buffer[offset + 2] * 0.299) + (buffer[offset + 1] * 0.587) + (buffer[offset] * 0.114));
      }
    }
    return { width: sourceWidth, height: sourceHeight, values };
  }

  inspect(buffer, imageSize, timestamp = this.now()) {
    const fingerprint = this.createFingerprint(buffer, imageSize);
    if (!fingerprint) return { changed: true, forced: false, score: 1, fingerprint: null };
    const sizeChanged = this.previous && (this.previous.width !== fingerprint.width || this.previous.height !== fingerprint.height);
    let score = 1;
    if (this.previous && !sizeChanged) {
      let difference = 0;
      for (let index = 0; index < fingerprint.values.length; index += 1) difference += Math.abs(fingerprint.values[index] - this.previous.values[index]);
      score = difference / (fingerprint.values.length * 255);
    }
    const forced = timestamp - this.lastOcrAt >= this.forcedIntervalMs;
    const imageChanged = !this.previous || sizeChanged || score >= this.threshold;
    const changed = imageChanged || forced;
    this.previous = fingerprint;
    if (changed) this.lastOcrAt = timestamp;
    return { changed, imageChanged, forced, score, fingerprint };
  }
}

module.exports = { FrameChangeDetector };
