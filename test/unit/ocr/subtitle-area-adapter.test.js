const test = require('node:test');
const assert = require('node:assert/strict');
const { adaptSubtitleArea } = require('../../../src/shared/ocr/subtitle-area-adapter');

function frame(width = 240, height = 120, originY = 40) { return { width, height, originY, data: new Uint8Array(width * height * 4), pixelOrder: 'rgba' }; }
function line(image, y, left = 50, right = 190) {
  for (let row = y; row < y + 5; row += 1) for (let x = left; x < right; x += 1) { const index = (row * image.width + x) * 4; image.data[index] = 255; image.data[index + 1] = 255; image.data[index + 2] = 255; image.data[index + 3] = 255; }
}
function adapt(image, state = {}, now = 0) { return adaptSubtitleArea({ area: { x: 0, y: 70, width: 240, height: 30 }, screen: { width: 240, height: 500 }, image, state, now }); }

test('one line remains unchanged', () => {
  const image = frame(); line(image, 35);
  const result = adapt(image);
  assert.equal(result.changed, false); assert.equal(result.reason, 'stable-area');
});

test('second line above expands after confirmation', () => {
  const image = frame(); line(image, 12); line(image, 35);
  const first = adapt(image); const second = adapt(image, first.state, 200);
  assert.equal(second.changed, true); assert.equal(second.expandedTop, true); assert.equal(second.reason, 'second-line-above');
});

test('second line below can be accepted immediately when strong', () => {
  const image = frame(); line(image, 35); line(image, 75, 30, 210);
  const result = adapt(image);
  assert.equal(result.changed, true); assert.equal(result.expandedBottom, true);
});

test('three lines remain bounded by maximum height', () => {
  const image = frame(240, 180, 20); line(image, 5); line(image, 55); line(image, 105);
  const first = adaptSubtitleArea({ area: { x: 0, y: 70, width: 240, height: 30 }, screen: { width: 240, height: 180 }, image, now: 0 });
  const result = adaptSubtitleArea({ area: first.area, screen: { width: 240, height: 180 }, image, state: first.state, now: 200 });
  assert.ok(result.area.height <= 36); assert.ok(result.lineCountEstimate <= 3);
});

test('noise and icon do not expand the area', () => {
  const image = frame(); line(image, 35); line(image, 10, 100, 108);
  const result = adapt(image);
  assert.equal(result.changed, false);
});

test('small changes are ignored and expanded area shrinks only after stable absence', () => {
  const image = frame(); line(image, 35); line(image, 75, 30, 210);
  const expanded = adapt(image);
  const empty = frame(); line(empty, 35);
  const held = adaptSubtitleArea({ area: expanded.area, screen: { width: 240, height: 500 }, image: empty, state: expanded.state, now: 1000 });
  const stillHeld = adaptSubtitleArea({ area: held.area, screen: { width: 240, height: 500 }, image: empty, state: held.state, now: 3200 });
  const shrunk = adaptSubtitleArea({ area: stillHeld.area, screen: { width: 240, height: 500 }, image: empty, state: stillHeld.state, now: 3400 });
  assert.equal(held.changed, false); assert.equal(shrunk.changed, true); assert.equal(shrunk.reason, 'stable-extra-line-absent');
});

test('adapter is pure and never requests OCR or a screenshot', () => {
  const image = frame(); const before = Buffer.from(image.data);
  adapt(image);
  assert.deepEqual(Buffer.from(image.data), before);
});

test('invalid or missing inputs return safe unchanged results', () => {
  const missing = adaptSubtitleArea();
  assert.equal(missing.area, null);
  assert.equal(missing.changed, false);
  assert.equal(missing.reason, 'invalid-input');

  const areaOnly = adaptSubtitleArea({ area: { x: 1, y: 2, width: 3, height: 4 } });
  assert.deepEqual(areaOnly.area, { x: 1, y: 2, width: 3, height: 4 });
  assert.equal(areaOnly.changed, false);
  assert.equal(areaOnly.reason, 'invalid-input');

  const corruptImage = { width: 240, height: 120, originY: 40, data: new Uint8Array(7), pixelOrder: 'rgba' };
  const result = adapt(corruptImage);
  assert.deepEqual(result.area, { x: 0, y: 70, width: 240, height: 30 });
  assert.equal(result.changed, false);
  assert.equal(result.reason, 'stable-area');
});

test('yellow BGRA subtitle lines are detected for native screenshots', () => {
  const image = frame();
  image.pixelOrder = 'bgra';
  for (let row = 75; row < 80; row += 1) {
    for (let x = 30; x < 210; x += 1) {
      const index = (row * image.width + x) * 4;
      image.data[index] = 80;
      image.data[index + 1] = 210;
      image.data[index + 2] = 240;
      image.data[index + 3] = 255;
    }
  }
  line(image, 35);
  const result = adapt(image);
  assert.equal(result.changed, true);
  assert.equal(result.expandedBottom, true);
});

test('expansion is clamped to the screen bottom', () => {
  const image = frame(240, 140, 90);
  line(image, 35);
  line(image, 92, 30, 210);
  const result = adaptSubtitleArea({
    area: { x: 0, y: 120, width: 240, height: 25 },
    screen: { width: 240, height: 150 },
    image,
    now: 0,
  });
  assert.equal(result.changed, true);
  assert.equal(result.area.y + result.area.height, 150);
  assert.equal(result.area.height <= 30, true);
});

test('different pending candidates must reconfirm before expansion', () => {
  const firstImage = frame(); line(firstImage, 12, 60, 180); line(firstImage, 35);
  const first = adapt(firstImage);
  assert.equal(first.reason, 'awaiting-confirmation');

  const secondImage = frame(); line(secondImage, 8, 60, 180); line(secondImage, 35);
  const second = adapt(secondImage, first.state, 200);
  assert.equal(second.changed, false);
  assert.equal(second.reason, 'awaiting-confirmation');

  const third = adapt(secondImage, second.state, 400);
  assert.equal(third.changed, true);
  assert.equal(third.reason, 'second-line-above');
});

test('a new smaller one-line subtitle keeps the automatic area after an absence reset', () => {
  const expandedImage = frame(); line(expandedImage, 12); line(expandedImage, 75, 30, 210);
  const expanded = adapt(expandedImage);
  const next = frame(); line(next, 38, 80, 160);
  const result = adaptSubtitleArea({ area: expanded.area, screen: { width: 240, height: 500 }, image: next, state: {}, now: 100 });
  assert.ok(result.area.width > 0 && result.area.height > 0);
  assert.equal(result.changed, false);
});
