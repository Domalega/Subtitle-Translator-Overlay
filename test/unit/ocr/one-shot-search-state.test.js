const test = require('node:test');
const assert = require('node:assert/strict');
const { OneShotSearchState } = require('../../../src/shared/ocr/one-shot-search-state');

test('one-shot search can run again after success and not-found', async () => {
  const state = new OneShotSearchState();
  await state.run(async () => ({ found: true }));
  assert.equal(state.state, 'found');
  await state.run(async () => ({ found: false }));
  assert.equal(state.state, 'not-found');
});

test('one-shot search leaves searching after an exception and can retry', async () => {
  const state = new OneShotSearchState();
  await assert.rejects(state.run(async () => { throw new Error('capture failed'); }));
  assert.equal(state.state, 'failed');
  await state.run(async () => ({ found: true }));
  assert.equal(state.state, 'found');
});

test('one-shot search ignores parallel execution without invoking another action', async () => {
  const state = new OneShotSearchState();
  let release;
  let calls = 0;
  const running = state.run(() => { calls += 1; return new Promise((resolve) => { release = resolve; }); });
  assert.deepEqual(await state.run(() => { calls += 1; return Promise.resolve({ found: true }); }), { ignored: true });
  release({ found: true });
  await running;
  assert.equal(calls, 1);
});
