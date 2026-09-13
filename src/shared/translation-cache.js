'use strict';
(function (root) {
  // Only translation keys are owned by this cache; settings and dictionary stay untouched.
  const owns = key => key.startsWith('subtitle-translation:') || key.startsWith('ocr-norm-');
  class TranslationCache {
    constructor(storage, { maxEntries = 500, maxBytes = 1024 * 1024 } = {}) {
      this.storage = storage;
      this.maxEntries = maxEntries;
      this.maxBytes = maxBytes;
      this.entries = new Map();
      try {
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (key && owns(key)) this.entries.set(key, storage.getItem(key) || '');
        }
      } catch (_) { /* Storage can be unavailable in restricted profiles. */ }
      this.trim();
    }
    remove(key) {
      this.entries.delete(key);
      try { this.storage.removeItem(key); } catch (_) {}
    }
    trim() {
      let bytes = 0;
      for (const [key, value] of this.entries) bytes += 2 * (key.length + value.length);
      while (this.entries.size > this.maxEntries || bytes > this.maxBytes) {
        const [key, value] = this.entries.entries().next().value;
        bytes -= 2 * (key.length + value.length);
        this.remove(key);
      }
    }
    getItem(key) { return this.entries.get(key) || null; }
    setItem(key, value) {
      if (!owns(key) || typeof value !== 'string' || !value) return;
      this.entries.delete(key);
      this.entries.set(key, value);
      this.trim();
      if (!this.entries.has(key)) return;
      try { this.storage.setItem(key, value); } catch (_) {
        // Keep the bounded memory cache usable when browser quota is exhausted.
      }
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { TranslationCache };
  else root.TranslationCacheModule = { TranslationCache };
})(typeof globalThis !== 'undefined' ? globalThis : this);
