(function initTranslationService(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TranslationServiceModule = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createTranslationService() {
  class TranslationError extends Error {
    constructor(message, code, cause) {
      super(message);
      this.name = 'TranslationError';
      this.code = code;
      this.cause = cause;
    }
  }

  class TranslationService {
    constructor(options = {}) {
      this.fetch = options.fetch || fetch;
      this.timeoutMs = options.timeoutMs || 8000;
      this.cacheMax = options.cacheMax || 500;
      this.cache = new Map();
      this.controllers = new Map();
      this.requestCounter = 0;
      this.latestRequestByScope = new Map();
      this.lastSuccessfulTranslation = '';
    }

    cacheKey(text, sourceLanguage, targetLanguage) {
      return `${sourceLanguage}:${targetLanguage}:${text}`;
    }

    setCache(key, value) {
      if (this.cache.has(key)) this.cache.delete(key);
      this.cache.set(key, value);
      while (this.cache.size > this.cacheMax) {
        const oldest = this.cache.keys().next().value;
        this.cache.delete(oldest);
      }
    }

    abortScope(scope) {
      const controller = this.controllers.get(scope);
      if (controller) controller.abort();
      this.controllers.delete(scope);
    }

    async translate(text, sourceLanguage = 'en', targetLanguage = 'ru', options = {}) {
      const sourceText = String(text || '');
      if (!sourceText.trim()) return '';

      const key = this.cacheKey(sourceText, sourceLanguage, targetLanguage);
      if (this.cache.has(key)) return this.cache.get(key);

      const scope = options.scope || null;
      const requestId = ++this.requestCounter;
      let controller = options.controller || null;
      let timeoutId = null;

      if (!controller && typeof AbortController !== 'undefined') controller = new AbortController();
      if (scope) {
        this.abortScope(scope);
        if (controller) this.controllers.set(scope, controller);
        this.latestRequestByScope.set(scope, requestId);
      }

      if (controller) {
        timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
      }

      try {
        const query = new URLSearchParams({
          client: 'gtx',
          sl: sourceLanguage,
          tl: targetLanguage,
          dt: 't',
          q: sourceText
        });

        const response = await this.fetch(`https://translate.googleapis.com/translate_a/single?${query}`, {
          signal: controller ? controller.signal : undefined
        });

        if (!response.ok) {
          throw new TranslationError(`Translate request failed: ${response.status}`, 'HTTP_ERROR');
        }

        let data;
        try {
          data = await response.json();
        } catch (error) {
          throw new TranslationError('Translate response JSON is invalid', 'INVALID_JSON', error);
        }

        if (scope && this.latestRequestByScope.get(scope) !== requestId) {
          throw new TranslationError('Translation request is stale', 'STALE');
        }

        const translated = data?.[0]?.map((part) => part?.[0]).join('') || '';
        this.setCache(key, translated);
        this.lastSuccessfulTranslation = translated;
        return translated;
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw new TranslationError('Translation request was cancelled', 'ABORTED', error);
        }
        if (error instanceof TranslationError) throw error;
        throw new TranslationError(error?.message || 'Translation failed', 'NETWORK_ERROR', error);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
        if (scope && this.controllers.get(scope) === controller) this.controllers.delete(scope);
      }
    }
  }

  return { TranslationService, TranslationError };
}));
