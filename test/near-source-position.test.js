const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateNearSourceBounds } = require('../src/near-source-position');

const workArea = { x: 0, y: 0, width: 1000, height: 800 };
const base = { anchorBounds: { x: 400, y: 600, width: 200, height: 40 }, overlaySize: { width: 300, height: 100 }, workArea };
function intersects(a, b) { return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y; }

test('positions below when space exists and above near bottom', () => {
  assert.equal(calculateNearSourceBounds(base).y, 650);
  const result = calculateNearSourceBounds({ ...base, anchorBounds: { ...base.anchorBounds, y: 760 } });
  assert.ok(result.y < 760); assert.equal(intersects(result, { ...base.anchorBounds, y: 760 }), false);
});
test('honors above and clamps left, right, and wide overlays', () => {
  assert.equal(calculateNearSourceBounds({ ...base, placement: 'above' }).y, 490);
  assert.equal(calculateNearSourceBounds({ ...base, anchorBounds: { x: -20, y: 300, width: 20, height: 20 } }).x, 0);
  assert.equal(calculateNearSourceBounds({ ...base, anchorBounds: { x: 980, y: 300, width: 20, height: 20 } }).x, 700);
  assert.equal(calculateNearSourceBounds({ ...base, overlaySize: { width: 2000, height: 100 } }).width, 1000);
});
test('handles top edge, high overlay, negative work area, offset, and rounding', () => {
  const top = calculateNearSourceBounds({ ...base, anchorBounds: { x: 400, y: 2, width: 200, height: 30 }, placement: 'above' });
  assert.ok(top.y >= 0);
  const high = calculateNearSourceBounds({ ...base, overlaySize: { width: 100, height: 1000 } });
  assert.equal(high.height, 800);
  const negative = calculateNearSourceBounds({ ...base, workArea: { x: -1000, y: -50, width: 600, height: 500 }, anchorBounds: { x: -800, y: 100, width: 100, height: 20 }, overlaySize: { width: 101.4, height: 50.4 }, verticalOffset: 20.4 });
  assert.deepEqual(negative, { x: -800, y: 140, width: 101, height: 50 });
});
