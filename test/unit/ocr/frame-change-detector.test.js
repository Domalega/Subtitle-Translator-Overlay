const test = require('node:test');
const assert = require('node:assert/strict');
const { FrameChangeDetector } = require('../../../src/shared/ocr/frame-change-detector');
function frame(value, width = 8, height = 8) { const data = Buffer.alloc(width * height * 4, value); for (let i = 3; i < data.length; i += 4) data[i] = 255; return { data, size: { width, height } }; }
test('detects first, identical, minor, significant, appearance, disappearance, and resized frames', () => {
  const detector = new FrameChangeDetector({ threshold: 0.05, forcedIntervalMs: 1000 }); const black = frame(0); const gray = frame(2); const white = frame(255);
  assert.equal(detector.inspect(black.data, black.size, 0).changed, true);
  assert.equal(detector.inspect(black.data, black.size, 1).changed, false);
  assert.equal(detector.inspect(gray.data, gray.size, 2).changed, false);
  assert.equal(detector.inspect(white.data, white.size, 3).changed, true);
  assert.equal(detector.inspect(black.data, black.size, 4).changed, true);
  assert.equal(detector.inspect(black.data, { width: 4, height: 4 }, 5).changed, true);
});
test('reset, forced interval, and invalid buffers are safe', () => {
  const detector = new FrameChangeDetector({ forcedIntervalMs: 10 }); const item = frame(0);
  detector.inspect(item.data, item.size, 0); assert.equal(detector.inspect(item.data, item.size, 11).forced, true);
  detector.reset(); assert.equal(detector.inspect(item.data, item.size, 12).changed, true);
  assert.equal(detector.inspect(Buffer.alloc(1), item.size, 13).changed, true);
});
