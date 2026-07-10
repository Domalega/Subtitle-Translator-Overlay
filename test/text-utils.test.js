const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeOcrText,
  isSimilarText,
  isLikelySubtitle,
  isGrowingSubtitle
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
