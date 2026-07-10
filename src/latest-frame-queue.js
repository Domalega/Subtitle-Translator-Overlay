'use strict';

class LatestFrameQueue {
  constructor() {
    this.pending = null;
    this.replacedCount = 0;
  }

  enqueue(frame) {
    if (this.pending) this.replacedCount += 1;
    this.pending = frame;
  }

  take(generation) {
    if (!this.pending || this.pending.generation !== generation) return null;
    const frame = this.pending;
    this.pending = null;
    return frame;
  }

  clear(generation) {
    if (generation === undefined || this.pending?.generation === generation) this.pending = null;
  }
}

if (typeof module === 'object' && module.exports) module.exports = { LatestFrameQueue };
if (typeof globalThis !== 'undefined') globalThis.LatestFrameQueueModule = { LatestFrameQueue };
