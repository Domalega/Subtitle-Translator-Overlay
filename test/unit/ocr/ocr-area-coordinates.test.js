const test = require('node:test');
const assert = require('node:assert/strict');
const { captureAreaToDisplayDipArea, displayDipAreaToCaptureArea, validateAreaMapping } = require('../../../src/shared/ocr/ocr-area-coordinates');

for (const [name, display] of Object.entries({ primary: { bounds: { x: 0, y: 0 }, scaleFactor: 1 }, right125: { bounds: { x: 1920, y: 0 }, scaleFactor: 1.25 }, left150: { bounds: { x: -1600, y: 0 }, scaleFactor: 1.5 }, top200: { bounds: { x: 0, y: -1080 }, scaleFactor: 2 } })) {
  test(`coordinates round-trip on ${name} display`, () => {
    const area = { x: 101, y: 203, width: 407, height: 89 }; const size = { width: 2000, height: 1200 }; const dipBounds = { ...display.bounds, width: 1600, height: 900 };
    assert.equal(validateAreaMapping(area, size, dipBounds).valid, true);
    assert.deepEqual(displayDipAreaToCaptureArea(captureAreaToDisplayDipArea(area, size, dipBounds), size, dipBounds), area);
  });
}
