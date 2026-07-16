const test = require('node:test');
const assert = require('node:assert/strict');
const { validateSubtitleCandidate, buildSubtitleEnvelope } = require('../../src/shared/ocr/subtitle-candidate-validator');

function createImage(width = 400, height = 240) {
  return { width, height, data: new Uint8Array(width * height * 4), pixelOrder: 'rgba' };
}
function rect(frame, x, y, width, height, color = [255, 255, 255]) {
  for (let row = y; row < y + height; row += 1) for (let column = x; column < x + width; column += 1) {
    const offset = (row * frame.width + column) * 4;
    frame.data[offset] = color[0]; frame.data[offset + 1] = color[1]; frame.data[offset + 2] = color[2]; frame.data[offset + 3] = 255;
  }
}
function subtitleLine(frame, y, x = 110, letters = 18) {
  for (let letter = 0; letter < letters; letter += 1) rect(frame, x + letter * 9, y, 4, 5);
}

test('ordinary single-line subtitles expand around connected text', () => {
  const frame = createImage(); subtitleLine(frame, 200);
  const envelope = buildSubtitleEnvelope(frame, { x: 178, y: 199, width: 24, height: 8 });
  assert.ok(envelope.x <= 110);
  assert.ok(envelope.x + envelope.width >= 267);
  assert.ok(envelope.width < frame.width * 0.78);
});

test('two nearby subtitle lines are merged', () => {
  const frame = createImage(); subtitleLine(frame, 188); subtitleLine(frame, 207);
  const envelope = buildSubtitleEnvelope(frame, { x: 178, y: 188, width: 24, height: 8 });
  assert.ok(envelope.y <= 182);
  assert.ok(envelope.y + envelope.height >= 218);
  assert.equal(validateSubtitleCandidate(frame, envelope).rowCount, 2);
});

test('distant bright UI on the same baseline is excluded', () => {
  const frame = createImage(); subtitleLine(frame, 200); rect(frame, 330, 200, 50, 5);
  const envelope = buildSubtitleEnvelope(frame, { x: 178, y: 199, width: 24, height: 8 });
  assert.ok(envelope.x + envelope.width < 320);
});

test('wide bright UI below subtitles is excluded', () => {
  const frame = createImage(); subtitleLine(frame, 170); rect(frame, 10, 218, 370, 8);
  const envelope = buildSubtitleEnvelope(frame, { x: 178, y: 170, width: 24, height: 8 });
  assert.ok(envelope.y + envelope.height < 210);
});

test('subtitle envelope respects maximum image coverage limits', () => {
  const frame = createImage(1000, 500); subtitleLine(frame, 230, 120, 80); subtitleLine(frame, 260, 120, 80); subtitleLine(frame, 290, 120, 80); subtitleLine(frame, 320, 120, 80);
  const envelope = buildSubtitleEnvelope(frame, { x: 450, y: 258, width: 60, height: 12 });
  assert.ok(envelope.width <= Math.floor(frame.width * 0.78));
  assert.ok(envelope.height <= Math.floor(frame.height * 0.18));
});

test('candidate validation keeps accepting subtitle-like components', () => {
  const frame = createImage(); subtitleLine(frame, 200);
  const result = validateSubtitleCandidate(frame, { x: 90, y: 190, width: 200, height: 30 });
  assert.equal(result.valid, true);
  assert.ok(result.score > 0);
});
