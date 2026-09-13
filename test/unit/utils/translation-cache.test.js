'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { TranslationCache } = require('../../../src/shared/translation-cache');
function storage() {
  const data = new Map();
  return { data, get length() { return data.size; }, key: i => [...data.keys()][i], getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v), removeItem: k => data.delete(k) };
}
const key = n => 'subtitle-translation:ru:' + n;
test('limits legacy and new entries across launches and languages, preserves settings', () => {
  const s = storage(); s.setItem('theme', 'dark'); s.setItem(key(1), 'one'); s.setItem('ocr-norm-en:hello', 'hello'); s.setItem(key(2), 'two');
  const c = new TranslationCache(s, { maxEntries: 2 });
  assert.equal(c.getItem(key(1)), null); assert.equal(s.getItem(key(1)), null); assert.equal(s.getItem('theme'), 'dark');
  c.setItem(key(3), 'three'); assert.equal(s.getItem('ocr-norm-en:hello'), null);
  const next = new TranslationCache(s, { maxEntries: 2 }); assert.equal(next.getItem(key(3)), 'three');
  next.setItem(key(2), 'updated'); next.setItem(key(4), 'four'); assert.equal(next.getItem(key(3)), null); assert.equal(next.getItem(key(2)), 'updated');
});
test('bounds payload and rejects oversized translations without touching unrelated data', () => {
  const s = storage(), c = new TranslationCache(s, { maxBytes: 100 });
  c.setItem(key(1), 'one'); c.setItem(key(2), 'two'); assert.equal(c.entries.size, 1);
  c.setItem(key(3), 'x'.repeat(100)); assert.equal(c.entries.size, 0); assert.equal(s.length, 0);
  c.setItem('theme', 'light'); c.setItem(key(4), ''); c.setItem(key(5), null); assert.equal(s.length, 0);
});
test('storage failures leave a usable bounded memory cache', () => {
  const s = { get length() { throw Error('blocked'); }, setItem() { throw Error('quota'); }, removeItem() { throw Error('blocked'); } };
  const c = new TranslationCache(s, { maxEntries: 1 }); c.setItem(key(1), 'one'); c.setItem(key(2), 'two');
  assert.equal(c.getItem(key(1)), null); assert.equal(c.getItem(key(2)), 'two');
});
