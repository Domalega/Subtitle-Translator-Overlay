const test = require('node:test');
const assert = require('node:assert/strict');
const { SubtitleStabilizer } = require('../src/subtitle-stabilizer');

test('SubtitleStabilizer handles empty OCR', () => {
  const stabilizer = new SubtitleStabilizer();
  const result = stabilizer.process('');
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'empty');
});

test('SubtitleStabilizer accepts short game subtitles', () => {
  const stabilizer = new SubtitleStabilizer();
  for (const text of ['Yes.', 'No.', 'Run!', 'Wait.', 'Help!', 'Go!', 'Stop!']) {
    const result = stabilizer.process(text);
    assert.equal(result.candidate, true, text);
    stabilizer.reset();
  }
});

test('SubtitleStabilizer confirms candidate', () => {
  const stabilizer = new SubtitleStabilizer();
  const result = stabilizer.process('Hello, this is a subtitle');
  assert.equal(result.candidate, true);
  const accepted = stabilizer.acceptCandidate();
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.normalizedText, 'hello, this is a subtitle');
});

test('SubtitleStabilizer ignores identical repeated replica', () => {
  const stabilizer = new SubtitleStabilizer();
  stabilizer.process('Hello, this is a subtitle');
  stabilizer.acceptCandidate();
  const result = stabilizer.process('Hello, this is a subtitle');
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'same');
});

test('SubtitleStabilizer ignores similar changed replica', () => {
  const stabilizer = new SubtitleStabilizer();
  stabilizer.process('This is a longer subtitle line with several repeated useful words');
  stabilizer.acceptCandidate();
  const result = stabilizer.process('This is a longer subtitle line with several useful words');
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'similar');
});

test('SubtitleStabilizer detects growing replica', () => {
  const stabilizer = new SubtitleStabilizer();
  stabilizer.process('Hello brave');
  const result = stabilizer.process('Hello brave new world');
  assert.equal(result.candidate, true);
  assert.equal(result.reason, 'growing');
});

test('SubtitleStabilizer filters single OCR noise', () => {
  const stabilizer = new SubtitleStabilizer();
  const result = stabilizer.process('&&&===');
  assert.equal(result.reason, 'noise');
  assert.equal(result.shouldClearAfterHold, false);
});

test('SubtitleStabilizer marks repeated OCR noise for hold clear', () => {
  const stabilizer = new SubtitleStabilizer({ emptyFrameThreshold: 3 });
  stabilizer.process('&&&===');
  stabilizer.process('&&&===');
  const result = stabilizer.process('&&&===');
  assert.equal(result.shouldClearAfterHold, true);
});

test('SubtitleStabilizer reset clears accepted text and candidate', () => {
  const stabilizer = new SubtitleStabilizer();
  stabilizer.process('Hello, this is a subtitle');
  stabilizer.acceptCandidate();
  stabilizer.reset();
  const result = stabilizer.process('Hello, this is a subtitle');
  assert.equal(result.candidate, true);
  assert.equal(result.reason, 'candidate');
});
