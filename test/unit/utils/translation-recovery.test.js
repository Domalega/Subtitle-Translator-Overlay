'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { TranslationService } = require('../../../src/main/services/translation-service');
const { requestJson } = require('../../../src/main/services/request-json');
const ok = text => ({ ok: true, json: async () => [[[text]]] });

test('cached replacement cancels an older request in the same scope', async () => {
  const service = new TranslationService({ fetch: async url => url.includes('cached') ? ok('cached result') : new Promise(() => {}), timeoutMs: 100 });
  await service.translate('cached');
  const old = service.translate('old', 'en', 'ru', { scope: 'screen' });
  const rejected = assert.rejects(old, { code: 'ABORTED' });
  assert.equal(await service.translate('cached', 'en', 'ru', { scope: 'screen' }), 'cached result');
  await rejected;
  assert.equal(service.controllers.size, 0);
});
test('timeout includes stalled response bodies and fetches that ignore abort', async () => {
  for (const fetch of [() => new Promise(() => {}), async () => ({ ok: true, json: () => new Promise(() => {}) })]) {
    const service = new TranslationService({ fetch, timeoutMs: 5 });
    await assert.rejects(service.translate('hello'), { code: 'TIMEOUT' });
  }
});
test('pre-aborted request never performs network I/O', async () => {
  let calls = 0;
  const controller = new AbortController(); controller.abort();
  const service = new TranslationService({ fetch: async () => { calls++; return ok('test'); } });
  await assert.rejects(service.translate('hello', 'en', 'ru', { controller }), { code: 'ABORTED' });
  assert.equal(calls, 0);
});
test('malformed and empty translation responses are rejected and never cached', async () => {
  for (const data of [null, {}, [[]], [[null]], [[['']]], [[[{ text: 'bad' }]]]]) {
    const service = new TranslationService({ fetch: async () => ({ ok: true, json: async () => data }) });
    await assert.rejects(service.translate('hello'), { code: 'INVALID_RESPONSE' });
    assert.equal(service.cache.size, 0);
  }
});
test('language pairs and scopes remain independent', async () => {
  const service = new TranslationService({ fetch: async url => ok(new URL(url).searchParams.get('tl')) });
  assert.deepEqual(await Promise.all([service.translate('word', 'en', 'ru', { scope: 'screen' }), service.translate('word', 'en', 'de', { scope: 'manual' })]), ['ru', 'de']);
  assert.equal(service.latestRequestByScope.size, 0);
});
test('requestJson handles HTTP errors, invalid bodies and timeout', async () => {
  assert.deepEqual(await requestJson('test', { fetch: async () => ({ ok: true, json: async () => ({ value: 1 }) }) }), { value: 1 });
  assert.equal(await requestJson('test', { fetch: async () => ({ ok: false }) }), null);
  await assert.rejects(requestJson('test', { fetch: async () => ({ ok: true, json: async () => { throw Error('JSON'); } }) }), /JSON/);
  await assert.rejects(requestJson('test', { fetch: () => new Promise(() => {}), timeoutMs: 5 }), /timed out/);
});
