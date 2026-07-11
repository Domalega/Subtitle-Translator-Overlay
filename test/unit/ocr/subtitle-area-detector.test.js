const test = require('node:test');
const assert = require('node:assert/strict');
const { detectSubtitleArea } = require('../../../src/shared/ocr/subtitle-area-detector');

function image(width = 640, height = 480) {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

function pixel(frame, x, y, color) {
  if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) return;
  const offset = (y * frame.width + x) * 4;
  frame.data[offset] = color[0]; frame.data[offset + 1] = color[1]; frame.data[offset + 2] = color[2]; frame.data[offset + 3] = 255;
}

function subtitleLine(frame, x, y, count = 24, color = [255, 255, 255], scale = 1) {
  for (let character = 0; character < count; character += 1) {
    const left = x + character * 8 * scale;
    for (let row = 0; row < 7 * scale; row += 1) {
      for (let column = 0; column < 5 * scale; column += 1) {
        if (column === 0 || column === 4 * scale || row === 0 || row === 3 * scale || row === 6 * scale) pixel(frame, left + column, y + row, color);
      }
    }
  }
}

function solid(frame, x, y, width, height, color = [255, 255, 255]) {
  for (let row = y; row < y + height; row += 1) for (let column = x; column < x + width; column += 1) pixel(frame, column, row, color);
}

test('finds one white subtitle line near lower center', () => {
  const frame = image(); subtitleLine(frame, 225, 370);
  const result = detectSubtitleArea(frame);
  assert.equal(result.found, true); assert.ok(result.bestCandidate.y > 330); assert.ok(result.bestCandidate.score >= 42);
});

test('merges two close white subtitle lines', () => {
  const frame = image(); subtitleLine(frame, 230, 350); subtitleLine(frame, 230, 366);
  const result = detectSubtitleArea(frame);
  assert.equal(result.found, true); assert.ok(result.bestCandidate.height >= 25); assert.ok(result.bestCandidate.reasons.includes('multiple-lines'));
});

test('finds a yellow subtitle line', () => {
  const frame = image(); subtitleLine(frame, 220, 365, 25, [255, 190, 20]);
  assert.equal(detectSubtitleArea(frame).found, true);
});

test('rewards text with a dark outline', () => {
  const outlined = image(); subtitleLine(outlined, 220, 365);
  const plain = image(); subtitleLine(plain, 220, 365); solid(plain, 0, 0, 1, 1, [120, 120, 120]);
  assert.ok(detectSubtitleArea(outlined).bestCandidate.reasons.includes('dark-outline'));
});

test('finds a subtitle line in the middle portion of the screen', () => {
  const frame = image(); subtitleLine(frame, 220, 230);
  const result = detectSubtitleArea(frame);
  assert.equal(result.found, true); assert.ok(result.bestCandidate.y > 190 && result.bestCandidate.y < 270);
});

test('rejects HUD text in a corner', () => {
  const frame = image(); subtitleLine(frame, 5, 380, 8);
  assert.equal(detectSubtitleArea(frame).found, false);
});

test('rejects an isolated icon', () => {
  const frame = image(); solid(frame, 310, 370, 12, 12);
  assert.equal(detectSubtitleArea(frame).found, false);
});

test('rejects a large bright area', () => {
  const frame = image(); solid(frame, 80, 350, 500, 80);
  assert.equal(detectSubtitleArea(frame).found, false);
});

test('rejects a vertical bright block', () => {
  const frame = image(); solid(frame, 300, 300, 30, 130);
  assert.equal(detectSubtitleArea(frame).found, false);
});

test('returns no candidate for an empty screen', () => {
  const result = detectSubtitleArea(image());
  assert.deepEqual(result.bestCandidate, null); assert.equal(result.candidates.length, 0);
});

test('does not mistake sparse noisy pixels for subtitles', () => {
  const frame = image();
  for (let index = 0; index < 300; index += 1) pixel(frame, (index * 37) % frame.width, 160 + (index * 61) % 300, [255, 255, 255]);
  assert.equal(detectSubtitleArea(frame).found, false);
});

test('selects the centered lower candidate over another candidate', () => {
  const frame = image(); subtitleLine(frame, 50, 260, 16); subtitleLine(frame, 220, 370, 24);
  const result = detectSubtitleArea(frame);
  assert.equal(result.found, true); assert.ok(result.bestCandidate.x > 150);
});

test('central lower subtitles beat a side card', () => {
  const frame = image(); subtitleLine(frame, 500, 280, 16); subtitleLine(frame, 220, 370, 24);
  const result = detectSubtitleArea(frame);
  assert.equal(result.found, true); assert.ok(result.bestCandidate.x < 400); assert.ok(result.bestCandidate.y > 330);
});

test('rejects right-column text when central subtitles are present', () => {
  const frame = image(); subtitleLine(frame, 510, 300, 15); subtitleLine(frame, 220, 370, 24);
  const result = detectSubtitleArea(frame);
  assert.ok(result.candidates.every((candidate) => candidate.x < 450));
  assert.ok(result.bestCandidate.x < 400);
});

test('strongly penalizes an edge candidate and prefers a lower candidate over a similar middle one', () => {
  const frame = image(); subtitleLine(frame, 22, 370, 16); subtitleLine(frame, 220, 250, 24); subtitleLine(frame, 220, 370, 24);
  const result = detectSubtitleArea(frame);
  assert.ok(result.candidates.every((candidate) => candidate.x > 50));
  assert.ok(result.bestCandidate.y > 330);
});

test('scales detected coordinates back to the source image', () => {
  const frame = image(1280, 960); subtitleLine(frame, 440, 740, 24, [255, 255, 255], 2);
  const result = detectSubtitleArea(frame);
  assert.equal(result.metrics.analyzedWidth, 640); assert.ok(result.bestCandidate.x > 350); assert.ok(result.bestCandidate.y > 680);
});

test('clamps padded candidate coordinates to image bounds', () => {
  const frame = image(); subtitleLine(frame, 18, 450, 8);
  const result = detectSubtitleArea(frame);
  if (result.bestCandidate) {
    assert.ok(result.bestCandidate.x >= 0 && result.bestCandidate.y >= 0);
    assert.ok(result.bestCandidate.x + result.bestCandidate.width <= frame.width);
    assert.ok(result.bestCandidate.y + result.bestCandidate.height <= frame.height);
  }
});

test('does not mutate the input image', () => {
  const frame = image(); subtitleLine(frame, 220, 370);
  const before = Buffer.from(frame.data);
  detectSubtitleArea(frame);
  assert.deepEqual(Buffer.from(frame.data), before);
});

test('reports bounded analysis dimensions and timing', () => {
  const frame = image(1920, 1080); subtitleLine(frame, 700, 820, 24, [255, 255, 255], 2);
  const result = detectSubtitleArea(frame);
  assert.ok(result.metrics.analyzedWidth <= 640); assert.ok(result.metrics.durationMs >= 0);
});
