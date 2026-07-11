const test = require('node:test');
const assert = require('node:assert/strict');
const { SubtitleAreaTracker, areaIoU, isSimilarArea, stabilizeArea, clampAreaToScreen } = require('../../../src/shared/ocr/subtitle-area-tracker');

function trackerFixture() {
  let now = 0;
  return { tracker: new SubtitleAreaTracker({ now: () => now, possibleLostMs: 2500, lostMs: 6000 }), advance: (ms) => { now += ms; } };
}

test('found area becomes locked and one empty OCR result keeps it locked', () => {
  const { tracker } = trackerFixture();
  assert.equal(tracker.acquire().action, 'startGlobalSearch');
  assert.equal(tracker.dispatch('candidateFound').state, 'locked');
  assert.equal(tracker.dispatch('emptyFrame').state, 'locked');
});

test('short subtitle pause does not start global search and long absence becomes possible-lost then lost', () => {
  const { tracker, advance } = trackerFixture();
  tracker.dispatch('candidateFound');
  tracker.dispatch('emptyFrame');
  advance(2400); assert.equal(tracker.dispatch('emptyFrame').action, 'keepArea');
  advance(200); assert.equal(tracker.dispatch('emptyFrame').state, 'possible-lost');
  advance(3500); assert.equal(tracker.dispatch('emptyFrame').action, 'markLost');
  assert.equal(tracker.dispatch('timeout').action, 'startGlobalSearch');
});

test('manual stop and screen change do not call OCR controls', () => {
  const { tracker } = trackerFixture();
  tracker.dispatch('candidateFound');
  assert.equal(tracker.dispatch('screenChanged').action, 'startGlobalSearch');
  assert.equal(tracker.dispatch('manualStop').action, 'stopTracking');
});

test('area IoU and similarity distinguish nearby and distant areas', () => {
  const area = { x: 10, y: 10, width: 100, height: 40 };
  assert.equal(areaIoU(area, area), 1);
  assert.equal(isSimilarArea(area, { x: 15, y: 10, width: 100, height: 40 }), true);
  assert.equal(isSimilarArea(area, { x: 300, y: 10, width: 100, height: 40 }), false);
});

test('stabilization ignores small coordinate changes and clamps padded areas', () => {
  const previous = { x: 20, y: 30, width: 116, height: 56 };
  assert.equal(stabilizeArea(previous, { x: 28, y: 38, width: 100, height: 40 }, { width: 400, height: 200 }), previous);
  assert.deepEqual(clampAreaToScreen({ x: -4, y: 190, width: 20, height: 30 }, { width: 100, height: 200 }), { x: 0, y: 190, width: 20, height: 10 });
});
