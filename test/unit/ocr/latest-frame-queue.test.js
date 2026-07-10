const test = require('node:test');
const assert = require('node:assert/strict');
const { LatestFrameQueue } = require('../../../src/shared/ocr/latest-frame-queue');
test('latest frame replaces pending, clears on stop, and excludes stale generations', () => {
  const queue = new LatestFrameQueue(); const first = { id: 1, generation: 1, image: Buffer.alloc(1) }; const newest = { id: 2, generation: 1, image: Buffer.alloc(1) };
  queue.enqueue(first); queue.enqueue(newest); assert.equal(queue.replacedCount, 1); assert.equal(queue.take(1), newest); assert.equal(queue.pending, null);
  queue.enqueue(first); queue.clear(); assert.equal(queue.pending, null); const next = { id: 3, generation: 2 }; queue.enqueue(next); assert.equal(queue.take(1), null); assert.equal(queue.take(2), next);
});
