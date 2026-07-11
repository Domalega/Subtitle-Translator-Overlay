const test = require('node:test');
const assert = require('node:assert/strict');
const { getActiveOcrArea, physicalAreaToDip } = require('../../../src/shared/ocr/active-ocr-area');

test('active crop and visualized area select the same automatic object', () => {
  const automaticArea = { x: 200, y: 300, width: 400, height: 80 };
  const active = getActiveOcrArea({ manualArea: { x: 1, y: 1, width: 2, height: 2 }, automaticArea, automaticAnchorBoundsDip: { x: 100, y: 150, width: 200, height: 40 } });
  assert.equal(active.area, automaticArea);
  assert.equal(active.source, 'automatic');
});

test('physical to DIP conversion round-trips within one pixel', () => {
  const display = { bounds: { x: -1920, y: 0 }, scaleFactor: 1.25 };
  const area = { x: 101, y: 203, width: 407, height: 89 };
  const dip = physicalAreaToDip(area, display);
  const roundTrip = { x: Math.round((dip.x - display.bounds.x) * display.scaleFactor), y: Math.round((dip.y - display.bounds.y) * display.scaleFactor), width: Math.round(dip.width * display.scaleFactor), height: Math.round(dip.height * display.scaleFactor) };
  assert.deepEqual(roundTrip, area);
});

test('manual becomes active after automatic area is removed', () => {
  const manualArea = { x: 10, y: 20, width: 30, height: 40 };
  assert.equal(getActiveOcrArea({ manualArea, automaticArea: null }).area, manualArea);
});
