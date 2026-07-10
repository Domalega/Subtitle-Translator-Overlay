const test = require('node:test');
const assert = require('node:assert/strict');
const { TranslationService, TranslationError } = require('../../../src/main/services/translation-service');

function okFetch(value) {
  return async () => ({ ok: true, json: async () => [[[value]]] });
}

test('TranslationService translates with mock fetch', async () => {
  const service = new TranslationService({ fetch: okFetch('Привет') });
  const result = await service.translate('Hello', 'en', 'ru');
  assert.equal(result, 'Привет');
});

test('TranslationService reports HTTP errors', async () => {
  const service = new TranslationService({ fetch: async () => ({ ok: false, status: 500 }) });
  await assert.rejects(() => service.translate('Hello'), (error) => error.code === 'HTTP_ERROR');
});

test('TranslationService reports invalid JSON', async () => {
  const service = new TranslationService({ fetch: async () => ({ ok: true, json: async () => { throw new Error('bad'); } }) });
  await assert.rejects(() => service.translate('Hello'), (error) => error.code === 'INVALID_JSON');
});

test('TranslationService times out', async () => {
  const service = new TranslationService({
    timeoutMs: 5,
    fetch: (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    })
  });
  await assert.rejects(() => service.translate('Hello'), (error) => error.code === 'ABORTED');
});

test('TranslationService supports AbortController', async () => {
  const controller = new AbortController();
  const service = new TranslationService({
    fetch: (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      controller.abort();
    })
  });
  await assert.rejects(() => service.translate('Hello', 'en', 'ru', { controller }), (error) => error.code === 'ABORTED');
});

test('TranslationService marks stale scoped translation', async () => {
  let resolveFirst;
  const service = new TranslationService({
    fetch: (url) => {
      if (url.includes('First')) return new Promise((resolve) => { resolveFirst = resolve; });
      return Promise.resolve({ ok: true, json: async () => [[['Второй']]] });
    }
  });
  const first = service.translate('First', 'en', 'ru', { scope: 'screen' });
  const second = service.translate('Second', 'en', 'ru', { scope: 'screen' });
  assert.equal(await second, 'Второй');
  resolveFirst({ ok: true, json: async () => [[['Первый']]] });
  await assert.rejects(() => first, (error) => error.code === 'ABORTED' || error.code === 'STALE');
});

test('TranslationService limits cache size', async () => {
  let count = 0;
  const service = new TranslationService({ cacheMax: 2, fetch: async () => ({ ok: true, json: async () => [[[String(++count)]]] }) });
  await service.translate('one');
  await service.translate('two');
  await service.translate('three');
  assert.equal(service.cache.size, 2);
  assert.equal(service.cache.has('en:ru:one'), false);
});

test('TranslationService preserves last successful translation after error', async () => {
  let fail = false;
  const service = new TranslationService({
    fetch: async () => {
      if (fail) return { ok: false, status: 503 };
      return { ok: true, json: async () => [[['Успех']]] };
    }
  });
  await service.translate('ok');
  fail = true;
  await assert.rejects(() => service.translate('fail'), TranslationError);
  assert.equal(service.lastSuccessfulTranslation, 'Успех');
});
