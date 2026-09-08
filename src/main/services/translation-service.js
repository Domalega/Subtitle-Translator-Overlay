'use strict';
class TranslationError extends Error {
  constructor(message, code, cause) { super(message, { cause }); this.name = 'TranslationError'; this.code = code; }
}
class TranslationService {
  constructor(options = {}) {
    this.fetch = options.fetch || fetch;
    this.timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 8000;
    this.cacheMax = Number.isInteger(options.cacheMax) && options.cacheMax >= 0 ? options.cacheMax : 500;
    this.cache = new Map();
    this.controllers = new Map();
    this.requestCounter = 0;
    this.latestRequestByScope = new Map();
    this.lastSuccessfulTranslation = '';
  }
  cacheKey(text, sourceLanguage, targetLanguage) { return `${sourceLanguage}:${targetLanguage}:${text}`; }
  setCache(key, value) {
    this.cache.delete(key); this.cache.set(key, value);
    while (this.cache.size > this.cacheMax) this.cache.delete(this.cache.keys().next().value);
  }
  abortScope(scope) {
    this.controllers.get(scope)?.abort();
    this.controllers.delete(scope);
    this.latestRequestByScope.delete(scope);
  }
  async translate(text, sourceLanguage = 'en', targetLanguage = 'ru', options = {}) {
    const sourceText = String(text || '');
    const scope = options.scope || null;
    const requestId = ++this.requestCounter;
    if (scope) this.abortScope(scope);
    if (options.controller?.signal.aborted) throw new TranslationError('Translation request was cancelled', 'ABORTED');
    if (!sourceText.trim()) return '';
    const key = this.cacheKey(sourceText, sourceLanguage, targetLanguage);
    if (this.cache.has(key)) {
      this.lastSuccessfulTranslation = this.cache.get(key);
      return this.lastSuccessfulTranslation;
    }
    const controller = new AbortController();
    if (scope) { this.controllers.set(scope, controller); this.latestRequestByScope.set(scope, requestId); }
    let timedOut = false;
    const onExternalAbort = () => controller.abort();
    const signal = options.controller?.signal;
    signal?.addEventListener('abort', onExternalAbort, { once: true });
    let onAbort;
    const aborted = new Promise((_, reject) => {
      onAbort = () => reject(new TranslationError(timedOut ? 'Translation request timed out' : 'Translation request was cancelled', timedOut ? 'TIMEOUT' : 'ABORTED'));
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, this.timeoutMs);
    try {
      const work = async () => {
        const query = new URLSearchParams({ client: 'gtx', sl: sourceLanguage, tl: targetLanguage, dt: 't', q: sourceText });
        const response = await this.fetch(`https://translate.googleapis.com/translate_a/single?${query}`, { signal: controller.signal });
        if (!response.ok) throw new TranslationError(`Translate request failed: ${response.status}`, 'HTTP_ERROR');
        let data;
        try { data = await response.json(); }
        catch (error) { throw new TranslationError('Translate response JSON is invalid', 'INVALID_JSON', error); }
        if (!Array.isArray(data?.[0]) || !data[0].length || data[0].some(part => !Array.isArray(part) || typeof part[0] !== 'string')) {
          throw new TranslationError('Translate response contains no translation', 'INVALID_RESPONSE');
        }
        const translated = data[0].map(part => part[0]).join('');
        if (!translated.trim()) throw new TranslationError('Translate response is empty', 'INVALID_RESPONSE');
        return translated;
      };
      const translated = await Promise.race([work(), aborted]);
      if (controller.signal.aborted) throw new TranslationError('Translation request was cancelled', 'ABORTED');
      if (scope && this.latestRequestByScope.get(scope) !== requestId) throw new TranslationError('Translation request is stale', 'STALE');
      this.setCache(key, translated);
      this.lastSuccessfulTranslation = translated;
      return translated;
    } catch (error) {
      if (error instanceof TranslationError) throw error;
      throw new TranslationError(error?.message || 'Translation failed', controller.signal.aborted ? 'ABORTED' : 'NETWORK_ERROR', error);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onExternalAbort);
      controller.signal.removeEventListener('abort', onAbort);
      if (scope && this.controllers.get(scope) === controller) { this.controllers.delete(scope); this.latestRequestByScope.delete(scope); }
    }
  }
}
module.exports = { TranslationService, TranslationError };
