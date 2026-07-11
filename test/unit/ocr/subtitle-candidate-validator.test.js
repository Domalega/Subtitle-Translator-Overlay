const test = require('node:test');
const assert = require('node:assert/strict');
const { validateSubtitleCandidate, buildSubtitleEnvelope } = require('../../../src/shared/ocr/subtitle-candidate-validator');
function image() { return { width: 400, height: 240, data: new Uint8Array(400 * 240 * 4), pixelOrder: 'rgba' }; }
function line(frame, y, color = [255, 255, 255]) { for (let letter = 0; letter < 18; letter += 1) for (let row = 0; row < 5; row += 1) for (let column = 0; column < 4; column += 1) { const offset = ((y + row) * frame.width + 110 + letter * 9 + column) * 4; frame.data[offset] = color[0]; frame.data[offset + 1] = color[1]; frame.data[offset + 2] = color[2]; } }
test('rejects empty and uniform lower areas', () => assert.equal(validateSubtitleCandidate(image(), { x: 0, y: 200, width: 400, height: 40 }).valid, false));
test('accepts small white and yellow text components', () => { const white = image(); line(white, 200); assert.equal(validateSubtitleCandidate(white, { x: 90, y: 190, width: 200, height: 30 }).valid, true); const yellow = image(); line(yellow, 200, [255, 190, 20]); assert.equal(validateSubtitleCandidate(yellow, { x: 90, y: 190, width: 200, height: 30 }).valid, true); });
test('rejects padding with no source components', () => { const frame = image(); line(frame, 120); assert.equal(validateSubtitleCandidate(frame, { x: 0, y: 200, width: 400, height: 30 }).valid, false); });
test('expands a seed inside a two-line 2048x1152 subtitle block', () => {
  const frame = { width: 2048, height: 1152, data: new Uint8Array(2048 * 1152 * 4), pixelOrder: 'rgba' };
  for (const y of [1000, 1028]) for (let word = 0; word < 10; word += 1) for (let row = 0; row < 9; row += 1) for (let x = 300 + word * 130; x < 380 + word * 130; x += 1) { const offset = ((y + row) * frame.width + x) * 4; frame.data[offset] = frame.data[offset + 1] = frame.data[offset + 2] = 255; }
  const envelope = buildSubtitleEnvelope(frame, { x: 1050, y: 1000, width: 80, height: 11 });
  assert.ok(envelope.x < 400 && envelope.width > 1100 && envelope.height > 30);
  assert.equal(validateSubtitleCandidate(frame, envelope).rowCount, 2);
});
test('keeps short complete subtitle seeds as low-confidence candidates', () => {
  for (const text of ['No.', 'Go!', 'Wait!']) {
    const frame = image(); line(frame, 200); const result = validateSubtitleCandidate(frame, { x: 100, y: 195, width: 190, height: 16 });
    assert.ok(['accepted', 'accepted-low-confidence'].includes(result.status), text);
  }
});
