const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeOcrText,
  isSimilarText,
  isLikelySubtitle,
  isGrowingSubtitle,
  evaluateOcrResult
} = require('../src/text-utils');

test('normalizeOcrText normalizes whitespace, dash prefix, and case', () => {
  assert.equal(normalizeOcrText('  - Hello\r\n   WORLD  '), 'hello world');
});

test('isSimilarText detects slightly changed similar subtitle', () => {
  const a = 'this is a longer subtitle line with several repeated useful words';
  const b = 'this is a longer subtitle line with several useful words';
  assert.equal(isSimilarText(a, b), true);
});

test('isSimilarText rejects unrelated short text', () => {
  assert.equal(isSimilarText('hello', 'world'), false);
});

test('isLikelySubtitle rejects empty OCR', () => {
  assert.equal(isLikelySubtitle(''), false);
});

test('isLikelySubtitle rejects single OCR noise', () => {
  assert.equal(isLikelySubtitle('&&&&===='), false);
});

test('isGrowingSubtitle detects progressively growing replica', () => {
  assert.equal(isGrowingSubtitle('hello brave new world', 'hello brave'), true);
});

test('evaluateOcrResult keeps short valid game subtitles and rejects artifacts', () => {
  for (const text of ['No.', 'Go!', 'Wait!', 'Run!', 'Help!', 'Yes.']) assert.equal(evaluateOcrResult({ text, confidence: 40 }).accepted, true, text);
  assert.equal(evaluateOcrResult({ text: 'x q z @@@ ###', confidence: 80 }).accepted, false);
  assert.equal(evaluateOcrResult({ text: 'A normal looking subtitle', confidence: 10 }).reason, 'low-confidence');
});

test('evaluateOcrResult accepts a normal long YouTube subtitle with line breaks and repeated words', () => {
  const text = 'the takeaway still makes me angry when I shoot like this.\nThe king, the king of flicks.';
  assert.deepEqual(evaluateOcrResult({ text, confidence: 70 }), { accepted: true, reason: 'valid' });
});

test('evaluateOcrResult rejects isolated Latin OCR glyph artifacts', () => {
  assert.equal(evaluateOcrResult({ text: 'A A H', confidence: 90 }).accepted, false);
});
