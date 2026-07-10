const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateCropBounds } = require('../../../src/shared/ocr/crop-bounds');
const crop = (imageSize, displaySize, ocrArea) => calculateCropBounds({ imageSize, displaySize, ocrArea });
test('calculates 100%, 125%, and 150% display scaling', () => {
  assert.deepEqual(crop({ width: 1000, height: 500 }, { width: 1000, height: 500 }, { x: 100, y: 50, width: 200, height: 100 }), { x: 100, y: 50, width: 200, height: 100 });
  assert.deepEqual(crop({ width: 1250, height: 625 }, { width: 1000, height: 500 }, { x: 100, y: 50, width: 200, height: 100 }), { x: 125, y: 63, width: 250, height: 125 });
  assert.deepEqual(crop({ width: 1500, height: 750 }, { width: 1000, height: 500 }, { x: 100, y: 50, width: 200, height: 100 }), { x: 150, y: 75, width: 300, height: 150 });
});
test('uses actual thumbnail dimensions and clamps edges', () => {
  assert.deepEqual(crop({ width: 800, height: 400 }, { width: 1000, height: 500 }, { x: 900, y: 400, width: 200, height: 200 }), { x: 720, y: 320, width: 80, height: 80 });
  assert.deepEqual(crop({ width: 100, height: 100 }, { width: 100, height: 100 }, { x: 99, y: 99, width: 10, height: 10 }), { x: 99, y: 99, width: 1, height: 1 });
});
test('clamps partial, invalid, fractional, and minimum bounds', () => {
  assert.deepEqual(crop({ width: 100, height: 100 }, { width: 100, height: 100 }, { x: -10, y: -10, width: 20, height: 20 }), { x: 0, y: 0, width: 10, height: 10 });
  assert.deepEqual(crop({ width: 100, height: 100 }, { width: 100, height: 100 }, { x: 10.4, y: 20.6, width: 5.2, height: 5.2 }), { x: 10, y: 21, width: 6, height: 5 });
  assert.deepEqual(crop({ width: 10, height: 10 }, { width: 0, height: -1 }, { x: -1, y: -1, width: -2, height: -3 }), { x: 0, y: 0, width: 1, height: 1 });
});
